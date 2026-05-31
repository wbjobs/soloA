from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "Molecular Dynamics Visualization Platform"
    debug: bool = True
    
    base_dir: Path = Path(__file__).resolve().parent.parent
    data_dir: Path = base_dir / "data"
    upload_dir: Path = data_dir / "uploads"
    db_path: Path = data_dir / "mdvis.db"
    
    database_url: str = "sqlite:///./data/mdvis.db"
    
    max_file_size: int = 500 * 1024 * 1024
    
    class Config:
        env_file = ".env"


settings = Settings()


def ensure_directories():
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
