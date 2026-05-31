import os
from pathlib import Path
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/seismic_sim"
    HDF5_STORAGE_PATH: str = "./data/hdf5"
    MAX_WORKERS: int = 4
    SIMULATION_TIMEOUT: int = 3600

    class Config:
        env_file = ".env"

    @property
    def hdf5_path(self) -> Path:
        path = Path(self.HDF5_STORAGE_PATH)
        path.mkdir(parents=True, exist_ok=True)
        return path


settings = Settings()
