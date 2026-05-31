from minio import Minio
from minio.error import S3Error
from io import BytesIO
from typing import Optional
from ..config import settings


class StorageService:
    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure
        )
        self.bucket_name = settings.minio_bucket_name
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self):
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
        except S3Error as e:
            print(f"MinIO bucket error: {e}")

    def upload_file(self, file_path: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        try:
            self.client.put_object(
                self.bucket_name,
                file_path,
                data=BytesIO(data),
                length=len(data),
                content_type=content_type
            )
            return file_path
        except S3Error as e:
            raise Exception(f"Failed to upload file: {e}")

    def download_file(self, file_path: str) -> bytes:
        try:
            response = self.client.get_object(self.bucket_name, file_path)
            return response.read()
        except S3Error as e:
            raise Exception(f"Failed to download file: {e}")

    def get_presigned_url(self, file_path: str, expires: int = 3600) -> Optional[str]:
        try:
            return self.client.presigned_get_object(self.bucket_name, file_path, expires=expires)
        except S3Error:
            return None

    def delete_file(self, file_path: str):
        try:
            self.client.remove_object(self.bucket_name, file_path)
        except S3Error as e:
            raise Exception(f"Failed to delete file: {e}")


def get_storage_service():
    return StorageService()
