from typing import Optional, List, Dict, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from sqlalchemy.orm import selectinload

from models import Document, DocumentPermission
from schemas import DocumentCreate, DocumentUpdate

ROLE_PERMISSIONS = {
    "owner": ["read", "write", "delete", "share"],
    "editor": ["read", "write"],
    "viewer": ["read"]
}

class DocumentService:
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def get_document_by_id(self, document_id: str) -> Optional[Document]:
        stmt = (
            select(Document)
            .options(selectinload(Document.permissions))
            .where(Document.id == document_id, Document.is_deleted == "N")
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def create_document(
        self,
        document_data: DocumentCreate,
        owner_id: str
    ) -> Document:
        document = Document(
            title=document_data.title,
            owner_id=owner_id,
            content_type=document_data.content_type,
            metadata_=document_data.metadata or {}
        )
        
        self.db.add(document)
        await self.db.flush()
        
        owner_permission = DocumentPermission(
            document_id=document.id,
            user_id=owner_id,
            role="owner",
            granted_by=owner_id
        )
        self.db.add(owner_permission)
        
        await self.db.commit()
        await self.db.refresh(document)
        return document
    
    async def update_document(
        self,
        document_id: str,
        update_data: DocumentUpdate,
        user_id: str
    ) -> Optional[Document]:
        document = await self.get_document_by_id(document_id)
        if not document:
            return None
        
        if not await self.has_permission(document, user_id, "write"):
            return None
        
        if update_data.title is not None:
            document.title = update_data.title
        if update_data.metadata is not None:
            document.metadata_ = update_data.metadata
        
        document.updated_at = datetime.utcnow()
        
        await self.db.commit()
        await self.db.refresh(document)
        return document
    
    async def delete_document(
        self,
        document_id: str,
        user_id: str
    ) -> bool:
        document = await self.get_document_by_id(document_id)
        if not document:
            return False
        
        if not await self.has_permission(document, user_id, "delete"):
            return False
        
        document.is_deleted = "Y"
        await self.db.commit()
        return True
    
    async def list_documents(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Document], int]:
        offset = (page - 1) * page_size
        
        subquery = (
            select(DocumentPermission.document_id)
            .where(DocumentPermission.user_id == user_id)
        )
        
        count_stmt = (
            select(func.count(Document.id))
            .where(
                Document.is_deleted == "N",
                Document.id.in_(subquery)
            )
        )
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0
        
        list_stmt = (
            select(Document)
            .where(
                Document.is_deleted == "N",
                Document.id.in_(subquery)
            )
            .order_by(Document.updated_at.desc())
            .offset(offset)
            .limit(page_size)
        )
        result = await self.db.execute(list_stmt)
        documents = list(result.scalars().all())
        
        return documents, total
    
    async def get_user_permission(
        self,
        document: Document,
        user_id: str
    ) -> Optional[str]:
        if document.owner_id == user_id:
            return "owner"
        
        for perm in document.permissions:
            if perm.user_id == user_id:
                return perm.role
        
        return None
    
    async def has_permission(
        self,
        document: Document,
        user_id: str,
        action: str
    ) -> bool:
        role = await self.get_user_permission(document, user_id)
        if not role:
            return False
        
        allowed_actions = ROLE_PERMISSIONS.get(role, [])
        return action in allowed_actions
    
    async def grant_permission(
        self,
        document_id: str,
        target_user_id: str,
        role: str,
        granted_by: str
    ) -> Optional[DocumentPermission]:
        document = await self.get_document_by_id(document_id)
        if not document:
            return None
        
        if not await self.has_permission(document, granted_by, "share"):
            return None
        
        existing_stmt = (
            select(DocumentPermission)
            .where(
                DocumentPermission.document_id == document_id,
                DocumentPermission.user_id == target_user_id
            )
        )
        existing_result = await self.db.execute(existing_stmt)
        existing = existing_result.scalar_one_or_none()
        
        if existing:
            existing.role = role
            existing.granted_by = granted_by
            existing.granted_at = datetime.utcnow()
            permission = existing
        else:
            permission = DocumentPermission(
                document_id=document_id,
                user_id=target_user_id,
                role=role,
                granted_by=granted_by
            )
            self.db.add(permission)
        
        await self.db.commit()
        await self.db.refresh(permission)
        return permission
    
    async def revoke_permission(
        self,
        document_id: str,
        target_user_id: str,
        revoked_by: str
    ) -> bool:
        document = await self.get_document_by_id(document_id)
        if not document:
            return False
        
        if not await self.has_permission(document, revoked_by, "share"):
            return False
        
        if target_user_id == document.owner_id:
            return False
        
        delete_stmt = delete(DocumentPermission).where(
            DocumentPermission.document_id == document_id,
            DocumentPermission.user_id == target_user_id
        )
        result = await self.db.execute(delete_stmt)
        await self.db.commit()
        
        return result.rowcount > 0
    
    async def increment_version(
        self,
        document_id: str
    ) -> Optional[int]:
        document = await self.get_document_by_id(document_id)
        if not document:
            return None
        
        document.current_version += 1
        document.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(document)
        
        return document.current_version
    
    @staticmethod
    def document_to_response(document: Document) -> Dict:
        return {
            "document_id": document.id,
            "title": document.title,
            "owner_id": document.owner_id,
            "content_type": document.content_type,
            "metadata": document.metadata_ or {},
            "current_version": document.current_version,
            "created_at": document.created_at,
            "updated_at": document.updated_at
        }
