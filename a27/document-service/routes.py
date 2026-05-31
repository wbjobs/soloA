from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from schemas import (
    DocumentCreate,
    DocumentUpdate,
    DocumentResponse,
    DocumentListResponse,
    PermissionGrant,
    PermissionResponse,
    DeleteResponse
)
from services import DocumentService

router = APIRouter(prefix="", tags=["documents"])

def get_user_id(request: Request) -> str:
    user_id = request.headers.get("X-User-ID")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not authenticated"
        )
    return user_id

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "document-service"}

@router.post("/", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(
    document_data: DocumentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    document = await service.create_document(document_data, user_id)
    return DocumentResponse(**service.document_to_response(document))

@router.get("/", response_model=DocumentListResponse)
async def list_documents(
    request: Request,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    documents, total = await service.list_documents(user_id, page, page_size)
    
    return DocumentListResponse(
        documents=[
            DocumentResponse(**service.document_to_response(doc))
            for doc in documents
        ],
        total=total,
        page=page,
        page_size=page_size
    )

@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    document = await service.get_document_by_id(document_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    if not await service.has_permission(document, user_id, "read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return DocumentResponse(**service.document_to_response(document))

@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    update_data: DocumentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    document = await service.update_document(document_id, update_data, user_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or access denied"
        )
    
    return DocumentResponse(**service.document_to_response(document))

@router.delete("/{document_id}", response_model=DeleteResponse)
async def delete_document(
    document_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    success = await service.delete_document(document_id, user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or access denied"
        )
    
    return DeleteResponse(success=True)

@router.post("/{document_id}/permissions", response_model=PermissionResponse)
async def grant_permission(
    document_id: str,
    permission: PermissionGrant,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    result = await service.grant_permission(
        document_id,
        permission.user_id,
        permission.role,
        user_id
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or access denied"
        )
    
    return PermissionResponse(
        user_id=result.user_id,
        document_id=result.document_id,
        role=result.role,
        granted_at=result.granted_at
    )

@router.delete("/{document_id}/permissions/{target_user_id}", response_model=DeleteResponse)
async def revoke_permission(
    document_id: str,
    target_user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    success = await service.revoke_permission(
        document_id,
        target_user_id,
        user_id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permission not found or access denied"
        )
    
    return DeleteResponse(success=True)

@router.get("/{document_id}/permission-check")
async def check_document_permission(
    document_id: str,
    action: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    user_id = get_user_id(request)
    service = DocumentService(db)
    
    document = await service.get_document_by_id(document_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    role = await service.get_user_permission(document, user_id)
    allowed = await service.has_permission(document, user_id, action)
    
    return {
        "allowed": allowed,
        "role": role or "none",
        "document_id": document_id
    }
