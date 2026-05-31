from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    APP_NAME: str = "CFD Platform"
    DEBUG: bool = True
    
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "cfd_platform"
    
    UPLOAD_DIR: str = "./data/uploads"
    CASES_DIR: str = "./data/cases"
    RESULTS_DIR: str = "./data/results"
    
    OPENFOAM_ROOT: str = "/usr/lib/openfoam"
    OPENFOAM_VERSION: str = "openfoam2312"
    
    class Config:
        env_file = ".env"


settings = Settings()


def ensure_dirs():
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.CASES_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.RESULTS_DIR).mkdir(parents=True, exist_ok=True)
