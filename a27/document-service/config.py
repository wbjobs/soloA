from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    app_name: str = "Document Service"
    version: str = "1.0.0"
    
    database_url: str = "postgresql+asyncpg://admin:admin123@localhost:5432/collab_docs"
    auth_grpc_url: str = "localhost:50051"
    
    grpc_port: int = 50052
    http_port: int = 8002
    
    class Config:
        env_file = ".env"

settings = Settings()
