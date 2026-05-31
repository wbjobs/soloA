from typing import Optional, List, Dict, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.exc import IntegrityError, DBAPIError
import asyncio

from models import DocumentSnapshot
from storage.minio_client import minio_storage

class VersionService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def save_snapshot(
        self,
        document_id: str,
        version: int,
        content: str,
        operation_ids: List[str] = None,
        metadata: Dict = None
    ) -> DocumentSnapshot:
        max_retries = 3
        retry_delay = 0.1
        pending_minio_object = None
        
        for attempt in range(max_retries):
            try:
                existing_stmt = select(DocumentSnapshot).where(
                    DocumentSnapshot.document_id == document_id,
                    DocumentSnapshot.version == version
                ).with_for_update(skip_locked=False)
                existing_result = await self.db.execute(existing_stmt)
                existing = existing_result.scalar_one_or_none()
                
                if existing:
                    if pending_minio_object:
                        await self._cleanup_minio_object(
                            pending_minio_object["bucket"],
                            pending_minio_object["object_name"]
                        )
                    return existing
                
                object_name, bucket, content_size = await minio_storage.save_snapshot(
                    document_id,
                    version,
                    content,
                    metadata
                )
                pending_minio_object = {"bucket": bucket, "object_name": object_name}
                
                snapshot = DocumentSnapshot(
                    document_id=document_id,
                    version=version,
                    minio_object_id=object_name,
                    minio_bucket=bucket,
                    operation_count=len(operation_ids) if operation_ids else 0,
                    content_size=content_size,
                    metadata_=metadata or {}
                )
                
                self.db.add(snapshot)
                await self.db.commit()
                await self.db.refresh(snapshot)
                
                return snapshot
                
            except IntegrityError:
                await self.db.rollback()
                
                if pending_minio_object:
                    await self._cleanup_minio_object(
                        pending_minio_object["bucket"],
                        pending_minio_object["object_name"]
                    )
                    pending_minio_object = None
                
                existing_stmt = select(DocumentSnapshot).where(
                    DocumentSnapshot.document_id == document_id,
                    DocumentSnapshot.version == version
                )
                existing_result = await self.db.execute(existing_stmt)
                existing = existing_result.scalar_one_or_none()
                
                if existing:
                    return existing
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                else:
                    raise
                
            except Exception:
                if pending_minio_object:
                    await self._cleanup_minio_object(
                        pending_minio_object["bucket"],
                        pending_minio_object["object_name"]
                    )
                await self.db.rollback()
                raise
    
    async def _cleanup_minio_object(self, bucket: str, object_name: str):
        try:
            await minio_storage.delete_snapshot(bucket, object_name)
        except Exception as e:
            print(f"Warning: Failed to cleanup MinIO object {object_name}: {e}")
    
    async def get_snapshot(
        self,
        document_id: str,
        version: int
    ) -> Optional[Tuple[DocumentSnapshot, str]]:
        stmt = select(DocumentSnapshot).where(
            DocumentSnapshot.document_id == document_id,
            DocumentSnapshot.version == version
        )
        result = await self.db.execute(stmt)
        snapshot = result.scalar_one_or_none()
        
        if not snapshot:
            return None
        
        content = await minio_storage.get_snapshot(
            snapshot.minio_bucket,
            snapshot.minio_object_id
        )
        
        return (snapshot, content)
    
    async def list_versions(
        self,
        document_id: str,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[DocumentSnapshot], int]:
        offset = (page - 1) * page_size
        
        count_stmt = select(func.count(DocumentSnapshot.id)).where(
            DocumentSnapshot.document_id == document_id
        )
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0
        
        list_stmt = (
            select(DocumentSnapshot)
            .where(DocumentSnapshot.document_id == document_id)
            .order_by(DocumentSnapshot.version.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await self.db.execute(list_stmt)
        snapshots = list(result.scalars().all())
        
        return snapshots, total
    
    async def get_latest_version(
        self,
        document_id: str
    ) -> Optional[DocumentSnapshot]:
        stmt = (
            select(DocumentSnapshot)
            .where(DocumentSnapshot.document_id == document_id)
            .order_by(DocumentSnapshot.version.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def revert_to_version(
        self,
        document_id: str,
        target_version: int,
        user_id: str
    ) -> Optional[Tuple[int, str]]:
        snapshot_info = await self.get_snapshot(document_id, target_version)
        
        if not snapshot_info:
            return None
        
        snapshot, content = snapshot_info
        
        max_attempts = 5
        for attempt in range(max_attempts):
            latest = await self.get_latest_version(document_id)
            new_version = (latest.version + 1) if latest else 1
            
            try:
                new_snapshot = await self.save_snapshot(
                    document_id=document_id,
                    version=new_version,
                    content=content,
                    operation_ids=[],
                    metadata={
                        "reverted_from": str(target_version),
                        "reverted_by": user_id,
                        "reverted_at": datetime.utcnow().isoformat()
                    }
                )
                return (new_version, content)
            except IntegrityError:
                if attempt == max_attempts - 1:
                    raise
                await asyncio.sleep(0.1 * (2 ** attempt))
        
        return None
    
    async def delete_versions(
        self,
        document_id: str,
        versions: List[int]
    ) -> int:
        if not versions:
            return 0
        
        stmt = select(DocumentSnapshot).where(
            DocumentSnapshot.document_id == document_id,
            DocumentSnapshot.version.in_(versions)
        )
        result = await self.db.execute(stmt)
        snapshots = list(result.scalars().all())
        
        for snapshot in snapshots:
            await minio_storage.delete_snapshot(
                snapshot.minio_bucket,
                snapshot.minio_object_id
            )
        
        delete_stmt = delete(DocumentSnapshot).where(
            DocumentSnapshot.document_id == document_id,
            DocumentSnapshot.version.in_(versions)
        )
        result = await self.db.execute(delete_stmt)
        await self.db.commit()
        
        return result.rowcount
    
    async def get_snapshot_presigned_url(
        self,
        document_id: str,
        version: int,
        expires_minutes: int = 60
    ) -> Optional[str]:
        stmt = select(DocumentSnapshot).where(
            DocumentSnapshot.document_id == document_id,
            DocumentSnapshot.version == version
        )
        result = await self.db.execute(stmt)
        snapshot = result.scalar_one_or_none()
        
        if not snapshot:
            return None
        
        return await minio_storage.get_snapshot_url(
            snapshot.minio_bucket,
            snapshot.minio_object_id,
            expires_minutes
        )
    
    async def merge_branches(
        self,
        document_id: str,
        ancestor_version: int,
        branch_a_version: int,
        branch_b_version: int,
        auto_resolve: bool = False,
        merge_strategy: str = "ours"
    ):
        from merge.three_way_merge import three_way_merge, MergeResult
        
        ancestor_info = await self.get_snapshot(document_id, ancestor_version)
        if not ancestor_info:
            raise ValueError(f"Ancestor version {ancestor_version} not found")
        ancestor_snapshot, ancestor_content = ancestor_info
        
        branch_a_info = await self.get_snapshot(document_id, branch_a_version)
        if not branch_a_info:
            raise ValueError(f"Branch A version {branch_a_version} not found")
        branch_a_snapshot, branch_a_content = branch_a_info
        
        branch_b_info = await self.get_snapshot(document_id, branch_b_version)
        if not branch_b_info:
            raise ValueError(f"Branch B version {branch_b_version} not found")
        branch_b_snapshot, branch_b_content = branch_b_info
        
        merge_result = three_way_merge(
            ancestor_content,
            branch_a_content,
            branch_b_content,
            auto_resolve=auto_resolve
        )
        
        return {
            "success": merge_result.success,
            "merged_content": merge_result.merged_content,
            "conflicts": merge_result.conflicts,
            "resolved_conflicts": merge_result.resolved_conflicts,
            "ancestor_version": ancestor_version,
            "branch_a_version": branch_a_version,
            "branch_b_version": branch_b_version,
            "stats": {
                "ancestor_length": len(ancestor_content),
                "branch_a_length": len(branch_a_content),
                "branch_b_length": len(branch_b_content),
                "merged_length": len(merge_result.merged_content),
                "conflict_count": len(merge_result.conflicts)
            }
        }
    
    async def preview_merge(
        self,
        document_id: str,
        ancestor_version: int,
        branch_a_version: int,
        branch_b_version: int
    ):
        from merge.three_way_merge import diff_text
        
        ancestor_info = await self.get_snapshot(document_id, ancestor_version)
        if not ancestor_info:
            raise ValueError(f"Ancestor version not found")
        _, ancestor_content = ancestor_info
        
        branch_a_info = await self.get_snapshot(document_id, branch_a_version)
        if not branch_a_info:
            raise ValueError(f"Branch A version not found")
        _, branch_a_content = branch_a_info
        
        branch_b_info = await self.get_snapshot(document_id, branch_b_version)
        if not branch_b_info:
            raise ValueError(f"Branch B version not found")
        _, branch_b_content = branch_b_info
        
        diff_a = diff_text(ancestor_content, branch_a_content)
        diff_b = diff_text(ancestor_content, branch_b_content)
        
        return {
            "document_id": document_id,
            "ancestor_version": ancestor_version,
            "diff_from_ancestor_to_a": diff_a,
            "diff_from_ancestor_to_b": diff_b,
            "stats": {
                "changes_in_a": len(diff_a),
                "changes_in_b": len(diff_b)
            }
        }
