import numpy as np
from typing import Dict, Any, Optional, Tuple, List
from pathlib import Path
import subprocess
import shutil
import tempfile
import logging
from dataclasses import dataclass
from enum import Enum

from .postprocessing import WavefieldPostprocessor

logger = logging.getLogger(__name__)


class VideoFormat(str, Enum):
    MP4 = "mp4"
    WEBM = "webm"
    GIF = "gif"


class Colormap(str, Enum):
    VIRIDIS = "viridis"
    SEISMIC = "seismic"
    JET = "jet"
    HOT = "hot"
    COOL = "cool"


@dataclass
class AnimationConfig:
    """Configuration for animation export."""
    width: int = 800
    height: int = 600
    fps: int = 24
    format: VideoFormat = VideoFormat.MP4
    colormap: Colormap = Colormap.VIRIDIS
    field_type: str = "magnitude"
    include_time_label: bool = True
    include_colorbar: bool = True
    quality: int = 85
    add_waveform_inset: bool = False


class WavefieldAnimator:
    """
    Generate animations from seismic wavefield snapshots using FFmpeg.
    
    Features:
    - Generate MP4, WebM, or GIF animations
    - Multiple colormap options
    - Time labels and colorbars
    - Optional waveform inset
    """

    def __init__(self, hdf5_path: Path, temp_dir: Optional[Path] = None):
        self.hdf5_path = Path(hdf5_path)
        self.temp_dir = temp_dir or Path(tempfile.mkdtemp(prefix="seismic_anim_"))
        self.postprocessor = WavefieldPostprocessor(self.hdf5_path)
        self.frame_dir = self.temp_dir / "frames"
        self.frame_dir.mkdir(parents=True, exist_ok=True)

        self._colormaps = {
            'viridis': self._colormap_viridis,
            'seismic': self._colormap_seismic,
            'jet': self._colormap_jet,
            'hot': self._colormap_hot,
            'cool': self._colormap_cool
        }

    def check_ffmpeg(self) -> bool:
        """Check if FFmpeg is available."""
        return shutil.which('ffmpeg') is not None

    def _colormap_viridis(self, value: float) -> Tuple[int, int, int]:
        t = max(0.0, min(1.0, value))
        if t < 0.2:
            s = t / 0.2
            return (int(68 + s * 6), int(1 + s * 23), int(84 + s * 17))
        elif t < 0.4:
            s = (t - 0.2) / 0.2
            return (int(74 + s * 20), int(24 + s * 41), int(101 + s * 33))
        elif t < 0.6:
            s = (t - 0.4) / 0.2
            return (int(94 + s * 81), int(65 + s * 56), int(134 - s * 20))
        elif t < 0.8:
            s = (t - 0.6) / 0.2
            return (int(175 + s * 57), int(121 - s * 20), int(114 - s * 43))
        else:
            s = (t - 0.8) / 0.2
            return (int(232 + s * 21), int(101 - s * 24), int(71 + s * 9))

    def _colormap_seismic(self, value: float) -> Tuple[int, int, int]:
        t = max(0.0, min(1.0, value))
        if t < 0.5:
            s = t / 0.5
            return (0, int(255 * s), 255)
        else:
            s = (t - 0.5) / 0.5
            return (int(255 * s), int(255 * (1 - s)), 0)

    def _colormap_jet(self, value: float) -> Tuple[int, int, int]:
        t = max(0.0, min(1.0, value))
        if t < 0.125:
            return (0, 0, int(128 + t * 8 * 127))
        elif t < 0.375:
            s = (t - 0.125) / 0.25
            return (0, int(s * 255), 255)
        elif t < 0.625:
            s = (t - 0.375) / 0.25
            return (int(s * 255), 255, int(255 - s * 255))
        elif t < 0.875:
            s = (t - 0.625) / 0.25
            return (255, int(255 - s * 255), 0)
        else:
            s = (t - 0.875) / 0.125
            return (255, 0, 0)

    def _colormap_hot(self, value: float) -> Tuple[int, int, int]:
        t = max(0.0, min(1.0, value))
        if t < 0.33:
            return (int(255 * t / 0.33), 0, 0)
        elif t < 0.66:
            s = (t - 0.33) / 0.33
            return (255, int(255 * s), 0)
        else:
            s = (t - 0.66) / 0.34
            return (255, 255, int(255 * s))

    def _colormap_cool(self, value: float) -> Tuple[int, int, int]:
        t = max(0.0, min(1.0, value))
        return (int(t * 255), int(255 - t * 255), 255)

    def _value_to_color(self, value: float, colormap: Colormap) -> Tuple[int, int, int]:
        colormap_func = self._colormaps.get(colormap.value, self._colormaps['viridis'])
        return colormap_func(value)

    def _generate_frame_image(
        self,
        snapshot_index: int,
        config: AnimationConfig
    ) -> np.ndarray:
        """Generate a single frame as RGB numpy array."""
        snapshot = self.postprocessor.get_snapshot(snapshot_index)

        data = {
            'ux': snapshot['ux'],
            'uy': snapshot['uy'],
            'magnitude': snapshot['magnitude']
        }.get(config.field_type, snapshot['magnitude'])

        mesh_info = self.postprocessor.get_mesh_info()
        nodes = mesh_info['nodes']

        from scipy.interpolate import griddata

        x = np.linspace(nodes[:, 0].min(), nodes[:, 0].max(), config.width)
        y = np.linspace(nodes[:, 1].min(), nodes[:, 1].max(), config.height)
        XI, YI = np.meshgrid(x, y)

        grid_data = griddata(nodes, data, (XI, YI), method='linear', fill_value=0)

        data_min = grid_data.min()
        data_max = grid_data.max()
        if data_max == data_min:
            normalized = np.zeros_like(grid_data)
        else:
            normalized = (grid_data - data_min) / (data_max - data_min)

        image = np.zeros((config.height, config.width, 3), dtype=np.uint8)
        colormap_func = self._colormaps.get(config.colormap.value, self._colormaps['viridis'])

        for j in range(config.height):
            for i in range(config.width):
                val = normalized[config.height - 1 - j, i]
                r, g, b = colormap_func(val)
                image[j, i] = [r, g, b]

        if config.include_time_label:
            image = self._add_time_label(image, snapshot['time'], snapshot_index)

        if config.include_colorbar:
            image = self._add_colorbar(image, config)

        return image

    def _add_time_label(
        self,
        image: np.ndarray,
        time: float,
        snapshot_idx: int
    ) -> np.ndarray:
        """Add time label to frame (simple text rendering)."""
        h, w, _ = image.shape
        label_text = f"t = {time:.4f}s"

        font_height = 16
        y_pos = 20
        x_pos = w - 150

        for i, char in enumerate(label_text):
            char_x = x_pos + i * 10
            self._draw_char(image, char, char_x, y_pos, font_height)

        return image

    def _draw_char(
        self,
        image: np.ndarray,
        char: str,
        x: int,
        y: int,
        height: int
    ):
        """Simple character rendering for time labels."""
        h, w, _ = image.shape
        if y < 0 or y >= h or x < 0 or x >= w:
            return

        size = min(height, h - y)
        colors = {
            ' ': [],
            '.': [(1, 4)],
            ':': [(1, 1), (1, 4)],
            '-': [(0, 2), (1, 2), (2, 2), (3, 2)],
            '+': [(1, 0), (1, 1), (1, 2), (1, 3), (1, 4), (0, 2), (2, 2)],
            '0': [(0, 1), (0, 2), (0, 3), (1, 0), (1, 4), (2, 0), (2, 4), (3, 0), (3, 4), (4, 1), (4, 2), (4, 3)],
            '1': [(0, 2), (1, 1), (1, 2), (2, 2), (3, 2), (4, 0), (4, 1), (4, 2), (4, 3), (4, 4)],
            '2': [(0, 0), (0, 1), (0, 2), (1, 3), (2, 2), (3, 1), (4, 0), (4, 1), (4, 2), (4, 3), (4, 4)],
            '3': [(0, 0), (0, 1), (0, 2), (1, 3), (2, 0), (2, 1), (2, 2), (3, 3), (4, 0), (4, 1), (4, 2)],
            '4': [(0, 0), (0, 3), (1, 0), (1, 3), (2, 0), (2, 1), (2, 2), (2, 3), (2, 4), (3, 3), (4, 3)],
            '5': [(0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (1, 0), (2, 0), (2, 1), (2, 2), (3, 3), (4, 0), (4, 1), (4, 2), (4, 3), (4, 4)],
            '6': [(0, 1), (0, 2), (0, 3), (1, 0), (2, 0), (2, 1), (2, 2), (2, 3), (3, 0), (3, 4), (4, 1), (4, 2), (4, 3)],
            '7': [(0, 0), (0, 1), (0, 2), (0, 3), (0, 4), (1, 3), (2, 2), (3, 1), (4, 0)],
            '8': [(0, 1), (0, 2), (0, 3), (1, 0), (1, 4), (2, 1), (2, 2), (2, 3), (3, 0), (3, 4), (4, 1), (4, 2), (4, 3)],
            '9': [(0, 1), (0, 2), (0, 3), (1, 0), (1, 4), (2, 0), (2, 1), (2, 2), (2, 3), (2, 4), (3, 3), (4, 1), (4, 2), (4, 3)],
            's': [(0, 1), (0, 2), (0, 3), (0, 4), (1, 0), (2, 1), (2, 2), (2, 3), (3, 4), (4, 0), (4, 1), (4, 2), (4, 3)],
        }

        pixel_pattern = colors.get(char, [])
        scale = height // 5

        for py, px in pixel_pattern:
            for dy in range(scale):
                for dx in range(scale):
                    iy = y + py * scale + dy
                    ix = x + px * scale + dx
                    if 0 <= iy < image.shape[0] and 0 <= ix < image.shape[1]:
                        image[iy, ix] = [255, 255, 255]

    def _add_colorbar(
        self,
        image: np.ndarray,
        config: AnimationConfig
    ) -> np.ndarray:
        """Add colorbar to frame."""
        h, w, _ = image.shape
        bar_width = 20
        bar_height = h - 40
        bar_x = w - bar_width - 10
        bar_y = 20

        colormap_func = self._colormaps.get(config.colormap.value, self._colormaps['viridis'])

        for j in range(bar_height):
            val = 1.0 - j / bar_height
            r, g, b = colormap_func(val)
            for i in range(bar_width):
                iy = bar_y + j
                ix = bar_x + i
                if 0 <= iy < h and 0 <= ix < w:
                    image[iy, ix] = [r, g, b]

        return image

    def _save_frame_as_ppm(self, image: np.ndarray, frame_path: Path):
        """Save frame as PPM image (fast, no compression)."""
        h, w, _ = image.shape
        with open(frame_path, 'wb') as f:
            f.write(f"P6\n{w} {h}\n255\n".encode())
            f.write(image.tobytes())

    def generate_frames(
        self,
        config: AnimationConfig,
        progress_callback: Optional[callable] = None
    ) -> int:
        """Generate all frames from snapshots."""
        n_snapshots = self.postprocessor.get_snapshot_count()
        logger.info(f"Generating {n_snapshots} frames...")

        for i in range(n_snapshots):
            try:
                image = self._generate_frame_image(i, config)
                frame_path = self.frame_dir / f"frame_{i:06d}.ppm"
                self._save_frame_as_ppm(image, frame_path)

                if progress_callback:
                    progress = (i + 1) / n_snapshots
                    progress_callback(progress)

            except Exception as e:
                logger.error(f"Error generating frame {i}: {e}")
                raise

        logger.info(f"Generated {n_snapshots} frames")
        return n_snapshots

    def _build_ffmpeg_command(
        self,
        output_path: Path,
        config: AnimationConfig,
        n_frames: int
    ) -> List[str]:
        """Build FFmpeg command for video encoding."""
        input_pattern = str(self.frame_dir / "frame_%06d.ppm")

        cmd = ['ffmpeg', '-y', '-framerate', str(config.fps)]
        cmd.extend(['-i', input_pattern])

        if config.format == VideoFormat.MP4:
            cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'medium',
                '-crf', str(max(0, min(51, 51 - int(config.quality / 2)))),
                '-pix_fmt', 'yuv420p'
            ])
        elif config.format == VideoFormat.WEBM:
            cmd.extend([
                '-c:v', 'libvpx-vp9',
                '-b:v', f'{config.quality * 100}k',
                '-deadline', 'good',
                '-cpu-used', '2'
            ])
        elif config.format == VideoFormat.GIF:
            cmd.extend([
                '-vf', f'fps={config.fps},scale={config.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                '-loop', '0'
            ])

        cmd.append(str(output_path))

        return cmd

    def render_video(
        self,
        output_path: Path,
        config: Optional[AnimationConfig] = None,
        progress_callback: Optional[callable] = None
    ) -> Path:
        """
        Render animation to video file.
        
        Args:
            output_path: Path for output video
            config: Animation configuration
            progress_callback: Optional callback for progress updates
            
        Returns:
            Path to generated video file
        """
        if not self.check_ffmpeg():
            raise RuntimeError("FFmpeg not found. Please install FFmpeg to use animation export.")

        config = config or AnimationConfig()

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            n_frames = self.generate_frames(config, progress_callback)

            cmd = self._build_ffmpeg_command(output_path, config, n_frames)

            logger.info(f"Running FFmpeg: {' '.join(cmd)}")

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = process.communicate()

            if process.returncode != 0:
                logger.error(f"FFmpeg error: {stderr.decode()}")
                raise RuntimeError(f"FFmpeg failed with code {process.returncode}")

            logger.info(f"Video generated: {output_path}")
            return output_path

        finally:
            self._cleanup()

    def _cleanup(self):
        """Clean up temporary files."""
        if self.frame_dir.exists():
            for f in self.frame_dir.glob("*.ppm"):
                try:
                    f.unlink()
                except Exception:
                    pass
            try:
                self.frame_dir.rmdir()
            except Exception:
                pass


def export_animation(
    hdf5_path: str,
    output_path: str,
    config: Optional[Dict[str, Any]] = None,
    progress_callback: Optional[callable] = None
) -> Dict[str, Any]:
    """
    Export animation from simulation results.
    
    Args:
        hdf5_path: Path to HDF5 file with simulation results
        output_path: Output video path
        config: Animation configuration dict
        progress_callback: Optional progress callback
        
    Returns:
        Dict with export information
    """
    anim_config = AnimationConfig()
    if config:
        anim_config.width = config.get('width', anim_config.width)
        anim_config.height = config.get('height', anim_config.height)
        anim_config.fps = config.get('fps', anim_config.fps)
        anim_config.format = VideoFormat(config.get('format', anim_config.format.value))
        anim_config.colormap = Colormap(config.get('colormap', anim_config.colormap.value))
        anim_config.field_type = config.get('field_type', anim_config.field_type)
        anim_config.include_time_label = config.get('include_time_label', anim_config.include_time_label)
        anim_config.include_colorbar = config.get('include_colorbar', anim_config.include_colorbar)
        anim_config.quality = config.get('quality', anim_config.quality)

    animator = WavefieldAnimator(Path(hdf5_path))

    if not animator.check_ffmpeg():
        return {
            'success': False,
            'error': 'FFmpeg not installed. Please install FFmpeg to use animation export.',
            'output_path': None
        }

    try:
        output = animator.render_video(
            Path(output_path),
            anim_config,
            progress_callback
        )

        file_size = output.stat().st_size if output.exists() else 0

        return {
            'success': True,
            'output_path': str(output),
            'file_size_bytes': file_size,
            'format': anim_config.format.value,
            'width': anim_config.width,
            'height': anim_config.height,
            'fps': anim_config.fps
        }
    except Exception as e:
        logger.exception(f"Animation export failed: {e}")
        return {
            'success': False,
            'error': str(e),
            'output_path': None
        }
