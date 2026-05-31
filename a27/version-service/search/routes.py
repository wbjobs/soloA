from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from .service import search_service
from .schemas import (
    SearchRequest,
    IndexDocumentRequest,
    BulkIndexRequest,
    SearchResponse,
    IndexResponse,
    BulkIndexResponse,
    SearchStatsResponse,
    DeleteIndexResponse
)

router = APIRouter()

@router.post("/search", response_model=SearchResponse)
async def search_documents(
    request: SearchRequest
):
    result = await search_service.search(
        query=request.query,
        owner_id=request.owner_id,
        limit=request.limit,
        offset=request.offset
    )
    return SearchResponse(**result)

@router.get("/search", response_model=SearchResponse)
async def search_documents_get(
    query: str = Query(..., description="Search query"),
    owner_id: Optional[str] = Query(None, description="Filter by owner"),
    limit: int = Query(20, ge=1, le=100, description="Max results"),
    offset: int = Query(0, ge=0, description="Pagination offset")
):
    result = await search_service.search(
        query=query,
        owner_id=owner_id,
        limit=limit,
        offset=offset
    )
    return SearchResponse(**result)

@router.post("/index", response_model=IndexResponse)
async def index_document(
    request: IndexDocumentRequest
):
    success = await search_service.index_document(
        document_id=request.document_id,
        title=request.title,
        owner_id=request.owner_id,
        content=request.content,
        version=request.version,
        content_type=request.content_type,
        metadata=request.metadata
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to index document")
    
    return IndexResponse(success=True, document_id=request.document_id)

@router.post("/index/bulk", response_model=BulkIndexResponse)
async def bulk_index_documents(
    request: BulkIndexRequest
):
    docs = [
        {
            "document_id": d.document_id,
            "title": d.title,
            "owner_id": d.owner_id,
            "content": d.content,
            "version": d.version,
            "content_type": d.content_type,
            "metadata": d.metadata
        }
        for d in request.documents
    ]
    
    indexed = await search_service.bulk_index(docs)
    return BulkIndexResponse(indexed=indexed, success=True)

@router.get("/index/{document_id}")
async def get_indexed_document(document_id: str):
    doc = await search_service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in index")
    return doc

@router.delete("/index/{document_id}", response_model=DeleteIndexResponse)
async def delete_document_from_index(document_id: str):
    success = await search_service.delete_document(document_id)
    return DeleteIndexResponse(success=success, document_id=document_id)

@router.get("/stats", response_model=SearchStatsResponse)
async def get_search_stats():
    stats = await search_service.get_stats()
    return SearchStatsResponse(**stats)
