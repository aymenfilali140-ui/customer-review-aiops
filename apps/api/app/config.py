from typing import Optional, Any, Dict
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Core
    database_url: str
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # Optional (safe to keep; not required)
    postgres_user: Optional[str] = None
    postgres_password: Optional[str] = None
    postgres_db: Optional[str] = None
    default_app_id: Optional[str] = None
    default_country: Optional[str] = None
    default_lang: Optional[str] = None

    # Ignore extra env vars so `.env` can have more keys
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )

settings = Settings()
