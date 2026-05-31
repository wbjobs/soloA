from fastapi import FastAPI, Request, Depends
from contextlib import asynccontextmanager

from config import settings
from middleware.auth import JWTBearer
from middleware.rate_limit import RateLimitMiddleware
from router.proxy import proxy_request

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"Starting {settings.app_name} v{settings.version}")
    yield
    print(f"Shutting down {settings.app_name}")

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="API Gateway for Collaborative Document Editor",
    lifespan=lifespan
)

app.add_middleware(RateLimitMiddleware)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.version
    }

@app.api_route("/api/v1/auth/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.api_route("/api/v1/documents/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], dependencies=[Depends(JWTBearer())])
@app.api_route("/api/v1/crdt/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], dependencies=[Depends(JWTBearer())])
@app.api_route("/api/v1/versions/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"], dependencies=[Depends(JWTBearer())])
@app.api_route("/api/v1/search/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], dependencies=[Depends(JWTBearer())])
@app.api_route("/api/v1/awareness/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "WEBSOCKET"], dependencies=[Depends(JWTBearer())])
async def catch_all(request: Request):
    return await proxy_request(request)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
