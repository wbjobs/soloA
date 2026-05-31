from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    app_name: str = "CRDT Service"
    version: str = "1.0.0"
    
    redis_url: str = "redis://localhost:6379"
    version_grpc_url: str = "localhost:50054"
    
    snapshot_interval: int = 10
    snapshot_ttl: int = 86400
    
    grpc_port: int = 50053
    http_port: int = 8003
    
    class Config:
        env_file = ".env"

settings = Settings()
