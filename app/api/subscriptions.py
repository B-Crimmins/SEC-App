from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session
from typing import Dict, Any, cast, Optional
from database import get_db
from auth.auth import get_current_active_user
from services.stripe_service import StripeService
from services.user_service import UserService, _stripe_ts_to_dt
from models.user import User
from models.subscription_access import subscription_grants_pro
from schemas.subscription import SubscriptionCreate, SubscriptionResponse, SubscriptionCancel
import stripe
from config import settings

if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


def _save_card_last4_for_user(
    user_service: UserService,
    stripe_service: StripeService,
    user_id: int,
    *,
    payment_intent_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> None:
    """Persist card last4 on the user when payment details are available."""
    last4 = None
    if payment_intent_id:
        last4 = stripe_service.get_card_last4_from_payment_intent(payment_intent_id)
    if not last4 and invoice_id:
        last4 = stripe_service.get_card_last4_from_invoice(invoice_id)
    if not last4 and customer_id:
        last4 = stripe_service.get_card_last4_from_customer(customer_id)
    if last4:
        user_service.update_user_card_last4(user_id, last4)


def _subscription_payload(subscription, stripe_subscription: Dict[str, Any]) -> Dict[str, Any]:
    period_end = subscription.current_period_end or _stripe_ts_to_dt(
        stripe_subscription.get('current_period_end')
    )
    period_start = subscription.current_period_start or _stripe_ts_to_dt(
        stripe_subscription.get('current_period_start')
    )
    return {
        "id": subscription.id,
        "stripe_subscription_id": subscription.stripe_subscription_id,
        "status": subscription.status.value,
        "current_period_start": period_start.isoformat() if period_start else None,
        "current_period_end": period_end.isoformat() if period_end else None,
        "stripe_status": stripe_subscription.get('status'),
        "cancel_at_period_end": stripe_subscription.get('cancel_at_period_end', False),
    }


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
            if subscription_grants_pro(existing_subscription):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="User already has an active subscription"
                )
            # Incomplete / cancelled / unpaid — clear the old row (and Stripe sub if needed)
            # so the user can start a new checkout.
            try:
                if existing_subscription.stripe_subscription_id:
                    stripe_service.cancel_subscription_immediately(
                        str(existing_subscription.stripe_subscription_id)
                    )
            except Exception:
                pass
            user_service.delete_subscription(existing_subscription)

        customer_data = stripe_service.create_customer(
            email=str(current_user.email),
            name=str(current_user.username)
        )

        subscription_data_stripe = stripe_service.create_subscription(
            customer_id=customer_data['customer_id'],
            price_id=subscription_data.stripe_price_id
        )

        # Record subscription in DB — status stays incomplete until payment succeeds.
        # Pro access is granted when status becomes active (webhook / payment-success).
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

        if subscription.id != cancel_data.subscription_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Subscription does not belong to this user"
            )

        stripe_subscription = stripe_service.get_subscription(str(subscription.stripe_subscription_id))
        if stripe_subscription.get('cancel_at_period_end'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subscription is already set to cancel at period end"
            )

        cancelled = stripe_service.cancel_subscription(str(subscription.stripe_subscription_id))
        subscription = user_service.sync_subscription_from_stripe(
            str(subscription.stripe_subscription_id),
            cancelled,
        )

        period_end = subscription.current_period_end if subscription else _stripe_ts_to_dt(
            cancelled.get('current_period_end')
        )

        return {
            "message": "Subscription will cancel at the end of the billing period",
            "cancel_at_period_end": True,
            "current_period_end": period_end.isoformat() if period_end else None,
        }

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
    """Get user's subscription status. Pro access is derived from subscriptions.status."""
    try:
        user_service = UserService(db)
        user_id = cast(int, current_user.id)
        subscription = user_service.get_user_subscription(user_id)

        if not subscription:
            return {
                "has_subscription": False,
                "is_pro": False,
                "subscription": None
            }

        stripe_service = StripeService()
        stripe_subscription = stripe_service.get_subscription(str(subscription.stripe_subscription_id))
        subscription = user_service.sync_subscription_from_stripe(
            str(subscription.stripe_subscription_id),
            stripe_subscription,
        )

        if not current_user.card_last4 and subscription.stripe_customer_id:
            _save_card_last4_for_user(
                user_service,
                stripe_service,
                user_id,
                customer_id=str(subscription.stripe_customer_id),
            )
            current_user = user_service.get_user_by_id(user_id) or current_user

        return {
            "has_subscription": True,
            "is_pro": subscription_grants_pro(subscription),
            "subscription": _subscription_payload(subscription, stripe_subscription),
            "card_last4": current_user.card_last4,
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
        "is_pro": usage['is_pro'],
    }


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: Session = Depends(get_db),
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature")
):
    """Handle Stripe webhook events. Entitlement follows subscriptions.status only."""
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
            stripe_service = StripeService()
            stripe_data = stripe_service.get_subscription(sub['id'])
            user_service.sync_subscription_from_stripe(sub['id'], stripe_data)

        elif event['type'] == 'customer.subscription.deleted':
            sub = event['data']['object']
            user_service.update_subscription_status(sub['id'], 'cancelled')

        elif event['type'] == 'invoice.payment_succeeded':
            invoice = event['data']['object']
            stripe_sub_id = invoice.get('subscription')
            if stripe_sub_id:
                stripe_service = StripeService()
                stripe_data = stripe_service.get_subscription(stripe_sub_id)
                subscription = user_service.sync_subscription_from_stripe(stripe_sub_id, stripe_data)
                if subscription:
                    user_id = cast(int, subscription.user_id)
                    _save_card_last4_for_user(
                        user_service,
                        stripe_service,
                        user_id,
                        payment_intent_id=invoice.get('payment_intent'),
                        invoice_id=invoice.get('id'),
                        customer_id=str(subscription.stripe_customer_id),
                    )

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
    The webhook is the authoritative path; this marks the local subscription
    active when the webhook has not yet fired.
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
            subscription = user_service.get_user_subscription(user_id)
            if subscription:
                user_service.update_subscription_status(
                    str(subscription.stripe_subscription_id),
                    'active',
                )
            stripe_service = StripeService()
            _save_card_last4_for_user(
                user_service,
                stripe_service,
                user_id,
                payment_intent_id=payment_intent_id,
            )
            return {"message": "Payment confirmed", "is_pro": True}
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment not yet succeeded")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error confirming payment: {str(e)}"
        )
