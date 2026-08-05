from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path
import os

# Resolve .env next to this file (app/.env) so alembic from repo root still loads it.
_APP_DIR = Path(__file__).resolve().parent
_DEFAULT_ENV_FILE = _APP_DIR / ".env"


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://postgres:qaz123@localhost:5432/TestDB"
    
    # Security — loaded from .env; app fails fast if missing.
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 300

    # OpenAI — loaded from .env.
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    
    
    # Stripe
    STRIPE_SECRET_KEY: Optional[str] = ""
    STRIPE_PUBLISHABLE_KEY: Optional[str] = ""
    STRIPE_WEBHOOK_SECRET: Optional[str] = ""
    STRIPE_PRICE_ID_PRO: Optional[str] = ""
    
    # Redis (for Celery)
    REDIS_URL: str = "redis://localhost:6379"
    
    # SEC API
    SEC_API_BASE_URL: str = "https://data.sec.gov"
    
    # Application
    APP_NAME: str = "SEC Financial Data Wrapper"
    DEBUG: bool = True
    
    # Rate Limiting
    FREE_TIER_LIMIT: int = 10
    PAID_TIER_LIMIT: int = 1000
    
    class Config:
        env_file = os.environ.get('ENV_FILE', str(_DEFAULT_ENV_FILE))
        case_sensitive = True
        env_prefix = ""


settings = Settings()
