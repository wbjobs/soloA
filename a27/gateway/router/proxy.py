import httpx
from fastapi import Request, HTTPException
from fastapi.responses import StreamingResponse, Response
from typing import Dict, AsyncIterator, Optional
from config import settings
import io

SERVICE_MAPPING: Dict[str, str] = {
    "/api/v1/auth": settings.auth_service_url,
    "/api/v1/documents": settings.document_service_url,
    "/api/v1/crdt": settings.crdt_service_url,
    "/api/v1/versions": settings.version_service_url,
    "/api/v1/search": settings.version_service_url,
    "/api/v1/awareness": settings.crdt_service_url,
}

MAX_IN_MEMORY_SIZE = 10 * 1024 * 1024

def get_target_url(path: str) -> str:
    for prefix, base_url in SERVICE_MAPPING.items():
        if path.startswith(prefix):
            relative_path = path.replace(prefix, "", 1)
            return f"{base_url}{relative_path}"
    raise HTTPException(status_code=404, detail="Service not found")

async def get_request_stream(request: Request) -> Optional[AsyncIterator[bytes]]:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_IN_MEMORY_SIZE:
                return request.stream()
        except ValueError:
            pass
    return None

async def proxy_request(request: Request):
    target_url = get_target_url(request.url.path)
    
    headers = dict(request.headers)
    headers.pop("host", None)
    
    if hasattr(request.state, "user") and request.state.user:
        user_id = request.state.user.get("sub", "")
        username = request.state.user.get("username", "")
        headers["X-User-ID"] = str(user_id)
        headers["X-Username"] = username
    
    method = request.method
    params = dict(request.query_params)
    
    body_stream = await get_request_stream(request)
    
    try:
        if body_stream is not None:
            limits = httpx.Limits(max_connections=100, max_keepalive_connections=20)
            async with httpx.AsyncClient(timeout=300.0, limits=limits) as client:
                request_body = body_stream
                
                async with client.stream(
                    method=method,
                    url=target_url,
                    headers=headers,
                    params=params,
                    data=request_body
                ) as response:
                    response_headers = dict(response.headers)
                    response_headers.pop("content-length", None)
                    
                    async def response_stream():
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            yield chunk
                    
                    return StreamingResponse(
                        response_stream(),
                        status_code=response.status_code,
                        headers=response_headers,
                        media_type=response.headers.get("content-type")
                    )
        else:
            async with httpx.AsyncClient(timeout=30.0) as client:
                body = await request.body()
                
                response = await client.request(
                    method=method,
                    url=target_url,
                    headers=headers,
                    params=params,
                    content=body if body else None
                )
                
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers=dict(response.headers),
                    media_type=response.headers.get("content-type")
                )
                
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Service unavailable: {str(e)}"
        )
