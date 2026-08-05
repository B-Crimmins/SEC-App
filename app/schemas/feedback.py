from datetime import datetime
from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1)


class FeedbackResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: str
    created_at: datetime

    class Config:
        from_attributes = True
