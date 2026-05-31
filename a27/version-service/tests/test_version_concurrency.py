import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.exc import IntegrityError

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import VersionService
from models import DocumentSnapshot

@pytest.fixture
def mock_db():
    return AsyncMock()

@pytest.fixture
def version_service(mock_db):
    return VersionService(mock_db)

class TestVersionConcurrencyBugFixes:
    @pytest.mark.asyncio
    async def test_save_snapshot_with_for_update_locking(self, version_service, mock_db):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        
        mock_snapshot = DocumentSnapshot(
            id="snap-123",
            document_id="doc-456",
            version=5,
            minio_object_id="doc-456/v5/snapshot.json",
            minio_bucket="test-bucket",
            operation_count=3,
            content_size=100
        )
        
        with patch('services.minio_storage') as mock_storage:
            mock_storage.save_snapshot = AsyncMock(return_value=("obj-id", "bucket", 100))
            
            result = await version_service.save_snapshot(
                document_id="doc-456",
                version=5,
                content="test content",
                operation_ids=["op1", "op2", "op3"]
            )
        
        assert mock_db.add.called
        assert mock_db.commit.awaited
    
    @pytest.mark.asyncio
    async def test_save_snapshot_integrity_error_retry(self, version_service, mock_db):
        call_count = [0]
        
        async def mock_execute_side_effect(*args, **kwargs):
            result = MagicMock()
            if call_count[0] == 0:
                result.scalar_one_or_none.return_value = None
                call_count[0] += 1
            elif call_count[0] == 1:
                call_count[0] += 1
                raise IntegrityError("mock", None, None)
            else:
                existing = DocumentSnapshot(
                    id="existing-snap",
                    document_id="doc-test",
                    version=3
                )
                result.scalar_one_or_none.return_value = existing
            return result
        
        mock_db.execute.side_effect = mock_execute_side_effect
        mock_db.rollback = AsyncMock()
        mock_db.commit = AsyncMock()
        
        with patch('services.minio_storage') as mock_storage:
            mock_storage.save_snapshot = AsyncMock(return_value=("obj-id", "bucket", 100))
            mock_storage.delete_snapshot = AsyncMock(return_value=True)
            
            result = await version_service.save_snapshot(
                document_id="doc-test",
                version=3,
                content="content",
                operation_ids=[]
            )
        
        assert result is not None
        assert result.id == "existing-snap"
        assert mock_db.rollback.awaited
    
    @pytest.mark.asyncio
    async def test_save_snapshot_cleanup_minio_on_rollback(self, version_service, mock_db):
        cleanup_called = [False]
        
        async def mock_execute_side_effect(*args, **kwargs):
            result = MagicMock()
            result.scalar_one_or_none.return_value = None
            return result
        
        mock_db.execute.side_effect = mock_execute_side_effect
        mock_db.rollback = AsyncMock()
        mock_db.commit = AsyncMock(side_effect=IntegrityError("duplicate", None, None))
        mock_db.add = MagicMock()
        
        with patch('services.minio_storage') as mock_storage:
            mock_storage.save_snapshot = AsyncMock(return_value=("test-obj", "test-bucket", 100))
            
            async def mock_delete(bucket, obj_name):
                cleanup_called[0] = True
                return True
            mock_storage.delete_snapshot = mock_delete
            
            with pytest.raises(IntegrityError):
                await version_service.save_snapshot(
                    document_id="doc-test",
                    version=99,
                    content="test",
                    operation_ids=[]
                )
        
        assert cleanup_called[0] is True
    
    @pytest.mark.asyncio
    async def test_save_snapshot_returns_existing(self, version_service, mock_db):
        existing_snapshot = DocumentSnapshot(
            id="existing-snap-id",
            document_id="doc-123",
            version=2
        )
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_snapshot
        mock_db.execute.return_value = mock_result
        
        with patch('services.minio_storage') as mock_storage:
            result = await version_service.save_snapshot(
                document_id="doc-123",
                version=2,
                content="content",
                operation_ids=[]
            )
        
        assert result.id == "existing-snap-id"
        assert not mock_storage.save_snapshot.awaited
        assert not mock_db.add.called
    
    @pytest.mark.asyncio
    async def test_revert_to_version_concurrent_retry(self, version_service, mock_db):
        mock_snapshot = DocumentSnapshot(
            id="target-snap",
            document_id="doc-revert",
            version=3
        )
        
        mock_latest = DocumentSnapshot(
            id="latest-snap",
            document_id="doc-revert",
            version=5
        )
        
        call_count = [0]
        
        async def mock_execute_side_effect(*args, **kwargs):
            result = MagicMock()
            stmt_str = str(args[0])
            
            if "target_version" in stmt_str or "ORDER BY" not in stmt_str:
                result.scalar_one_or_none.return_value = mock_snapshot
            else:
                if call_count[0] == 0:
                    result.scalar_one_or_none.return_value = mock_latest
                else:
                    new_latest = DocumentSnapshot(
                        id="new-latest",
                        document_id="doc-revert",
                        version=6
                    )
                    result.scalar_one_or_none.return_value = new_latest
                call_count[0] += 1
            return result
        
        mock_db.execute.side_effect = mock_execute_side_effect
        mock_db.rollback = AsyncMock()
        
        save_attempts = [0]
        
        async def mock_save(document_id, version, content, operation_ids, metadata):
            if save_attempts[0] == 0:
                save_attempts[0] += 1
                raise IntegrityError("concurrent", None, None)
            save_attempts[0] += 1
            return DocumentSnapshot(
                id="new-snap",
                document_id=document_id,
                version=version
            )
        
        with patch.object(version_service, 'get_snapshot') as mock_get:
            mock_get.return_value = (mock_snapshot, "restored content")
            
            with patch.object(version_service, 'save_snapshot', side_effect=mock_save):
                result = await version_service.revert_to_version(
                    document_id="doc-revert",
                    target_version=3,
                    user_id="user-1"
                )
        
        assert result is not None
        new_version, content = result
        assert content == "restored content"
        assert save_attempts[0] == 2
