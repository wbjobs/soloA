import asyncio
import threading
from contextlib import asynccontextmanager
from fastapi import FastAPI

from config import settings
from database import init_db
from routes import router
from grpc_server import serve_grpc

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.app_name} v{settings.version}")
    await init_db()
    
    grpc_thread = threading.Thread(target=run_grpc_server, daemon=True)
    grpc_thread.start()
    
    yield
    print(f"Shutting down {settings.app_name}")

def run_grpc_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(serve_grpc())

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="Authentication and Authorization Service",
    lifespan=lifespan
)

app.include_router(router, prefix="/api/v1/auth")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.http_port, reload=True)
