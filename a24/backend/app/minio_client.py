from minio import Minio
from minio.error import S3Error
from .config import settings


def get_minio_client():
    client = Minio(
        settings.MINIO_ENDPOINT,
        access_key=settings.MINIO_ACCESS_KEY,
        secret_key=settings.MINIO_SECRET_KEY,
        secure=settings.MINIO_SECURE
    )
    return client


def ensure_bucket():
    client = get_minio_client()
    if not client.bucket_exists(settings.DICOM_BUCKET):
        client.make_bucket(settings.DICOM_BUCKET)
