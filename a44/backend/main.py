from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from config import settings, ensure_dirs
from database import connect_to_mongo, close_mongo_connection
from services.websocket_manager import ws_manager

from routers import cases, data, data_optimized, amr, validation


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_dirs()
    await connect_to_mongo()
    yield
    await close_mongo_connection()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router)
app.include_router(data.router)
app.include_router(data_optimized.router)
app.include_router(amr.router)
app.include_router(validation.router)


@app.get("/")
async def root():
    return {"message": "CFD Platform API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.websocket("/ws/progress/{case_id}")
async def websocket_progress(websocket: WebSocket, case_id: str):
    channel = f"progress:{case_id}"
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, channel)


@app.websocket("/ws/solver/{case_id}")
async def websocket_solver(websocket: WebSocket, case_id: str):
    channel = f"solver:{case_id}"
    await ws_manager.connect(websocket, channel)
    
    logs = ws_manager.get_solver_logs(case_id)
    if logs:
        await ws_manager.send_personal_message({
            "type": "history",
            "data": logs
        }, websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, channel)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
