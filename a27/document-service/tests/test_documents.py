import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from schemas import DocumentCreate, DocumentUpdate
from services import DocumentService, ROLE_PERMISSIONS
from models import Document, DocumentPermission

@pytest.fixture
def mock_db():
    db = AsyncMock()
    return db

@pytest.fixture
def test_document():
    doc = Document(
        id="doc-id-123",
        title="Test Document",
        owner_id="user-owner",
        content_type="text/plain",
        metadata_={"key": "value"},
        current_version=1,
        is_deleted="N",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    doc.permissions = []
    return doc

@pytest.fixture
def document_service(mock_db):
    return DocumentService(mock_db)

class TestRolePermissions:
    def test_owner_has_all_permissions(self):
        assert "read" in ROLE_PERMISSIONS["owner"]
        assert "write" in ROLE_PERMISSIONS["owner"]
        assert "delete" in ROLE_PERMISSIONS["owner"]
        assert "share" in ROLE_PERMISSIONS["owner"]
    
    def test_editor_permissions(self):
        assert "read" in ROLE_PERMISSIONS["editor"]
        assert "write" in ROLE_PERMISSIONS["editor"]
        assert "delete" not in ROLE_PERMISSIONS["editor"]
    
    def test_viewer_read_only(self):
        assert "read" in ROLE_PERMISSIONS["viewer"]
        assert "write" not in ROLE_PERMISSIONS["viewer"]

class TestDocumentService:
    @pytest.mark.asyncio
    async def test_get_document_by_id_found(self, document_service, mock_db, test_document):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_document
        mock_db.execute.return_value = mock_result
        
        doc = await document_service.get_document_by_id("doc-id-123")
        
        assert doc is not None
        assert doc.title == "Test Document"
        assert doc.owner_id == "user-owner"
    
    @pytest.mark.asyncio
    async def test_get_document_by_id_not_found(self, document_service, mock_db):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db.execute.return_value = mock_result
        
        doc = await document_service.get_document_by_id("nonexistent")
        assert doc is None
    
    @pytest.mark.asyncio
    async def test_get_user_permission_owner(self, document_service, test_document):
        role = await document_service.get_user_permission(test_document, "user-owner")
        assert role == "owner"
    
    @pytest.mark.asyncio
    async def test_get_user_permission_shared_user(self, document_service, test_document):
        permission = DocumentPermission(
            document_id="doc-id-123",
            user_id="user-editor",
            role="editor"
        )
        test_document.permissions = [permission]
        
        role = await document_service.get_user_permission(test_document, "user-editor")
        assert role == "editor"
    
    @pytest.mark.asyncio
    async def test_get_user_permission_no_access(self, document_service, test_document):
        role = await document_service.get_user_permission(test_document, "user-stranger")
        assert role is None
    
    @pytest.mark.asyncio
    async def test_has_permission_owner_delete(self, document_service, test_document):
        allowed = await document_service.has_permission(test_document, "user-owner", "delete")
        assert allowed is True
    
    @pytest.mark.asyncio
    async def test_has_permission_editor_read_write(self, document_service, test_document):
        permission = DocumentPermission(
            document_id="doc-id-123",
            user_id="user-editor",
            role="editor"
        )
        test_document.permissions = [permission]
        
        can_read = await document_service.has_permission(test_document, "user-editor", "read")
        can_write = await document_service.has_permission(test_document, "user-editor", "write")
        can_delete = await document_service.has_permission(test_document, "user-editor", "delete")
        
        assert can_read is True
        assert can_write is True
        assert can_delete is False
    
    @pytest.mark.asyncio
    async def test_has_permission_viewer_read_only(self, document_service, test_document):
        permission = DocumentPermission(
            document_id="doc-id-123",
            user_id="user-viewer",
            role="viewer"
        )
        test_document.permissions = [permission]
        
        can_read = await document_service.has_permission(test_document, "user-viewer", "read")
        can_write = await document_service.has_permission(test_document, "user-viewer", "write")
        
        assert can_read is True
        assert can_write is False
    
    @pytest.mark.asyncio
    async def test_has_permission_denied_no_access(self, document_service, test_document):
        allowed = await document_service.has_permission(test_document, "user-stranger", "read")
        assert allowed is False
    
    @pytest.mark.asyncio
    async def test_create_document(self, document_service, mock_db):
        doc_data = DocumentCreate(
            title="New Document",
            content_type="text/plain",
            metadata={"category": "work"}
        )
        
        document = await document_service.create_document(doc_data, "user-new-owner")
        
        assert document.title == "New Document"
        assert document.owner_id == "user-new-owner"
        assert document.current_version == 1
        assert document.is_deleted == "N"
        mock_db.add.assert_called()
        mock_db.commit.assert_awaited()
    
    @pytest.mark.asyncio
    async def test_delete_document_as_owner(self, document_service, mock_db, test_document):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_document
        mock_db.execute.return_value = mock_result
        
        success = await document_service.delete_document("doc-id-123", "user-owner")
        
        assert success is True
        assert test_document.is_deleted == "Y"
        mock_db.commit.assert_awaited()
    
    @pytest.mark.asyncio
    async def test_delete_document_denied_for_viewer(self, document_service, mock_db, test_document):
        permission = DocumentPermission(
            document_id="doc-id-123",
            user_id="user-viewer",
            role="viewer"
        )
        test_document.permissions = [permission]
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_document
        mock_db.execute.return_value = mock_result
        
        success = await document_service.delete_document("doc-id-123", "user-viewer")
        
        assert success is False
    
    @pytest.mark.asyncio
    async def test_increment_version(self, document_service, mock_db, test_document):
        original_version = test_document.current_version
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = test_document
        mock_db.execute.return_value = mock_result
        
        new_version = await document_service.increment_version("doc-id-123")
        
        assert new_version == original_version + 1
        mock_db.commit.assert_awaited()
