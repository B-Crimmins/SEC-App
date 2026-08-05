from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import cast

from database import get_db
from auth.auth import get_current_active_user
from models.user import User
from models.feedback import Feedback
from schemas.feedback import FeedbackCreate, FeedbackResponse


router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse)
async def submit_feedback(
    payload: FeedbackCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Persist a feedback entry tied to the authenticated user."""
    entry = Feedback(
        user_id=cast(int, current_user.id),
        title=payload.title.strip(),
        description=payload.description.strip(),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
