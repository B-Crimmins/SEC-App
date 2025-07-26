from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://bcrimmins:Lawson5t2b09!@localhost:5432/sec_db"
    
    # Security
    SECRET_KEY: str = "09d25e094faa6ca2556c818166b7a9563b93f7099f6f0f4caa6cf63b88e8d3e7"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # OpenAI
    OPENAI_API_KEY: Optional[str] = "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"
    
    # Stripe
    STRIPE_SECRET_KEY: Optional[str] = ""
    STRIPE_PUBLISHABLE_KEY: Optional[str] = ""
    STRIPE_WEBHOOK_SECRET: Optional[str] = ""
    
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
        env_file = ".env"
        case_sensitive = True
        env_prefix = ""


settings = Settings() 