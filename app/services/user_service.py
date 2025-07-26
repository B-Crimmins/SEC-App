from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from app.models.user import User, UserTier
from app.models.subscription import Subscription
from app.auth.auth import get_password_hash, verify_password
from app.config import settings


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
            tier=UserTier.FREE
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
    
    def update_user_tier(self, user_id: int, tier: UserTier) -> User:
        """Update user subscription tier"""
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        
        setattr(user, 'tier', tier.value)
        self.db.commit()
        self.db.refresh(user)
        
        return user
    
    def check_api_usage_limit(self, user_id: int) -> Dict[str, Any]:
        """Check if user has exceeded API usage limits"""
        user = self.get_user_by_id(user_id)
        if not user:
            raise ValueError("User not found")
        
        # Get user's current usage (this would need to be implemented with a usage tracking table)
        # For now, we'll use a simple approach
        current_usage = self._get_current_month_usage(user_id)
        
        if str(user.tier) == UserTier.FREE.value:
            limit = settings.FREE_TIER_LIMIT
        else:
            limit = settings.PAID_TIER_LIMIT
        
        return {
            'current_usage': current_usage,
            'limit': limit,
            'remaining': max(0, limit - current_usage),
            'exceeded': current_usage >= limit
        }
    
    def _get_current_month_usage(self, user_id: int) -> int:
        """Get current month API usage for user"""
        # This is a simplified implementation
        # In production, you'd want a separate usage tracking table
        from datetime import datetime, timedelta
        from app.models.financial_report import FinancialReport
        from app.models.analysis import Analysis
        
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
    
    def get_user_subscription(self, user_id: int) -> Optional[Subscription]:
        """Get user's subscription"""
        return self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
    
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
    
    def update_subscription_status(self, subscription_id: str, status: str) -> Optional[Subscription]:
        """Update subscription status"""
        subscription = self.db.query(Subscription).filter(
            Subscription.stripe_subscription_id == subscription_id
        ).first()
        
        if subscription:
            setattr(subscription, 'status', status)
            self.db.commit()
            self.db.refresh(subscription)
        
        return subscription 

