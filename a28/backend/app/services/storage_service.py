import io
import uuid
from typing import Optional, Dict, Any, List
from minio import Minio
from minio.error import S3Error
from fastapi import UploadFile
from app.core.config import settings


class MinioStorageService:
    def __init__(self):
        self.client = Minio(
            settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self.bucket = settings.MINIO_BUCKET
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except S3Error as e:
            raise RuntimeError(f"Failed to initialize MinIO bucket: {e}")

    def _generate_object_name(self, prefix: str, filename: str) -> str:
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        uid = uuid.uuid4().hex
        if ext:
            return f"{prefix}/{uid}.{ext}"
        return f"{prefix}/{uid}"

    async def upload_file(
        self,
        file: UploadFile,
        prefix: str = "uploads",
    ) -> Dict[str, Any]:
        contents = await file.read()
        size = len(contents)
        object_name = self._generate_object_name(prefix, file.filename or "file")

        self.client.put_object(
            self.bucket,
            object_name,
            io.BytesIO(contents),
            size,
            content_type=file.content_type or "application/octet-stream",
        )

        return {
            "object_name": object_name,
            "filename": file.filename,
            "file_size": size,
            "file_type": file.content_type,
        }

    def upload_bytes(
        self,
        data: bytes,
        filename: str,
        prefix: str = "uploads",
        content_type: str = "application/octet-stream",
    ) -> Dict[str, Any]:
        object_name = self._generate_object_name(prefix, filename)
        size = len(data)

        self.client.put_object(
            self.bucket,
            object_name,
            io.BytesIO(data),
            size,
            content_type=content_type,
        )

        return {
            "object_name": object_name,
            "filename": filename,
            "file_size": size,
            "file_type": content_type,
        }

    def upload_json(
        self,
        data: Any,
        filename: str,
        prefix: str = "models",
    ) -> Dict[str, Any]:
        import json

        json_bytes = json.dumps(data, indent=2).encode("utf-8")
        return self.upload_bytes(
            json_bytes,
            filename,
            prefix,
            content_type="application/json",
        )

    def download_file(self, object_name: str) -> bytes:
        try:
            response = self.client.get_object(self.bucket, object_name)
            data = response.read()
            response.close()
            response.release_conn()
            return data
        except S3Error:
            return b""

    def get_file_url(self, object_name: str, expires: int = 3600) -> Optional[str]:
        try:
            return self.client.presigned_get_object(self.bucket, object_name, expires=expires)
        except S3Error:
            return None

    def delete_file(self, object_name: str) -> bool:
        try:
            self.client.remove_object(self.bucket, object_name)
            return True
        except S3Error:
            return False

    def list_files(self, prefix: str = "") -> List[Dict[str, Any]]:
        try:
            objects = self.client.list_objects(self.bucket, prefix=prefix, recursive=True)
            return [
                {
                    "object_name": obj.object_name,
                    "size": obj.size,
                    "last_modified": obj.last_modified.isoformat() if obj.last_modified else None,
                }
                for obj in objects
            ]
        except S3Error:
            return []


storage_service = MinioStorageService()


def get_storage_service() -> MinioStorageService:
    return storage_service
