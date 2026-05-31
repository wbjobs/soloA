from motor.motor_asyncio import AsyncIOMotorClient
from config import settings

client = None
db = None


async def connect_to_mongo():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB_NAME]


async def close_mongo_connection():
    global client
    if client:
        client.close()


def get_db():
    return db
