import json
import asyncio
from typing import Dict, Set, Optional
from fastapi import WebSocket, WebSocketDisconnect
from collections import defaultdict


class WebSocketManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.task_progress: Dict[str, Dict] = {}
        self.solver_logs: Dict[str, list] = defaultdict(list)

    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        self.active_connections[channel].add(websocket)

    async def disconnect(self, websocket: WebSocket, channel: str):
        self.active_connections[channel].discard(websocket)

    async def broadcast(self, channel: str, message: dict):
        connections = self.active_connections[channel].copy()
        for connection in connections:
            try:
                await connection.send_text(json.dumps(message))
            except WebSocketDisconnect:
                await self.disconnect(connection, channel)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))

    def update_progress(self, task_id: str, progress: float, status: str, message: str = ""):
        self.task_progress[task_id] = {
            "task_id": task_id,
            "progress": progress,
            "status": status,
            "message": message
        }

    async def broadcast_progress(self, task_id: str, case_id: Optional[str], progress: float, status: str, message: str = ""):
        self.update_progress(task_id, progress, status, message)
        await self.broadcast(f"progress:{case_id}", {
            "type": "progress",
            "task_id": task_id,
            "case_id": case_id,
            "progress": progress,
            "status": status,
            "message": message
        })

    async def broadcast_log(self, case_id: str, log_entry: dict):
        self.solver_logs[case_id].append(log_entry)
        await self.broadcast(f"solver:{case_id}", {
            "type": "log",
            "case_id": case_id,
            "data": log_entry
        })

    def get_progress(self, task_id: str) -> Optional[Dict]:
        return self.task_progress.get(task_id)

    def get_solver_logs(self, case_id: str) -> list:
        return self.solver_logs.get(case_id, [])


ws_manager = WebSocketManager()
