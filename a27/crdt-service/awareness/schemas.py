from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum

class PresenceStatus(str, Enum):
    ONLINE = "online"
    AWAY = "away"
    OFFLINE = "offline"

class CursorUpdateRequest(BaseModel):
    document_id: str
    user_id: str
    username: str
    position: int
    selection_start: Optional[int] = None
    selection_end: Optional[int] = None
    color: Optional[str] = None

class JoinDocumentRequest(BaseModel):
    document_id: str
    user_id: str
    username: str
    initial_position: int = 0
    color: Optional[str] = None

class LeaveDocumentRequest(BaseModel):
    document_id: str
    user_id: str
    username: str

class PresenceUpdateRequest(BaseModel):
    document_id: str
    user_id: str
    username: str
    status: PresenceStatus

class CursorPositionResponse(BaseModel):
    document_id: str
    user_id: str
    username: str
    position: int
    selection_start: Optional[int] = None
    selection_end: Optional[int] = None
    status: PresenceStatus
    color: Optional[str] = None
    timestamp: float

class AwarenessResponse(BaseModel):
    document_id: str
    online_count: int
    users: list
