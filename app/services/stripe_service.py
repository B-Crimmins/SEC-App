import stripe
from typing import Dict, Any, Optional
from app.config import settings


class StripeService:
    def __init__(self):
        if settings.STRIPE_SECRET_KEY:
            stripe.api_key = settings.STRIPE_SECRET_KEY
        else:
            raise ValueError("Stripe secret key not configured")
    
    def create_customer(self, email: str, name: str) -> Dict[str, Any]:
        """Create a Stripe customer"""
        try:
            customer = stripe.Customer.create(
                email=email,
                name=name
            )
            return {
                'customer_id': customer.id,
                'email': customer.email,
                'name': customer.name
            }
        except Exception as e:
            print(f"Error creating Stripe customer: {e}")
            raise
    
    def create_subscription(self, customer_id: str, price_id: str) -> Dict[str, Any]:
        """Create a subscription for a customer"""
        try:
            subscription = stripe.Subscription.create(
                customer=customer_id,
                items=[{'price': price_id}],
                payment_behavior='default_incomplete',
                expand=['latest_invoice.payment_intent']
            )
            
            client_secret = None
            try:
                latest_invoice = subscription.latest_invoice  # type: ignore
                if (latest_invoice and 
                    hasattr(latest_invoice, 'payment_intent') and 
                    latest_invoice.payment_intent):
                    payment_intent = latest_invoice.payment_intent  # type: ignore
                    if hasattr(payment_intent, 'client_secret'):
                        client_secret = payment_intent.client_secret  # type: ignore
            except AttributeError:
                pass
            
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_start': subscription.current_period_start,
                'current_period_end': subscription.current_period_end,
                'client_secret': client_secret
            }
        except Exception as e:
            print(f"Error creating subscription: {e}")
            raise
    
    def cancel_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Cancel a subscription"""
        try:
            subscription = stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'cancel_at_period_end': subscription.cancel_at_period_end
            }
        except Exception as e:
            print(f"Error canceling subscription: {e}")
            raise
    
    def get_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """Get subscription details"""
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_start': subscription.current_period_start,
                'current_period_end': subscription.current_period_end,
                'cancel_at_period_end': subscription.cancel_at_period_end
            }
        except Exception as e:
            print(f"Error getting subscription: {e}")
            raise
    
    def create_payment_intent(self, amount: int, currency: str = 'usd', customer_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a payment intent"""
        try:
            intent_params = {
                'amount': amount,
                'currency': currency
            }
            if customer_id:
                intent_params['customer'] = customer_id
            
            intent = stripe.PaymentIntent.create(**intent_params)
            return {
                'client_secret': intent.client_secret,
                'payment_intent_id': intent.id
            }
        except Exception as e:
            print(f"Error creating payment intent: {e}")
            raise
    
    def get_customer(self, customer_id: str) -> Dict[str, Any]:
        """Get customer details"""
        try:
            customer = stripe.Customer.retrieve(customer_id)
            return {
                'customer_id': customer.id,
                'email': customer.email,
                'name': customer.name
            }
        except Exception as e:
            print(f"Error getting customer: {e}")
            raise 