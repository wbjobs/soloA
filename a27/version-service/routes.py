from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from schemas import (
    SaveSnapshotRequest,
    SaveSnapshotResponse,
    SnapshotResponse,
    ListVersionsResponse,
    VersionInfo,
    RevertRequest,
    RevertResponse,
    DeleteVersionsRequest,
    DeleteVersionsResponse,
    ThreeWayMergeRequest,
    MergeResponse
)
from services import VersionService

router = APIRouter(prefix="", tags=["versions"])

@router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "version-service"}

@router.post("/snapshot", response_model=SaveSnapshotResponse, status_code=status.HTTP_201_CREATED)
async def save_snapshot(
    request: SaveSnapshotRequest,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    snapshot = await service.save_snapshot(
        document_id=request.document_id,
        version=request.version,
        content=request.content,
        operation_ids=request.operation_ids,
        metadata=request.metadata
    )
    
    return SaveSnapshotResponse(
        success=True,
        snapshot_id=snapshot.id,
        message="Snapshot saved successfully"
    )

@router.get("/snapshot/{document_id}/{version}", response_model=SnapshotResponse)
async def get_snapshot(
    document_id: str,
    version: int,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    result = await service.get_snapshot(document_id, version)
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found"
        )
    
    snapshot, content = result
    
    return SnapshotResponse(
        snapshot_id=snapshot.id,
        document_id=snapshot.document_id,
        version=snapshot.version,
        content=content,
        created_at=snapshot.created_at,
        metadata=snapshot.metadata_ or {}
    )

@router.get("/list/{document_id}", response_model=ListVersionsResponse)
async def list_versions(
    document_id: str,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    snapshots, total = await service.list_versions(
        document_id=document_id,
        page=page,
        page_size=page_size
    )
    
    return ListVersionsResponse(
        versions=[
            VersionInfo(
                snapshot_id=snap.id,
                version=snap.version,
                created_at=snap.created_at,
                operation_count=snap.operation_count,
                content_size=snap.content_size,
                author_ids=snap.author_ids or ""
            )
            for snap in snapshots
        ],
        total=total,
        page=page,
        page_size=page_size
    )

@router.get("/latest/{document_id}")
async def get_latest_version(
    document_id: str,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    latest = await service.get_latest_version(document_id)
    
    if not latest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No versions found for this document"
        )
    
    return {
        "snapshot_id": latest.id,
        "document_id": latest.document_id,
        "version": latest.version,
        "created_at": latest.created_at,
        "operation_count": latest.operation_count,
        "content_size": latest.content_size,
        "metadata": latest.metadata_ or {}
    }

@router.post("/revert", response_model=RevertResponse)
async def revert_to_version(
    request: RevertRequest,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    result = await service.revert_to_version(
        document_id=request.document_id,
        target_version=request.target_version,
        user_id=request.user_id
    )
    
    if not result:
        return RevertResponse(
            success=False,
            message="Version not found or revert failed"
        )
    
    new_version, content = result
    
    return RevertResponse(
        success=True,
        new_version=new_version,
        message=f"Reverted to version {request.target_version}, created new version {new_version}"
    )

@router.post("/delete", response_model=DeleteVersionsResponse)
async def delete_versions(
    request: DeleteVersionsRequest,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    deleted_count = await service.delete_versions(
        document_id=request.document_id,
        versions=request.versions
    )
    
    return DeleteVersionsResponse(
        success=True,
        deleted_count=deleted_count
    )

@router.get("/url/{document_id}/{version}")
async def get_snapshot_url(
    document_id: str,
    version: int,
    expires_minutes: int = 60,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    url = await service.get_snapshot_presigned_url(
        document_id=document_id,
        version=version,
        expires_minutes=expires_minutes
    )
    
    if not url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found or URL not available"
        )
    
    return {
        "url": url,
        "expires_minutes": expires_minutes
    }

@router.post("/merge/preview")
async def preview_merge(
    document_id: str,
    ancestor_version: int,
    branch_a_version: int,
    branch_b_version: int,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    try:
        result = await service.preview_merge(
            document_id=document_id,
            ancestor_version=ancestor_version,
            branch_a_version=branch_a_version,
            branch_b_version=branch_b_version
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/merge")
async def merge_branches(
    request: ThreeWayMergeRequest,
    db: AsyncSession = Depends(get_db)
):
    service = VersionService(db)
    
    try:
        result = await service.merge_branches(
            document_id=request.document_id,
            ancestor_version=request.ancestor_version,
            branch_a_version=request.branch_a_version,
            branch_b_version=request.branch_b_version,
            auto_resolve=request.auto_resolve,
            merge_strategy=request.merge_strategy
        )
        
        new_version = None
        if request.save_as_new_version and result["success"]:
            latest = await service.get_latest_version(request.document_id)
            next_version = (latest.version + 1) if latest else 1
            
            await service.save_snapshot(
                document_id=request.document_id,
                version=next_version,
                content=result["merged_content"],
                operation_ids=[],
                metadata={
                    "merged_from_ancestor": str(request.ancestor_version),
                    "merged_branch_a": str(request.branch_a_version),
                    "merged_branch_b": str(request.branch_b_version),
                    "conflicts": str(result["conflicts"]),
                    "auto_resolved": str(request.auto_resolve)
                }
            )
            new_version = next_version
            result["new_version"] = new_version
        
        return MergeResponse(
            success=result["success"],
            merged_content=result["merged_content"],
            conflicts=result["conflicts"],
            resolved_conflicts=[
                {"conflict_number": c[0], "resolution": c[1]}
                for c in result["resolved_conflicts"]
            ],
            ancestor_version=result["ancestor_version"],
            branch_a_version=result["branch_a_version"],
            branch_b_version=result["branch_b_version"],
            stats=result["stats"],
            new_version=new_version
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
