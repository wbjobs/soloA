import io
import json
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from config import settings

try:
    from minio import Minio
    from minio.error import S3Error
    MINIO_AVAILABLE = True
except ImportError:
    MINIO_AVAILABLE = False

class MinioStorage:
    def __init__(self):
        self.client: Optional[Minio] = None
        self._initialized = False
    
    async def init_bucket(self) -> bool:
        if not MINIO_AVAILABLE:
            print("MinIO SDK not available, using in-memory fallback")
            return False
        
        try:
            self.client = Minio(
                settings.minio_endpoint,
                access_key=settings.minio_access_key,
                secret_key=settings.minio_secret_key,
                secure=settings.minio_secure
            )
            
            if not self.client.bucket_exists(settings.minio_bucket):
                self.client.make_bucket(settings.minio_bucket)
            
            self._initialized = True
            print(f"MinIO bucket '{settings.minio_bucket}' initialized")
            return True
        except Exception as e:
            print(f"Failed to initialize MinIO: {e}, using in-memory fallback")
            self._in_memory: Dict[str, bytes] = {}
            return False
    
    def _get_object_name(self, document_id: str, version: int) -> str:
        return f"{document_id}/v{version}/snapshot.json"
    
    async def save_snapshot(
        self,
        document_id: str,
        version: int,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> tuple:
        if self._initialized and self.client:
            try:
                object_name = self._get_object_name(document_id, version)
                content_bytes = content.encode('utf-8')
                
                metadata_dict = {
                    "document-id": document_id,
                    "version": str(version),
                    "created-at": datetime.utcnow().isoformat()
                }
                if metadata:
                    for k, v in metadata.items():
                        metadata_dict[k] = str(v)
                
                self.client.put_object(
                    bucket_name=settings.minio_bucket,
                    object_name=object_name,
                    data=io.BytesIO(content_bytes),
                    length=len(content_bytes),
                    content_type="application/json",
                    metadata=metadata_dict
                )
                
                return (object_name, settings.minio_bucket, len(content_bytes))
            except Exception as e:
                print(f"MinIO save failed: {e}")
        
        object_name = self._get_object_name(document_id, version)
        self._in_memory[object_name] = content.encode('utf-8')
        return (object_name, "in-memory", len(content))
    
    async def get_snapshot(
        self,
        bucket: str,
        object_name: str
    ) -> Optional[str]:
        if self._initialized and self.client and bucket != "in-memory":
            try:
                response = self.client.get_object(
                    bucket_name=bucket,
                    object_name=object_name
                )
                content = response.read().decode('utf-8')
                response.close()
                response.release_conn()
                return content
            except Exception as e:
                print(f"MinIO get failed: {e}")
        
        if object_name in getattr(self, '_in_memory', {}):
            return self._in_memory[object_name].decode('utf-8')
        
        return None
    
    async def delete_snapshot(
        self,
        bucket: str,
        object_name: str
    ) -> bool:
        if self._initialized and self.client and bucket != "in-memory":
            try:
                self.client.remove_object(bucket, object_name)
                return True
            except Exception as e:
                print(f"MinIO delete failed: {e}")
                return False
        
        if object_name in getattr(self, '_in_memory', {}):
            del self._in_memory[object_name]
            return True
        
        return False
    
    async def get_snapshot_url(
        self,
        bucket: str,
        object_name: str,
        expires_minutes: int = 60
    ) -> Optional[str]:
        if not (self._initialized and self.client):
            return None
        
        try:
            expires = timedelta(minutes=expires_minutes)
            url = self.client.presigned_get_object(
                bucket_name=bucket,
                object_name=object_name,
                expires=expires
            )
            return url
        except Exception as e:
            print(f"Failed to generate presigned URL: {e}")
            return None

minio_storage = MinioStorage()
