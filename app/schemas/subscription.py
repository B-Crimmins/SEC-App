from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.subscription import SubscriptionStatus


class SubscriptionBase(BaseModel):
    pass


class SubscriptionCreate(SubscriptionBase):
    stripe_price_id: str


class SubscriptionResponse(SubscriptionBase):
    id: int
    user_id: int
    stripe_subscription_id: Optional[str]
    stripe_customer_id: Optional[str]
    status: SubscriptionStatus
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    created_at: datetime
    
    class Config:
        from_attributes = True


class SubscriptionCancel(BaseModel):
    subscription_id: int 