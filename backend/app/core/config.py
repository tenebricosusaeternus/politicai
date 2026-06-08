from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    REDIS_URL: str = "redis://localhost:6379/0"

    ANTHROPIC_API_KEY: str = ""
    VTRACKER_API_KEY: str = ""
    VTRACKER_BASE_URL: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
