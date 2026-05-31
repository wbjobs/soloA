from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    app_name: str = "Version Service"
    version: str = "1.0.0"
    
    database_url: str = "postgresql+asyncpg://admin:admin123@localhost:5432/collab_docs"
    
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin123"
    minio_bucket: str = "document-versions"
    minio_secure: bool = False
    
    elasticsearch_url: str = "http://localhost:9200"
    
    grpc_port: int = 50054
    http_port: int = 8004
    
    class Config:
        env_file = ".env"

settings = Settings()
