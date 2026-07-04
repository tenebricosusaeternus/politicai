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
    VTRACKER_TOKEN: str = ""
    VTRACKER_EMAIL: str = ""
    VTRACKER_SENHA: str = ""

    LLM_BASE_URL: str = "http://127.0.0.1:8080/v1"
    LLM_MODEL: str = "mlx-community/Qwen2.5-32B-Instruct-4bit"
    LLM_MODEL_FAST: str = ""
    LLM_MODEL_REASONING: str = ""
    LLM_MODEL_REPORT: str = ""
    LLM_ENABLE_THINKING_TAGS: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
