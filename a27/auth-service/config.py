from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    app_name: str = "Auth Service"
    version: str = "1.0.0"
    
    database_url: str = "postgresql+asyncpg://admin:admin123@localhost:5432/collab_docs"
    redis_url: Optional[str] = "redis://localhost:6379"
    
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    
    grpc_port: int = 50051
    http_port: int = 8001
    
    class Config:
        env_file = ".env"

settings = Settings()
