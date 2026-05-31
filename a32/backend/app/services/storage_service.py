import os
import tempfile
from typing import Optional, List
from minio import Minio
from minio.error import S3Error

from ..config import get_settings


settings = get_settings()


class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_HOST,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self.bucket = settings.MINIO_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self):
        if not self.client.bucket_exists(self.bucket):
            self.client.make_bucket(self.bucket)

    def upload_file(self, object_name: str, file_path: str, content_type: str = "application/octet-stream") -> str:
        self.client.fput_object(
            bucket_name=self.bucket,
            object_name=object_name,
            file_path=file_path,
            content_type=content_type,
        )
        return object_name

    def download_file(self, object_name: str, file_path: Optional[str] = None) -> str:
        if file_path is None:
            temp_dir = tempfile.gettempdir()
            file_path = os.path.join(temp_dir, os.path.basename(object_name))

        self.client.fget_object(
            bucket_name=self.bucket,
            object_name=object_name,
            file_path=file_path,
        )
        return file_path

    def get_object_as_bytes(self, object_name: str) -> bytes:
        response = self.client.get_object(self.bucket, object_name)
        data = response.read()
        response.close()
        return data

    def delete_object(self, object_name: str):
        self.client.remove_object(self.bucket, object_name)

    def object_exists(self, object_name: str) -> bool:
        try:
            self.client.stat_object(self.bucket, object_name)
            return True
        except S3Error:
            return False

    def list_objects(self, prefix: str = "") -> List[dict]:
        objects = self.client.list_objects(self.bucket, prefix=prefix)
        return [
            {
                "name": obj.object_name,
                "size": obj.size,
                "last_modified": obj.last_modified,
            }
            for obj in objects
        ]

    def get_local_path(self, object_name: str) -> str:
        temp_dir = tempfile.gettempdir()
        return os.path.join(temp_dir, object_name.replace("/", "_"))


def get_storage_service() -> StorageService:
    return StorageService()
