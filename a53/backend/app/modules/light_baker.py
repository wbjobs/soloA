import math
from typing import Callable, Optional, List, Dict, Any, Tuple
from PIL import Image
import numpy as np


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join(c * 2 for c in hex_color)
    return (
        int(hex_color[0:2], 16),
        int(hex_color[2:4], 16),
        int(hex_color[4:6], 16)
    )


def build_collision_grid(map_data: Dict[str, Any]) -> np.ndarray:
    width = map_data["width"]
    height = map_data["height"]
    grid = np.zeros((height, width), dtype=np.uint8)
    
    for tile in map_data.get("tiles", []):
        layer = tile.get("layer", "")
        x = tile.get("x", 0)
        y = tile.get("y", 0)
        
        if layer == "collision" and 0 <= x < width and 0 <= y < height:
            grid[y, x] = 1
    
    return grid


def is_line_of_sight_blocked(
    start: Tuple[float, float],
    end: Tuple[float, float],
    collision_grid: np.ndarray
) -> bool:
    x0, y0 = start
    x1, y1 = end
    height, width = collision_grid.shape
    
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    
    step_size = 0.25
    max_steps = int((dx + dy) / step_size) + 2
    
    for _ in range(max_steps):
        tile_x = int(x0)
        tile_y = int(y0)
        
        if 0 <= tile_x < width and 0 <= tile_y < height:
            if collision_grid[tile_y, tile_x] == 1:
                return True
        
        if abs(x0 - x1) < step_size and abs(y0 - y1) < step_size:
            return False
            
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x0 += sx * step_size
        if e2 < dx:
            err += dx
            y0 += sy * step_size
    
    return False


def calculate_tile_light(
    tile_x: int,
    tile_y: int,
    light_sources: List[Dict[str, Any]],
    collision_grid: np.ndarray,
    ambient: float
) -> Tuple[float, float, float]:
    r_total = 0.0
    g_total = 0.0
    b_total = 0.0
    
    tile_center = (tile_x + 0.5, tile_y + 0.5)
    
    for light in light_sources:
        lx = light["x"]
        ly = light["y"]
        intensity = light.get("intensity", 1.0)
        radius = light.get("radius", 5.0)
        color = light.get("color", "#ffffff")
        
        lr, lg, lb = hex_to_rgb(color)
        
        dx = tile_center[0] - lx
        dy = tile_center[1] - ly
        distance = math.sqrt(dx * dx + dy * dy)
        
        if distance > radius:
            continue
        
        if is_line_of_sight_blocked((lx, ly), tile_center, collision_grid):
            continue
        
        attenuation = max(0.0, 1.0 - distance / radius)
        attenuation = attenuation * attenuation
        
        r_total += (lr / 255.0) * intensity * attenuation
        g_total += (lg / 255.0) * intensity * attenuation
        b_total += (lb / 255.0) * intensity * attenuation
    
    r_total += ambient
    g_total += ambient
    b_total += ambient
    
    return (
        min(1.0, r_total),
        min(1.0, g_total),
        min(1.0, b_total)
    )


def bake_lightmap(
    map_data: Dict[str, Any],
    ambient: float = 0.2,
    progress_callback: Optional[Callable[[float], None]] = None
) -> Image.Image:
    width = map_data["width"]
    height = map_data["height"]
    tile_size = map_data.get("tileSize", 32)
    
    collision_grid = build_collision_grid(map_data)
    light_sources = map_data.get("lightSources", [])
    
    lightmap_width = width * tile_size
    lightmap_height = height * tile_size
    
    lightmap = Image.new("RGB", (lightmap_width, lightmap_height), (
        int(ambient * 255),
        int(ambient * 255),
        int(ambient * 255)
    ))
    pixels = lightmap.load()
    
    total_tiles = width * height
    processed = 0
    
    for ty in range(height):
        for tx in range(width):
            r, g, b = calculate_tile_light(
                tx, ty,
                light_sources,
                collision_grid,
                ambient
            )
            
            ir = int(r * 255)
            ig = int(g * 255)
            ib = int(b * 255)
            
            for py in range(tile_size):
                for px in range(tile_size):
                    pixels[tx * tile_size + px, ty * tile_size + py] = (ir, ig, ib)
            
            processed += 1
            if progress_callback:
                progress_callback(processed / total_tiles)
    
    return lightmap
