from fastapi import APIRouter, HTTPException, status, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

from crdt.document_manager import document_manager
from crdt.rga import OperationType

router = APIRouter(prefix="", tags=["crdt"])

class Operation(BaseModel):
    type: str
    position: int
    content: Optional[str] = None
    length: Optional[int] = None
    author_id: Optional[str] = None
    timestamp: Optional[int] = None
    attributes: Optional[Dict[str, str]] = None

class ApplyUpdateRequest(BaseModel):
    document_id: str
    author_id: str
    base_version: int
    operations: List[Operation]

class ApplyUpdateResponse(BaseModel):
    success: bool
    new_version: int
    message: str
    applied_operations: List[Dict[str, Any]]
    current_text: Optional[str] = None

class DocumentStateResponse(BaseModel):
    document_id: str
    current_version: int
    content: str
    timestamp: int

class SyncRequest(BaseModel):
    document_id: str
    client_version: int

class SyncResponse(BaseModel):
    server_version: int
    missing_batches: List[Dict[str, Any]]
    current_content: str

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
    return {"status": "healthy", "service": "crdt-service"}

@router.post("/apply", response_model=ApplyUpdateResponse)
async def apply_update(
    request_data: ApplyUpdateRequest,
    request: Request
):
    user_id = get_user_id(request)
    
    author_id = request_data.author_id or user_id
    
    ops_data = []
    for op in request_data.operations:
        op_dict = {
            "type": op.type,
            "position": op.position,
            "char": op.content,
            "author_id": author_id,
            "timestamp": op.timestamp or int(datetime.utcnow().timestamp() * 1000)
        }
        ops_data.append(op_dict)
    
    result = await document_manager.apply_operations(
        request_data.document_id,
        ops_data,
        author_id
    )
    
    return ApplyUpdateResponse(
        success=result["success"],
        new_version=result["new_version"],
        message="Operations applied successfully",
        applied_operations=result["applied_operations"],
        current_text=result.get("current_text")
    )

@router.get("/state/{document_id}", response_model=DocumentStateResponse)
async def get_document_state(
    document_id: str,
    version: Optional[int] = None
):
    state = await document_manager.get_document_state(document_id, version)
    
    return DocumentStateResponse(
        document_id=state["document_id"],
        current_version=state["current_version"],
        content=state["content"],
        timestamp=state["timestamp"]
    )

@router.post("/sync", response_model=SyncResponse)
async def sync_document(
    sync_data: SyncRequest
):
    result = await document_manager.sync_document(
        sync_data.document_id,
        sync_data.client_version
    )
    
    return SyncResponse(
        server_version=result["server_version"],
        missing_batches=result["missing_batches"],
        current_content=result["current_content"]
    )

@router.get("/snapshot/{document_id}")
async def get_snapshot(document_id: str):
    snapshot = await document_manager.get_snapshot(document_id)
    return snapshot

@router.get("/exists/{document_id}")
async def check_document_exists(document_id: str):
    exists = await document_manager.document_exists(document_id)
    return {"exists": exists}
