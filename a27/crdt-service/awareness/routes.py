import asyncio
import json
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from sse_starlette.sse import EventSourceResponse

from .schemas import (
    CursorUpdateRequest,
    JoinDocumentRequest,
    LeaveDocumentRequest,
    PresenceUpdateRequest,
    CursorPositionResponse,
    AwarenessResponse
)
from .service import awareness_service

router = APIRouter(prefix="", tags=["awareness"])

@router.post("/cursor/update", response_model=CursorPositionResponse)
async def update_cursor(request: CursorUpdateRequest):
    cursor = await awareness_service.update_cursor(
        document_id=request.document_id,
        user_id=request.user_id,
        username=request.username,
        position=request.position,
        selection_start=request.selection_start,
        selection_end=request.selection_end,
        color=request.color
    )
    
    return CursorPositionResponse(
        document_id=cursor.document_id,
        user_id=cursor.user_id,
        username=cursor.username,
        position=cursor.position,
        selection_start=cursor.selection_start,
        selection_end=cursor.selection_end,
        status=cursor.status,
        color=cursor.color,
        timestamp=cursor.timestamp
    )

@router.get("/awareness/{document_id}", response_model=AwarenessResponse)
async def get_document_awareness(document_id: str):
    result = await awareness_service.get_document_awareness(document_id)
    return AwarenessResponse(**result)

@router.post("/join")
async def join_document(request: JoinDocumentRequest):
    result = await awareness_service.join_document(
        document_id=request.document_id,
        user_id=request.user_id,
        username=request.username,
        initial_position=request.initial_position,
        color=request.color
    )
    return result

@router.post("/leave")
async def leave_document(request: LeaveDocumentRequest):
    await awareness_service.leave_document(
        document_id=request.document_id,
        user_id=request.user_id,
        username=request.username
    )
    return {"success": True}

@router.post("/presence")
async def update_presence(request: PresenceUpdateRequest):
    await awareness_service.set_presence(
        document_id=request.document_id,
        user_id=request.user_id,
        username=request.username,
        status=request.status
    )
    return {"success": True}

@router.get("/stream/{document_id}")
async def stream_awareness(
    document_id: str,
    user_id: str = Query(..., description="User ID for identification")
):
    queue = await awareness_service.subscribe_to_document(document_id)
    
    async def event_generator():
        try:
            yield {
                "event": "connected",
                "data": json.dumps({"document_id": document_id, "user_id": user_id})
            }
            
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield {
                        "event": event["event_type"],
                        "data": json.dumps(event)
                    }
                except asyncio.TimeoutError:
                    yield {
                        "event": "ping",
                        "data": json.dumps({"timestamp": asyncio.get_event_loop().time()})
                    }
        except asyncio.CancelledError:
            await awareness_service.unsubscribe_from_document(document_id, queue)
            raise
    
    return EventSourceResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )

@router.websocket("/ws/{document_id}")
async def websocket_awareness(websocket: WebSocket, document_id: str):
    await websocket.accept()
    
    queue = await awareness_service.subscribe_to_document(document_id)
    
    consumer_task = None
    
    async def consume_and_send():
        while True:
            try:
                event = await queue.get()
                await websocket.send_json(event)
            except asyncio.CancelledError:
                break
            except Exception:
                break
    
    try:
        consumer_task = asyncio.create_task(consume_and_send())
        
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                action = message.get("action")
                
                if action == "ping":
                    await websocket.send_json({"action": "pong", "timestamp": message.get("timestamp")})
                elif action == "cursor":
                    await awareness_service.update_cursor(
                        document_id=document_id,
                        user_id=message.get("user_id", ""),
                        username=message.get("username", ""),
                        position=message.get("position", 0),
                        selection_start=message.get("selection_start"),
                        selection_end=message.get("selection_end"),
                        color=message.get("color")
                    )
                elif action == "presence":
                    await awareness_service.set_presence(
                        document_id=document_id,
                        user_id=message.get("user_id", ""),
                        username=message.get("username", ""),
                        status=message.get("status", "online")
                    )
            except json.JSONDecodeError:
                pass
    
    except WebSocketDisconnect:
        pass
    finally:
        if consumer_task:
            consumer_task.cancel()
            try:
                await consumer_task
            except asyncio.CancelledError:
                pass
        await awareness_service.unsubscribe_from_document(document_id, queue)
