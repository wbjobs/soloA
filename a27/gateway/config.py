from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    app_name: str = "API Gateway"
    version: str = "1.0.0"
    
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    
    rate_limit_per_minute: int = 60
    rate_limit_window: int = 60
    
    auth_grpc_url: str = "localhost:50051"
    document_grpc_url: str = "localhost:50052"
    crdt_grpc_url: str = "localhost:50053"
    version_grpc_url: str = "localhost:50054"
    
    auth_service_url: str = "http://localhost:8001"
    document_service_url: str = "http://localhost:8002"
    crdt_service_url: str = "http://localhost:8003"
    version_service_url: str = "http://localhost:8004"
    
    redis_url: Optional[str] = None
    
    class Config:
        env_file = ".env"

settings = Settings()
