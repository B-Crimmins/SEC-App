import stripe
from typing import Dict, Any, Optional
from config import settings


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
            )

            # Stripe API 2025-03-31+ replaced invoice.payment_intent with
            # invoice.confirmation_secret for Payment Element / subscription flows.
            client_secret = None
            invoice_ref = subscription['latest_invoice']
            invoice_id = invoice_ref if isinstance(invoice_ref, str) else invoice_ref.get('id')
            if invoice_id:
                invoice = stripe.Invoice.retrieve(invoice_id, expand=['confirmation_secret'])
                try:
                    cs = invoice['confirmation_secret']
                    client_secret = cs.get('client_secret') if isinstance(cs, dict) else getattr(cs, 'client_secret', None)
                except (KeyError, TypeError):
                    client_secret = None
            
            # current_period_start/end moved to items in Stripe API 2024-09-30+.
            # Use subscript access to avoid collision with dict.items() builtin.
            try:
                item = subscription['items']['data'][0]
                period_start = item.get('current_period_start')
                period_end = item.get('current_period_end')
            except (KeyError, IndexError, TypeError):
                period_start = None
                period_end = None

            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_start': period_start,
                'current_period_end': period_end,
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
            try:
                item = subscription['items']['data'][0]
                period_start = item.get('current_period_start')
                period_end = item.get('current_period_end')
            except (KeyError, IndexError, TypeError):
                period_start = None
                period_end = None

            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_start': period_start,
                'current_period_end': period_end,
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