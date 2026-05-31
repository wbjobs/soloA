import asyncio
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI

from config import settings
from crdt.document_manager import document_manager
from awareness.service import awareness_service
from routes import router
from awareness.routes import router as awareness_router
from grpc_server import serve_grpc

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.app_name} v{settings.version}")
    await document_manager.init_redis()
    await awareness_service.init()
    
    grpc_thread = threading.Thread(target=run_grpc_server, daemon=True)
    grpc_thread.start()
    
    yield
    await awareness_service.close()
    print(f"Shutting down {settings.app_name}")

def run_grpc_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(serve_grpc())

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="CRDT Conflict Resolution Service with Awareness",
    lifespan=lifespan
)

app.include_router(router, prefix="/api/v1/crdt")
app.include_router(awareness_router, prefix="/api/v1/awareness")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.http_port, reload=True)
