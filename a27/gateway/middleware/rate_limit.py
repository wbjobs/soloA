import asyncio
import time
from collections import defaultdict
from typing import Dict, List
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from config import settings

class InMemoryRateLimiter:
    def __init__(self):
        self.requests: Dict[str, List[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
    
    async def is_allowed(self, client_id: str) -> bool:
        async with self._lock:
            current_time = time.time()
            window_start = current_time - settings.rate_limit_window
            self.requests[client_id] = [
                t for t in self.requests[client_id]
                if t > window_start
            ]
            
            if len(self.requests[client_id]) >= settings.rate_limit_per_minute:
                return False
            
            self.requests[client_id].append(current_time)
            return True

rate_limiter = InMemoryRateLimiter()

class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        
        if not await rate_limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "retry_after": settings.rate_limit_window
                },
                headers={"Retry-After": str(settings.rate_limit_window)}
            )
        
        response = await call_next(request)
        return response
