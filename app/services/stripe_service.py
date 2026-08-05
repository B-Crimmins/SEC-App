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
        """Schedule cancellation at the end of the current billing period."""
        try:
            subscription = stripe.Subscription.modify(
                subscription_id,
                cancel_at_period_end=True
            )
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
                'cancel_at_period_end': subscription.cancel_at_period_end,
                'current_period_start': period_start,
                'current_period_end': period_end,
            }
        except Exception as e:
            print(f"Error canceling subscription: {e}")
            raise

    def cancel_subscription_immediately(self, subscription_id: str) -> None:
        """Cancel a subscription immediately (e.g. abandoned incomplete checkout)."""
        try:
            stripe.Subscription.cancel(subscription_id)
        except Exception as e:
            print(f"Error immediately canceling subscription: {e}")
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

    @staticmethod
    def _last4_from_payment_method(payment_method: Any) -> Optional[str]:
        if payment_method is None:
            return None
        if isinstance(payment_method, str):
            payment_method = stripe.PaymentMethod.retrieve(payment_method)
        card = payment_method.get('card') if isinstance(payment_method, dict) else getattr(payment_method, 'card', None)
        if card is None:
            return None
        return card.get('last4') if isinstance(card, dict) else getattr(card, 'last4', None)

    def get_card_last4_from_payment_intent(self, payment_intent_id: str) -> Optional[str]:
        """Get card last4 from a succeeded payment intent."""
        try:
            payment_intent = stripe.PaymentIntent.retrieve(
                payment_intent_id,
                expand=['payment_method'],
            )
            return self._last4_from_payment_method(payment_intent.payment_method)
        except Exception as e:
            print(f"Error getting card last4 from payment intent: {e}")
            return None

    def get_card_last4_from_invoice(self, invoice_id: str) -> Optional[str]:
        """Get card last4 from a paid invoice."""
        try:
            invoice = stripe.Invoice.retrieve(
                invoice_id,
                expand=['payment_intent.payment_method'],
            )
            payment_intent = invoice.get('payment_intent') if isinstance(invoice, dict) else invoice.payment_intent
            if payment_intent is None:
                return None
            if isinstance(payment_intent, str):
                return self.get_card_last4_from_payment_intent(payment_intent)
            return self._last4_from_payment_method(
                payment_intent.get('payment_method')
                if isinstance(payment_intent, dict)
                else getattr(payment_intent, 'payment_method', None)
            )
        except Exception as e:
            print(f"Error getting card last4 from invoice: {e}")
            return None

    def get_card_last4_from_customer(self, customer_id: str) -> Optional[str]:
        """Get card last4 from a customer's default payment method."""
        try:
            customer = stripe.Customer.retrieve(
                customer_id,
                expand=['invoice_settings.default_payment_method'],
            )
            default_pm = customer.invoice_settings.default_payment_method
            return self._last4_from_payment_method(default_pm)
        except Exception as e:
            print(f"Error getting card last4 from customer: {e}")
            return None 