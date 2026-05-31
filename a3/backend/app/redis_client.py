import redis
import json
import os
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

try:
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    redis_client.ping()
    REDIS_AVAILABLE = True
except Exception:
    REDIS_AVAILABLE = False
    redis_client = None


def cache_result(key: str, value, expire: int = 300):
    if not REDIS_AVAILABLE:
        return
    try:
        redis_client.setex(key, expire, json.dumps(value, default=str))
    except Exception:
        pass


def get_cached_result(key: str):
    if not REDIS_AVAILABLE:
        return None
    try:
        result = redis_client.get(key)
        if result:
            return json.loads(result)
        return None
    except Exception:
        return None
