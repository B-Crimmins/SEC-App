from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.orm import Session
from typing import Dict, Any, cast, Optional
from app.database import get_db
from app.auth.auth import get_current_active_user
from app.services.stripe_service import StripeService
from app.services.user_service import UserService
from app.models.user import User, UserTier
from app.schemas.subscription import SubscriptionCreate, SubscriptionResponse, SubscriptionCancel
import stripe
from app.config import settings

# Initialize Stripe
if settings.STRIPE_SECRET_KEY:
    stripe.api_key = settings.STRIPE_SECRET_KEY

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"])


@router.post("/create", response_model=Dict[str, Any])
async def create_subscription(
    subscription_data: SubscriptionCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new subscription"""
    try:
        stripe_service = StripeService()
        user_service = UserService(db)
        
        # Check if user already has a subscription
        user_id = cast(int, current_user.id)
        existing_subscription = user_service.get_user_subscription(user_id)
        if existing_subscription:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already has an active subscription"
            )
        
        # Create Stripe customer if doesn't exist
        customer_data = stripe_service.create_customer(
            email=str(current_user.email),
            name=str(current_user.username)
        )
        
        # Create subscription
        subscription_data_stripe = stripe_service.create_subscription(
            customer_id=customer_data['customer_id'],
            price_id=subscription_data.stripe_price_id
        )
        
        # Create subscription record in database
        subscription = user_service.create_subscription(
            user_id=user_id,
            stripe_subscription_id=subscription_data_stripe['subscription_id'],
            stripe_customer_id=customer_data['customer_id']
        )
        
        # Update user tier to paid
        user_service.update_user_tier(user_id, UserTier.PAID)
        
        return {
            "subscription_id": subscription.id,
            "stripe_subscription_id": subscription.stripe_subscription_id,
            "client_secret": subscription_data_stripe['client_secret'],
            "status": subscription.status.value
        }
        
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
    """Cancel subscription"""
    try:
        stripe_service = StripeService()
        user_service = UserService(db)
        
        # Get subscription
        user_id = cast(int, current_user.id)
        subscription = user_service.get_user_subscription(user_id)
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No subscription found for user"
            )
        
        # Cancel in Stripe
        stripe_service.cancel_subscription(str(subscription.stripe_subscription_id))
        
        # Update in database
        user_service.update_subscription_status(str(subscription.stripe_subscription_id), "cancelled")
        
        # Update user tier back to free
        user_service.update_user_tier(user_id, UserTier.FREE)
        
        return {"message": "Subscription cancelled successfully"}
        
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
    """Get user's subscription status"""
    try:
        user_service = UserService(db)
        user_id = cast(int, current_user.id)
        
        # Get user's subscription
        subscription = user_service.get_user_subscription(user_id)
        
        if not subscription:
            return {
                "has_subscription": False,
                "tier": current_user.tier.value,
                "subscription": None
            }
        
        # Get subscription details from Stripe
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
    """Get user's API usage information"""
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
    stripe_signature: Optional[str] = Header(None)
):
    """Handle Stripe webhook events"""
    try:
        # Get the raw body
        body = await request.body()
        
        # For now, we'll handle webhooks without signature verification
        # In production, you should implement proper signature verification
        if not settings.STRIPE_WEBHOOK_SECRET:
            raise HTTPException(status_code=400, detail="Webhook secret not configured")
        
        # Parse the event (in production, verify signature)
        import json
        event = json.loads(body)
        
        # Handle the event
        user_service = UserService(db)
        
        if event['type'] == 'customer.subscription.created':
            subscription = event['data']['object']
            # Update subscription status in database
            user_service.update_subscription_status(
                subscription['id'], 
                subscription['status']
            )
            
        elif event['type'] == 'customer.subscription.updated':
            subscription = event['data']['object']
            # Update subscription status in database
            user_service.update_subscription_status(
                subscription['id'], 
                subscription['status']
            )
            
        elif event['type'] == 'customer.subscription.deleted':
            subscription = event['data']['object']
            # Handle subscription cancellation
            user_service.update_subscription_status(
                subscription['id'], 
                'cancelled'
            )
            
        elif event['type'] == 'invoice.payment_succeeded':
            invoice = event['data']['object']
            # Handle successful payment
            if invoice['subscription']:
                user_service.update_subscription_status(
                    invoice['subscription'], 
                    'active'
                )
                
        elif event['type'] == 'invoice.payment_failed':
            invoice = event['data']['object']
            # Handle failed payment
            if invoice['subscription']:
                user_service.update_subscription_status(
                    invoice['subscription'], 
                    'past_due'
                )
        
        return {"status": "success"}
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Webhook error: {str(e)}"
        )


@router.post("/payment-success")
async def payment_success(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Handle successful payment confirmation"""
    try:
        data = await request.json()
        payment_intent_id = data.get('payment_intent_id')
        
        if not payment_intent_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment intent ID is required"
            )
        
        # Verify payment with Stripe
        stripe_service = StripeService()
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        
        if payment_intent.status == 'succeeded':
            # Update user tier to paid
            user_service = UserService(db)
            user_id = cast(int, current_user.id)
            user_service.update_user_tier(user_id, UserTier.PAID)
            
            return {"message": "Payment confirmed successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Payment not successful"
            )
            
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error confirming payment: {str(e)}"
        ) 