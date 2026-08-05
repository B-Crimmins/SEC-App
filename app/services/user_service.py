from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from models.user import User
from models.subscription import Subscription, SubscriptionStatus
from models.subscription_access import subscription_grants_pro
from auth.auth import get_password_hash, verify_password
from config import settings


def _stripe_status_to_enum(status: str) -> SubscriptionStatus:
    """Map Stripe subscription status strings to our enum."""
    normalized = (status or "").lower()
    mapping = {
        "incomplete": SubscriptionStatus.INCOMPLETE,
        "active": SubscriptionStatus.ACTIVE,
        "trialing": SubscriptionStatus.ACTIVE,
        "canceled": SubscriptionStatus.CANCELLED,
        "cancelled": SubscriptionStatus.CANCELLED,
        "past_due": SubscriptionStatus.PAST_DUE,
        "unpaid": SubscriptionStatus.UNPAID,
    }
    return mapping.get(normalized, SubscriptionStatus.INCOMPLETE)


def _stripe_ts_to_dt(ts: Optional[int]) -> Optional[datetime]:
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc)


class UserService:
    def __init__(self, db: Session):
        self.db = db
    
    def create_user(self, email: str, username: str, password: str) -> User:
        """Create a new user"""
        # Check if user already exists
        existing_user = self.db.query(User).filter(
            (User.email == email) | (User.username == username)
        ).first()
        
        if existing_user:
            raise ValueError("User with this email or username already exists")
        
        # Create new user
        hashed_password = get_password_hash(password)
        user = User(
            email=email,
            username=username,
            hashed_password=hashed_password,
        )
        
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        
        return user
    
    def authenticate_user(self, username_or_email: str, password: str) -> Optional[User]:
        """Authenticate a user by email or username"""
        # Try to find user by email first, then by username
        user = self.db.query(User).filter(
            (User.email == username_or_email) | (User.username == username_or_email)
        ).first()
        
        if not user:
            return None
        
        if not verify_password(password, str(user.hashed_password)):
            return None
        
        return user
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        return self.db.query(User).filter(User.email == email).first()
    
    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return self.db.query(User).filter(User.id == user_id).first()

    def update_user_card_last4(self, user_id: int, card_last4: str) -> User:
        """Store the last four digits of the user's payment card."""
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")

        setattr(user, 'card_last4', card_last4[-4:] if card_last4 else None)
        self.db.commit()
        self.db.refresh(user)

        return user

    def get_user_subscription(self, user_id: int) -> Optional[Subscription]:
        """Get user's subscription"""
        return self.db.query(Subscription).filter(Subscription.user_id == user_id).first()

    def user_has_pro_access(self, user_id: int) -> bool:
        """Pro entitlement is derived solely from the subscriptions table."""
        return subscription_grants_pro(self.get_user_subscription(user_id))
    
    def check_api_usage_limit(self, user_id: int) -> Dict[str, Any]:
        """Check if user has exceeded API usage limits"""
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        
        current_usage = self._get_current_month_usage(user_id)
        
        if self.user_has_pro_access(user_id):
            limit = settings.PAID_TIER_LIMIT
        else:
            limit = settings.FREE_TIER_LIMIT
        
        return {
            'current_usage': current_usage,
            'limit': limit,
            'remaining': max(0, limit - current_usage),
            'exceeded': current_usage >= limit,
            'is_pro': self.user_has_pro_access(user_id),
        }
    
    def _get_current_month_usage(self, user_id: int) -> int:
        """Get current month API usage for user"""
        from models.financial_report import FinancialReport
        from models.analysis import Analysis
        
        # Count financial reports and analyses created this month
        start_of_month = datetime.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        financial_reports_count = self.db.query(FinancialReport).filter(
            FinancialReport.user_id == user_id,
            FinancialReport.created_at >= start_of_month
        ).count()
        
        analyses_count = self.db.query(Analysis).filter(
            Analysis.user_id == user_id,
            Analysis.created_at >= start_of_month
        ).count()
        
        return financial_reports_count + analyses_count
    
    def create_subscription(self, user_id: int, stripe_subscription_id: str, stripe_customer_id: str) -> Subscription:
        """Create a subscription for a user"""
        subscription = Subscription(
            user_id=user_id,
            stripe_subscription_id=stripe_subscription_id,
            stripe_customer_id=stripe_customer_id
        )
        
        self.db.add(subscription)
        self.db.commit()
        self.db.refresh(subscription)
        
        return subscription
    
    def delete_subscription(self, subscription: Subscription) -> None:
        """Delete a subscription record from the database."""
        self.db.delete(subscription)
        self.db.commit()

    def update_subscription_status(self, subscription_id: str, status: str) -> Optional[Subscription]:
        """Update subscription status"""
        subscription = self.db.query(Subscription).filter(
            Subscription.stripe_subscription_id == subscription_id
        ).first()

        if subscription:
            setattr(subscription, 'status', _stripe_status_to_enum(status))
            self.db.commit()
            self.db.refresh(subscription)

        return subscription

    def sync_subscription_from_stripe(
        self,
        stripe_subscription_id: str,
        stripe_data: Dict[str, Any],
    ) -> Optional[Subscription]:
        """Sync local subscription fields from a Stripe subscription payload."""
        subscription = self.db.query(Subscription).filter(
            Subscription.stripe_subscription_id == stripe_subscription_id
        ).first()

        if not subscription:
            return None

        status = stripe_data.get('status')
        if status:
            setattr(subscription, 'status', _stripe_status_to_enum(status))

        period_start = stripe_data.get('current_period_start')
        period_end = stripe_data.get('current_period_end')
        if period_start is not None:
            setattr(subscription, 'current_period_start', _stripe_ts_to_dt(period_start))
        if period_end is not None:
            setattr(subscription, 'current_period_end', _stripe_ts_to_dt(period_end))

        self.db.commit()
        self.db.refresh(subscription)
        return subscription
