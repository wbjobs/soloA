import asyncio
import json
from typing import Optional, Dict, List
from dataclasses import dataclass
from datetime import datetime
from config import settings

try:
    import redis
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

from .rga import RGA, RGAOperation, OperationType

@dataclass
class DocumentState:
    document_id: str
    rga: RGA
    last_snapshot_version: int = 0
    operations_since_snapshot: int = 0
    created_at: datetime = None
    updated_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow()
        if self.updated_at is None:
            self.updated_at = self.created_at

class DocumentManager:
    def __init__(self):
        self.documents: Dict[str, DocumentState] = {}
        self._lock = asyncio.Lock()
        self._redis_client: Optional[Redis] = None
    
    async def init_redis(self):
        if REDIS_AVAILABLE and settings.redis_url:
            try:
                self._redis_client = Redis.from_url(
                    settings.redis_url,
                    decode_responses=True
                )
                await self._redis_client.ping()
                print("Connected to Redis for document persistence")
            except Exception as e:
                print(f"Redis connection failed: {e}, using in-memory storage")
                self._redis_client = None
    
    async def _get_or_create_document(self, document_id: str) -> DocumentState:
        if document_id in self.documents:
            return self.documents[document_id]
        
        if self._redis_client:
            try:
                snapshot_data = await self._redis_client.get(f"doc:{document_id}:snapshot")
                if snapshot_data:
                    snapshot = json.loads(snapshot_data)
                    rga = RGA.from_snapshot(snapshot)
                    state = DocumentState(
                        document_id=document_id,
                        rga=rga,
                        last_snapshot_version=snapshot.get("version", 1)
                    )
                    self.documents[document_id] = state
                    return state
            except Exception as e:
                print(f"Failed to load from Redis: {e}")
        
        rga = RGA(document_id)
        state = DocumentState(document_id=document_id, rga=rga)
        self.documents[document_id] = state
        return state
    
    async def apply_operations(
        self,
        document_id: str,
        operations: List[Dict],
        author_id: str
    ) -> tuple:
        async with self._lock:
            state = await self._get_or_create_document(document_id)
            
            applied_ops = []
            for op_data in operations:
                try:
                    op = RGAOperation.from_dict(op_data)
                    
                    if op.type == OperationType.INSERT and op.char:
                        result_op = state.rga.insert(op.position, op.char, author_id)
                        applied_ops.append(result_op)
                    elif op.type == OperationType.DELETE:
                        result_op = state.rga.delete(op.position, author_id)
                        if result_op:
                            applied_ops.append(result_op)
                except Exception as e:
                    print(f"Error applying operation: {e}")
                    continue
            
            state.operations_since_snapshot += len(applied_ops)
            state.updated_at = datetime.utcnow()
            
            should_snapshot = state.operations_since_snapshot >= settings.snapshot_interval
            
            if should_snapshot:
                await self._save_snapshot(state)
            
            new_version = len(state.rga.operations) + 1
            
            return {
                "success": True,
                "new_version": new_version,
                "applied_operations": [op.to_dict() for op in applied_ops],
                "current_text": state.rga.get_text()
            }
    
    async def get_document_state(
        self,
        document_id: str,
        version: Optional[int] = None
    ) -> Dict:
        async with self._lock:
            state = await self._get_or_create_document(document_id)
            
            return {
                "document_id": document_id,
                "current_version": len(state.rga.operations) + 1,
                "content": state.rga.get_text(),
                "timestamp": int(state.updated_at.timestamp() * 1000) if state.updated_at else 0,
                "snapshot_version": state.last_snapshot_version
            }
    
    async def sync_document(
        self,
        document_id: str,
        client_version: int
    ) -> Dict:
        async with self._lock:
            state = await self._get_or_create_document(document_id)
            
            server_version = len(state.rga.operations) + 1
            
            missing_batches = []
            if client_version < server_version:
                start_idx = client_version - 1
                missing_ops = state.rga.operations[start_idx:]
                if missing_ops:
                    missing_batches = [{
                        "document_id": document_id,
                        "base_version": client_version,
                        "operations": [op.to_dict() for op in missing_ops]
                    }]
            
            return {
                "server_version": server_version,
                "missing_batches": missing_batches,
                "current_content": state.rga.get_text()
            }
    
    async def get_snapshot(self, document_id: str) -> Dict:
        async with self._lock:
            state = await self._get_or_create_document(document_id)
            return state.rga.get_snapshot()
    
    async def _save_snapshot(self, state: DocumentState):
        state.rga.version += 1
        state.last_snapshot_version = state.rga.version
        state.operations_since_snapshot = 0
        
        snapshot = state.rga.get_snapshot()
        
        if self._redis_client:
            try:
                snapshot_json = json.dumps(snapshot)
                await self._redis_client.setex(
                    f"doc:{state.document_id}:snapshot",
                    settings.snapshot_ttl,
                    snapshot_json
                )
            except Exception as e:
                print(f"Failed to save snapshot to Redis: {e}")
    
    async def document_exists(self, document_id: str) -> bool:
        async with self._lock:
            return document_id in self.documents or (
                self._redis_client and 
                await self._redis_client.exists(f"doc:{document_id}:snapshot")
            )

document_manager = DocumentManager()
