import asyncio
import json
import time
from typing import Dict, List, Optional, Set, Any
from dataclasses import dataclass, asdict
from datetime import datetime
from enum import Enum
from config import settings

try:
    from redis.asyncio import Redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

class PresenceStatus(str, Enum):
    ONLINE = "online"
    AWAY = "away"
    OFFLINE = "offline"

@dataclass
class CursorPosition:
    document_id: str
    user_id: str
    username: str
    position: int
    selection_start: Optional[int] = None
    selection_end: Optional[int] = None
    status: PresenceStatus = PresenceStatus.ONLINE
    color: Optional[str] = None
    timestamp: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "user_id": self.user_id,
            "username": self.username,
            "position": self.position,
            "selection_start": self.selection_start,
            "selection_end": self.selection_end,
            "status": self.status.value,
            "color": self.color,
            "timestamp": self.timestamp
        }

@dataclass
class AwarenessEvent:
    event_type: str
    document_id: str
    user_id: str
    username: str
    payload: Dict[str, Any]
    timestamp: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type,
            "document_id": self.document_id,
            "user_id": self.user_id,
            "username": self.username,
            "payload": self.payload,
            "timestamp": self.timestamp
        }

class AwarenessService:
    def __init__(self):
        self._redis_client: Optional[Redis] = None
        self._local_cursors: Dict[str, Dict[str, CursorPosition]] = {}
        self._local_subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._online_users: Dict[str, Set[str]] = {}
        self._heartbeat_interval = 30
        self._timeout_threshold = 60
        self._initialized = False
    
    async def init(self):
        if self._initialized:
            return
        
        if REDIS_AVAILABLE and settings.redis_url:
            try:
                self._redis_client = Redis.from_url(
                    settings.redis_url,
                    decode_responses=True
                )
                await self._redis_client.ping()
                print("Awareness Service connected to Redis")
            except Exception as e:
                print(f"Failed to connect to Redis for Awareness: {e}, using in-memory mode")
                self._redis_client = None
        
        self._initialized = True
        asyncio.create_task(self._cleanup_loop())
    
    async def close(self):
        if self._redis_client:
            await self._redis_client.close()
    
    def _get_stream_key(self, document_id: str) -> str:
        return f"awareness:stream:{document_id}"
    
    def _get_cursor_key(self, document_id: str, user_id: str) -> str:
        return f"awareness:cursor:{document_id}:{user_id}"
    
    def _get_online_key(self, document_id: str) -> str:
        return f"awareness:online:{document_id}"
    
    async def update_cursor(
        self,
        document_id: str,
        user_id: str,
        username: str,
        position: int,
        selection_start: Optional[int] = None,
        selection_end: Optional[int] = None,
        color: Optional[str] = None
    ) -> CursorPosition:
        cursor = CursorPosition(
            document_id=document_id,
            user_id=user_id,
            username=username,
            position=position,
            selection_start=selection_start,
            selection_end=selection_end,
            status=PresenceStatus.ONLINE,
            color=color,
            timestamp=time.time()
        )
        
        if document_id not in self._local_cursors:
            self._local_cursors[document_id] = {}
        self._local_cursors[document_id][user_id] = cursor
        
        if document_id not in self._online_users:
            self._online_users[document_id] = set()
        self._online_users[document_id].add(user_id)
        
        if self._redis_client:
            try:
                pipeline = self._redis_client.pipeline()
                
                cursor_json = json.dumps(cursor.to_dict())
                pipeline.setex(
                    self._get_cursor_key(document_id, user_id),
                    self._timeout_threshold,
                    cursor_json
                )
                
                pipeline.sadd(self._get_online_key(document_id), user_id)
                pipeline.expire(self._get_online_key(document_id), self._timeout_threshold)
                
                event = AwarenessEvent(
                    event_type="cursor_update",
                    document_id=document_id,
                    user_id=user_id,
                    username=username,
                    payload=cursor.to_dict(),
                    timestamp=time.time()
                )
                pipeline.xadd(
                    self._get_stream_key(document_id),
                    {"event": json.dumps(event.to_dict())}
                )
                
                await pipeline.execute()
            except Exception as e:
                print(f"Redis error in update_cursor: {e}")
        else:
            await self._broadcast_local(document_id, "cursor_update", cursor.to_dict(), user_id, username)
        
        return cursor
    
    async def set_presence(
        self,
        document_id: str,
        user_id: str,
        username: str,
        status: PresenceStatus
    ):
        if document_id in self._local_cursors and user_id in self._local_cursors[document_id]:
            cursor = self._local_cursors[document_id][user_id]
            cursor.status = status
            cursor.timestamp = time.time()
            
            if status == PresenceStatus.OFFLINE:
                if document_id in self._online_users:
                    self._online_users[document_id].discard(user_id)
                if document_id in self._local_cursors:
                    self._local_cursors[document_id].pop(user_id, None)
            else:
                if document_id not in self._online_users:
                    self._online_users[document_id] = set()
                self._online_users[document_id].add(user_id)
        
        if self._redis_client:
            try:
                if status == PresenceStatus.OFFLINE:
                    pipeline = self._redis_client.pipeline()
                    pipeline.delete(self._get_cursor_key(document_id, user_id))
                    pipeline.srem(self._get_online_key(document_id), user_id)
                    
                    event = AwarenessEvent(
                        event_type="user_left",
                        document_id=document_id,
                        user_id=user_id,
                        username=username,
                        payload={"status": status.value},
                        timestamp=time.time()
                    )
                    pipeline.xadd(
                        self._get_stream_key(document_id),
                        {"event": json.dumps(event.to_dict())}
                    )
                    await pipeline.execute()
                else:
                    cursor_key = self._get_cursor_key(document_id, user_id)
                    existing = await self._redis_client.get(cursor_key)
                    if existing:
                        cursor_data = json.loads(existing)
                        cursor_data["status"] = status.value
                        cursor_data["timestamp"] = time.time()
                        await self._redis_client.setex(
                            cursor_key,
                            self._timeout_threshold,
                            json.dumps(cursor_data)
                        )
                        
                        event = AwarenessEvent(
                            event_type="presence_change",
                            document_id=document_id,
                            user_id=user_id,
                            username=username,
                            payload={"status": status.value},
                            timestamp=time.time()
                        )
                        await self._redis_client.xadd(
                            self._get_stream_key(document_id),
                            {"event": json.dumps(event.to_dict())}
                        )
            except Exception as e:
                print(f"Redis error in set_presence: {e}")
        else:
            await self._broadcast_local(
                document_id,
                "user_left" if status == PresenceStatus.OFFLINE else "presence_change",
                {"status": status.value},
                user_id,
                username
            )
    
    async def get_document_awareness(
        self,
        document_id: str
    ) -> Dict[str, Any]:
        cursors = []
        
        if self._redis_client:
            try:
                online_users = await self._redis_client.smembers(self._get_online_key(document_id))
                for user_id in online_users:
                    cursor_data = await self._redis_client.get(self._get_cursor_key(document_id, user_id))
                    if cursor_data:
                        cursors.append(json.loads(cursor_data))
            except Exception as e:
                print(f"Redis error in get_document_awareness: {e}")
        
        if document_id in self._local_cursors:
            for user_id, cursor in self._local_cursors[document_id].items():
                if not any(c["user_id"] == user_id for c in cursors):
                    cursors.append(cursor.to_dict())
        
        return {
            "document_id": document_id,
            "online_count": len(cursors),
            "users": cursors
        }
    
    async def join_document(
        self,
        document_id: str,
        user_id: str,
        username: str,
        initial_position: int = 0,
        color: Optional[str] = None
    ) -> Dict[str, Any]:
        cursor = await self.update_cursor(
            document_id=document_id,
            user_id=user_id,
            username=username,
            position=initial_position,
            color=color
        )
        
        awareness = await self.get_document_awareness(document_id)
        
        if self._redis_client:
            try:
                event = AwarenessEvent(
                    event_type="user_joined",
                    document_id=document_id,
                    user_id=user_id,
                    username=username,
                    payload=cursor.to_dict(),
                    timestamp=time.time()
                )
                await self._redis_client.xadd(
                    self._get_stream_key(document_id),
                    {"event": json.dumps(event.to_dict())}
                )
            except Exception as e:
                print(f"Redis error in join_document: {e}")
        else:
            await self._broadcast_local(
                document_id,
                "user_joined",
                cursor.to_dict(),
                user_id,
                username
            )
        
        return {
            "joined": True,
            "current_users": awareness
        }
    
    async def leave_document(
        self,
        document_id: str,
        user_id: str,
        username: str
    ):
        await self.set_presence(document_id, user_id, username, PresenceStatus.OFFLINE)
    
    async def subscribe_to_document(
        self,
        document_id: str
    ) -> asyncio.Queue:
        if document_id not in self._local_subscribers:
            self._local_subscribers[document_id] = set()
        
        queue = asyncio.Queue(maxsize=1000)
        self._local_subscribers[document_id].add(queue)
        
        if self._redis_client:
            asyncio.create_task(self._redis_consumer(document_id, queue))
        
        return queue
    
    async def unsubscribe_from_document(
        self,
        document_id: str,
        queue: asyncio.Queue
    ):
        if document_id in self._local_subscribers:
            self._local_subscribers[document_id].discard(queue)
    
    async def _broadcast_local(
        self,
        document_id: str,
        event_type: str,
        payload: Dict[str, Any],
        user_id: str,
        username: str
    ):
        if document_id not in self._local_subscribers:
            return
        
        event = AwarenessEvent(
            event_type=event_type,
            document_id=document_id,
            user_id=user_id,
            username=username,
            payload=payload,
            timestamp=time.time()
        )
        
        for queue in list(self._local_subscribers[document_id]):
            try:
                queue.put_nowait(event.to_dict())
            except asyncio.QueueFull:
                pass
    
    async def _redis_consumer(
        self,
        document_id: str,
        queue: asyncio.Queue
    ):
        if not self._redis_client:
            return
        
        stream_key = self._get_stream_key(document_id)
        last_id = "$"
        
        try:
            while True:
                if document_id not in self._local_subscribers or queue not in self._local_subscribers[document_id]:
                    break
                
                messages = await self._redis_client.xread(
                    {stream_key: last_id},
                    block=5000
                )
                
                for stream, message_list in messages:
                    for message_id, message_data in message_list:
                        try:
                            event_json = message_data.get("event")
                            if event_json:
                                event_dict = json.loads(event_json)
                                try:
                                    queue.put_nowait(event_dict)
                                except asyncio.QueueFull:
                                    pass
                        except Exception as e:
                            print(f"Error parsing Redis message: {e}")
                        last_id = message_id
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Redis consumer error: {e}")
    
    async def _cleanup_loop(self):
        while True:
            await asyncio.sleep(self._heartbeat_interval)
            
            current_time = time.time()
            expired_threshold = current_time - self._timeout_threshold
            
            for document_id, cursors in list(self._local_cursors.items()):
                expired_users = []
                for user_id, cursor in cursors.items():
                    if cursor.timestamp < expired_threshold:
                        expired_users.append(user_id)
                
                for user_id in expired_users:
                    await self.leave_document(document_id, user_id, cursor.username)

awareness_service = AwarenessService()
