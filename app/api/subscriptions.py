from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session
from typing import Dict, Any, cast, Optional
from database import get_db
from auth.auth import get_current_active_user
from services.stripe_service import StripeService
from services.user_service import UserService
from models.user import User, UserTier
from models.subscription import SubscriptionStatus
from schemas.subscription import SubscriptionCreate, SubscriptionResponse, SubscriptionCancel
import stripe
from config import settings

if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.post("/create", response_model=Dict[str, Any])
async def create_subscription(
    subscription_data: SubscriptionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new subscription and return a client_secret to confirm payment on the frontend."""
    try:
        stripe_service = StripeService()
        user_service = UserService(db)

        user_id = cast(int, current_user.id)
        existing_subscription = user_service.get_user_subscription(user_id)
        if existing_subscription:
            if existing_subscription.status == SubscriptionStatus.INCOMPLETE:
                # Abandoned checkout — cancel the dangling Stripe subscription and
                # remove the DB record so the user can start fresh.
                try:
                    stripe_service.cancel_subscription(str(existing_subscription.stripe_subscription_id))
                except Exception:
                    pass
                user_service.delete_subscription(existing_subscription)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User already has an active subscription"
                )

        customer_data = stripe_service.create_customer(
            email=str(current_user.email),
            name=str(current_user.username)
        )

        subscription_data_stripe = stripe_service.create_subscription(
            customer_id=customer_data['customer_id'],
            price_id=subscription_data.stripe_price_id
        )

        # Record subscription in DB — status stays incomplete until payment succeeds.
        # User tier is updated by the webhook (invoice.payment_succeeded), not here.
        user_service.create_subscription(
            user_id=user_id,
            stripe_subscription_id=subscription_data_stripe['subscription_id'],
            stripe_customer_id=customer_data['customer_id']
        )

        return {
            "subscription_id": subscription_data_stripe['subscription_id'],
            "client_secret": subscription_data_stripe['client_secret'],
            "status": subscription_data_stripe['status'],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating subscription: {str(e)}"
        )


@router.post("/cancel")
async def cancel_subscription(
    cancel_data: SubscriptionCancel,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Cancel subscription at the end of the current billing period."""
    try:
        stripe_service = StripeService()
        user_service = UserService(db)

        user_id = cast(int, current_user.id)
        subscription = user_service.get_user_subscription(user_id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No subscription found for user"
            )

        stripe_service.cancel_subscription(str(subscription.stripe_subscription_id))
        user_service.update_subscription_status(str(subscription.stripe_subscription_id), "cancelled")
        user_service.update_user_tier(user_id, UserTier.FREE)

        return {"message": "Subscription cancelled successfully"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cancelling subscription: {str(e)}"
        )


@router.get("/status")
async def get_subscription_status(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user's subscription status."""
    try:
        user_service = UserService(db)
        user_id = cast(int, current_user.id)
        subscription = user_service.get_user_subscription(user_id)

        if not subscription:
            return {
                "has_subscription": False,
                "tier": current_user.tier.value,
                "subscription": None
            }

        stripe_service = StripeService()
        stripe_subscription = stripe_service.get_subscription(str(subscription.stripe_subscription_id))

        return {
            "has_subscription": True,
            "tier": current_user.tier.value,
            "subscription": {
                "id": subscription.id,
                "stripe_subscription_id": subscription.stripe_subscription_id,
                "status": subscription.status.value,
                "current_period_start": subscription.current_period_start,
                "current_period_end": subscription.current_period_end,
                "stripe_status": stripe_subscription.get('status'),
                "cancel_at_period_end": stripe_subscription.get('cancel_at_period_end', False)
            }
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error getting subscription status: {str(e)}"
        )


@router.get("/usage")
async def get_usage_info(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get user's API usage information."""
    user_service = UserService(db)
    user_id = cast(int, current_user.id)
    usage = user_service.check_api_usage_limit(user_id)

    return {
        "current_usage": usage['current_usage'],
        "limit": usage['limit'],
        "remaining": usage['remaining'],
        "exceeded": usage['exceeded'],
        "tier": current_user.tier.value
    }


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature")
):
    """Handle Stripe webhook events."""
    body = await request.body()

    if not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=400, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(
            body, stripe_signature, settings.STRIPE_WEBHOOK_SECRET
        )
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook parse error: {str(e)}")

    user_service = UserService(db)

    try:
        if event['type'] == 'customer.subscription.updated':
            sub = event['data']['object']
            user_service.update_subscription_status(sub['id'], sub['status'])

        elif event['type'] == 'customer.subscription.deleted':
            sub = event['data']['object']
            subscription = user_service.update_subscription_status(sub['id'], 'cancelled')
            if subscription:
                user_service.update_user_tier(cast(int, subscription.user_id), UserTier.FREE)

        elif event['type'] == 'invoice.payment_succeeded':
            invoice = event['data']['object']
            stripe_sub_id = invoice.get('subscription')
            if stripe_sub_id:
                subscription = user_service.update_subscription_status(stripe_sub_id, 'active')
                if subscription:
                    user_service.update_user_tier(cast(int, subscription.user_id), UserTier.PAID)

        elif event['type'] == 'invoice.payment_failed':
            invoice = event['data']['object']
            stripe_sub_id = invoice.get('subscription')
            if stripe_sub_id:
                user_service.update_subscription_status(stripe_sub_id, 'past_due')

    except Exception as e:
        # Log but don't fail — Stripe retries on non-2xx
        print(f"Webhook handler error: {e}")

    return {"status": "success"}


@router.post("/payment-success")
async def payment_success(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Fallback endpoint called by frontend after confirmPayment succeeds.
    The webhook is the authoritative path; this handles cases where the webhook
    fires after the user returns to the app.
    """
    try:
        data = await request.json()
        payment_intent_id = data.get('payment_intent_id')

        if not payment_intent_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="payment_intent_id required")

        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)

        if payment_intent.status == 'succeeded':
            user_service = UserService(db)
            user_id = cast(int, current_user.id)
            user_service.update_user_tier(user_id, UserTier.PAID)
            return {"message": "Payment confirmed"}
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment not yet succeeded")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error confirming payment: {str(e)}"
        )
