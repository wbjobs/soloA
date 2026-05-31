import io
import numpy as np
from typing import Optional, Tuple, List
from pydicom import dcmread
from PIL import Image
from scipy.ndimage import zoom as scipy_zoom


def load_volume_from_files(
    file_bytes_list: List[bytes],
    slice_order: List[int] = None
) -> Optional[np.ndarray]:
    try:
        slices = []
        for i, file_bytes in enumerate(file_bytes_list):
            ds = dcmread(io.BytesIO(file_bytes), force=True)
            if hasattr(ds, 'pixel_array'):
                arr = ds.pixel_array.astype(np.int16)

                if hasattr(ds, 'RescaleSlope') and ds.RescaleSlope:
                    arr = arr * float(ds.RescaleSlope)
                if hasattr(ds, 'RescaleIntercept') and ds.RescaleIntercept:
                    arr = arr + float(ds.RescaleIntercept)

                slices.append(arr)

        if not slices:
            return None

        if slice_order:
            slices = [slices[i] for i in slice_order]

        volume = np.stack(slices, axis=0)
        return volume

    except Exception as e:
        print(f"Error loading volume: {e}")
        return None


def apply_window_level(
    arr: np.ndarray,
    window_center: float,
    window_width: float
) -> np.ndarray:
    if window_width <= 0:
        min_val = arr.min()
        max_val = arr.max()
    else:
        min_val = window_center - window_width / 2
        max_val = window_center + window_width / 2

    arr = np.clip(arr, min_val, max_val)

    if max_val == min_val:
        return np.full_like(arr, 127, dtype=np.uint8)

    return ((arr - min_val) / (max_val - min_val) * 255).astype(np.uint8)


def compute_mip(
    volume: np.ndarray,
    axis: int = 0,
    window_center: Optional[float] = None,
    window_width: Optional[float] = None
) -> Optional[np.ndarray]:
    try:
        if axis < 0 or axis >= volume.ndim:
            return None

        mip = np.max(volume, axis=axis)

        if window_center is not None and window_width is not None:
            mip = apply_window_level(mip, window_center, window_width)
        else:
            mip = apply_window_level(mip, mip.mean(), mip.max() - mip.min())

        return mip
    except Exception as e:
        print(f"Error computing MIP: {e}")
        return None


def compute_minip(
    volume: np.ndarray,
    axis: int = 0,
    window_center: Optional[float] = None,
    window_width: Optional[float] = None
) -> Optional[np.ndarray]:
    try:
        if axis < 0 or axis >= volume.ndim:
            return None

        minip = np.min(volume, axis=axis)

        if window_center is not None and window_width is not None:
            minip = apply_window_level(minip, window_center, window_width)
        else:
            minip = apply_window_level(minip, minip.mean(), minip.max() - minip.min())

        return minip
    except Exception as e:
        print(f"Error computing MinIP: {e}")
        return None


def compute_average(
    volume: np.ndarray,
    axis: int = 0,
    window_center: Optional[float] = None,
    window_width: Optional[float] = None
) -> Optional[np.ndarray]:
    try:
        if axis < 0 or axis >= volume.ndim:
            return None

        avg = np.mean(volume, axis=axis)

        if window_center is not None and window_width is not None:
            avg = apply_window_level(avg, window_center, window_width)
        else:
            avg = apply_window_level(avg, avg.mean(), avg.max() - avg.min())

        return avg
    except Exception as e:
        print(f"Error computing average: {e}")
        return None


def reslice_volume(
    volume: np.ndarray,
    start: Tuple[int, int, int],
    end: Tuple[int, int, int],
    num_slices: int = 50
) -> Optional[np.ndarray]:
    try:
        from scipy.ndimage import map_coordinates

        start_arr = np.array(start, dtype=np.float64)
        end_arr = np.array(end, dtype=np.float64)
        steps = np.linspace(0, 1, num_slices)

        coords = np.outer(steps, end_arr - start_arr) + start_arr
        coords = coords.T

        resliced = map_coordinates(volume, coords, order=1)
        return resliced
    except Exception as e:
        print(f"Error reslicing volume: {e}")
        return None


def array_to_png(arr: np.ndarray) -> Optional[bytes]:
    try:
        if arr.ndim == 2:
            img = Image.fromarray(arr, mode='L')
        elif arr.ndim == 3 and arr.shape[-1] == 3:
            img = Image.fromarray(arr, mode='RGB')
        else:
            return None

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()
    except Exception as e:
        print(f"Error converting array to PNG: {e}")
        return None


def create_volume_thumbnail(
    volume: np.ndarray,
    size: Tuple[int, int] = (256, 256)
) -> Optional[bytes]:
    try:
        axial = compute_mip(volume, axis=0, window_center=-600, window_width=1500)
        sagittal = compute_mip(volume, axis=1, window_center=-600, window_width=1500)
        coronal = compute_mip(volume, axis=2, window_center=-600, window_width=1500)

        if axial is None or sagittal is None or coronal is None:
            return None

        axial = np.array(Image.fromarray(axial).resize(size))
        sagittal = np.array(Image.fromarray(sagittal).resize(size))
        coronal = np.array(Image.fromarray(coronal).resize(size))

        h, w = size
        combined = np.zeros((h, w * 3), dtype=np.uint8)
        combined[:, :w] = axial
        combined[:, w:2*w] = sagittal
        combined[:, 2*w:] = coronal

        return array_to_png(combined)
    except Exception as e:
        print(f"Error creating volume thumbnail: {e}")
        return None
