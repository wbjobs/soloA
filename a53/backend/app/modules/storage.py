import os
import uuid
import base64
import json
from pathlib import Path
from datetime import datetime
from PIL import Image

from app.core.config import UPLOAD_DIR, LIGHTMAP_DIR


def save_uploaded_file(file_content: bytes, filename: str) -> str:
    ext = os.path.splitext(filename)[1] or ".png"
    unique_name = f"{uuid.uuid4()}{ext}"
    file_path = UPLOAD_DIR / unique_name
    with open(file_path, "wb") as f:
        f.write(file_content)
    return f"/static/uploads/{unique_name}"


def save_image_to_base64(image_path: str) -> str:
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def save_lightmap(image: Image.Image, map_id: str) -> str:
    filename = f"{map_id}_lightmap_{datetime.now().strftime('%Y%m%d%H%M%S')}.png"
    filepath = LIGHTMAP_DIR / filename
    image.save(filepath, format="PNG")
    return str(filepath)


def embed_lightmap_into_json(map_json: dict, lightmap_path: str) -> dict:
    lightmap_base64 = save_image_to_base64(lightmap_path)
    map_json["lightmap"] = {
        "path": f"/static/lightmaps/{os.path.basename(lightmap_path)}",
        "data": lightmap_base64
    }
    return map_json


def save_map_json(map_data: dict, map_id: str) -> str:
    filename = f"{map_id}.json"
    filepath = LIGHTMAP_DIR / filename
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(map_data, f, ensure_ascii=False, indent=2)
    return str(filepath)
