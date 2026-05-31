import os
import uuid
import json
from pathlib import Path
from typing import Dict, Any, List, Tuple
from PIL import Image

from app.core.config import UPLOAD_DIR


def slice_tileset(
    image: Image.Image,
    tile_width: int,
    tile_height: int,
    margin: int = 0,
    spacing: int = 0,
    remove_empty: bool = True
) -> Dict[str, Any]:
    img_width, img_height = image.size
    
    columns = (img_width - margin * 2 + spacing) // (tile_width + spacing)
    rows = (img_height - margin * 2 + spacing) // (tile_height + spacing)
    
    tiles = []
    for row in range(rows):
        for col in range(columns):
            x = margin + col * (tile_width + spacing)
            y = margin + row * (tile_height + spacing)
            
            tile = image.crop((x, y, x + tile_width, y + tile_height))
            
            is_empty = False
            if remove_empty:
                is_empty = is_tile_empty(tile)
            
            tiles.append({
                "id": row * columns + col,
                "row": row,
                "col": col,
                "x": x,
                "y": y,
                "is_empty": is_empty
            })
    
    return {
        "original_size": {"width": img_width, "height": img_height},
        "tile_size": {"width": tile_width, "height": tile_height},
        "margin": margin,
        "spacing": spacing,
        "columns": columns,
        "rows": rows,
        "total_tiles": len(tiles),
        "non_empty_tiles": sum(1 for t in tiles if not t["is_empty"]),
        "tiles": tiles
    }


def is_tile_empty(tile: Image.Image, threshold: int = 5) -> bool:
    if tile.mode == 'RGBA':
        alpha = tile.getchannel('A')
        return all(p < threshold for p in alpha.getdata())
    else:
        grayscale = tile.convert('L')
        pixels = list(grayscale.getdata())
        return all(p > 255 - threshold for p in pixels)


def save_sliced_tileset(
    image: Image.Image,
    tile_info: Dict[str, Any],
    tileset_id: str
) -> Dict[str, Any]:
    output_dir = UPLOAD_DIR / tileset_id
    os.makedirs(output_dir, exist_ok=True)
    
    tile_width = tile_info["tile_size"]["width"]
    tile_height = tile_info["tile_size"]["height"]
    margin = tile_info["margin"]
    spacing = tile_info["spacing"]
    
    saved_tiles = []
    
    for tile_data in tile_info["tiles"]:
        if tile_data["is_empty"]:
            continue
            
        x = tile_data["x"]
        y = tile_data["y"]
        
        tile_image = image.crop((x, y, x + tile_width, y + tile_height))
        
        tile_filename = f"tile_{tile_data['id']}.png"
        tile_path = output_dir / tile_filename
        tile_image.save(tile_path, format="PNG")
        
        saved_tiles.append({
            "id": tile_data["id"],
            "row": tile_data["row"],
            "col": tile_data["col"],
            "path": f"/static/uploads/{tileset_id}/{tile_filename}"
        })
    
    original_path = output_dir / "original.png"
    if image.mode == 'RGBA':
        image.save(original_path, format="PNG")
    else:
        image = image.convert('RGBA')
        image.save(original_path, format="PNG")
    
    info_path = output_dir / "tileset_info.json"
    with open(info_path, "w", encoding="utf-8") as f:
        json.dump({
            "tileset_id": tileset_id,
            "original_size": tile_info["original_size"],
            "tile_size": tile_info["tile_size"],
            "margin": margin,
            "spacing": spacing,
            "columns": tile_info["columns"],
            "rows": tile_info["rows"],
            "tiles": saved_tiles
        }, f, ensure_ascii=False, indent=2)
    
    return {
        "tileset_id": tileset_id,
        "original_path": f"/static/uploads/{tileset_id}/original.png",
        "info_path": f"/static/uploads/{tileset_id}/tileset_info.json",
        "tiles": saved_tiles,
        "total_tiles": tile_info["total_tiles"],
        "saved_tiles": len(saved_tiles)
    }


def process_tileset_upload(
    file_content: bytes,
    tile_width: int,
    tile_height: int,
    margin: int = 0,
    spacing: int = 0,
    remove_empty: bool = True
) -> Dict[str, Any]:
    from io import BytesIO
    
    tileset_id = str(uuid.uuid4())
    
    image = Image.open(BytesIO(file_content))
    
    if image.mode not in ['RGBA', 'RGB']:
        image = image.convert('RGBA')
    
    tile_info = slice_tileset(
        image,
        tile_width,
        tile_height,
        margin,
        spacing,
        remove_empty
    )
    
    result = save_sliced_tileset(image, tile_info, tileset_id)
    
    return result


def get_tileset_info(tileset_id: str) -> Dict[str, Any]:
    info_path = UPLOAD_DIR / tileset_id / "tileset_info.json"
    
    if not info_path.exists():
        return None
    
    with open(info_path, "r", encoding="utf-8") as f:
        return json.load(f)
