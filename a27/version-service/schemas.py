from pydantic import BaseModel, Field
from typing import Optional, Dict, List
from datetime import datetime

class SaveSnapshotRequest(BaseModel):
    document_id: str
    version: int
    content: str
    operation_ids: List[str] = []
    metadata: Dict[str, str] = {}

class SaveSnapshotResponse(BaseModel):
    success: bool
    snapshot_id: Optional[str] = None
    message: str

class SnapshotResponse(BaseModel):
    snapshot_id: str
    document_id: str
    version: int
    content: str
    created_at: datetime
    metadata: Dict[str, str] = {}

class VersionInfo(BaseModel):
    snapshot_id: str
    version: int
    created_at: datetime
    operation_count: int
    content_size: int
    author_ids: str

class ListVersionsResponse(BaseModel):
    versions: List[VersionInfo]
    total: int
    page: int
    page_size: int

class RevertRequest(BaseModel):
    document_id: str
    target_version: int
    user_id: str

class RevertResponse(BaseModel):
    success: bool
    new_version: Optional[int] = None
    message: str

class DeleteVersionsRequest(BaseModel):
    document_id: str
    versions: List[int]

class DeleteVersionsResponse(BaseModel):
    success: bool
    deleted_count: int

class ThreeWayMergeRequest(BaseModel):
    document_id: str
    ancestor_version: int
    branch_a_version: int
    branch_b_version: int
    auto_resolve: bool = False
    merge_strategy: str = "ours"
    save_as_new_version: bool = False

class DiffItem(BaseModel):
    operation: str
    old_start: int
    old_end: int
    new_start: int
    new_end: int

class MergePreviewResponse(BaseModel):
    document_id: str
    ancestor_version: int
    diff_from_ancestor_to_a: List[DiffItem]
    diff_from_ancestor_to_b: List[DiffItem]
    stats: Dict[str, int]

class MergeResponse(BaseModel):
    success: bool
    merged_content: str
    conflicts: List[str]
    resolved_conflicts: List[Dict]
    ancestor_version: int
    branch_a_version: int
    branch_b_version: int
    stats: Dict[str, int]
    new_version: Optional[int] = None
