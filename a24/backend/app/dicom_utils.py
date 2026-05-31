import io
import uuid
import numpy as np
from pydicom import dcmread
from pydicom.errors import InvalidDicomError
from typing import Optional, Dict, Any, Tuple
from PIL import Image


def parse_dicom_metadata(file_bytes: bytes) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    try:
        ds = dcmread(io.BytesIO(file_bytes), force=True)
    except InvalidDicomError:
        return None, "无效的 DICOM 文件"

    metadata = {
        "patient": {},
        "study": {},
        "series": {},
        "instance": {}
    }

    metadata["patient"]["patient_id"] = getattr(ds, "PatientID", str(uuid.uuid4()))
    metadata["patient"]["name"] = str(getattr(ds, "PatientName", "Unknown"))
    metadata["patient"]["birth_date"] = getattr(ds, "PatientBirthDate", None)
    metadata["patient"]["gender"] = getattr(ds, "PatientSex", None)

    metadata["study"]["study_uid"] = getattr(ds, "StudyInstanceUID", str(uuid.uuid4()))
    metadata["study"]["study_date"] = getattr(ds, "StudyDate", None)
    metadata["study"]["study_time"] = getattr(ds, "StudyTime", None)
    metadata["study"]["study_description"] = getattr(ds, "StudyDescription", None)
    metadata["study"]["institution"] = getattr(ds, "InstitutionName", None)
    metadata["study"]["referring_physician"] = str(getattr(ds, "ReferringPhysicianName", None))
    metadata["study"]["modality"] = getattr(ds, "Modality", None)

    metadata["series"]["series_uid"] = getattr(ds, "SeriesInstanceUID", str(uuid.uuid4()))
    metadata["series"]["series_number"] = getattr(ds, "SeriesNumber", None)
    metadata["series"]["modality"] = getattr(ds, "Modality", None)
    metadata["series"]["series_description"] = getattr(ds, "SeriesDescription", None)
    metadata["series"]["body_part"] = getattr(ds, "BodyPartExamined", None)
    metadata["series"]["rows"] = getattr(ds, "Rows", None)
    metadata["series"]["columns"] = getattr(ds, "Columns", None)
    metadata["series"]["slice_thickness"] = getattr(ds, "SliceThickness", None)

    spacing = getattr(ds, "SpacingBetweenSlices", None)
    if spacing is None:
        spacing = getattr(ds, "SliceThickness", None)
    metadata["series"]["slice_spacing"] = spacing

    pixel_spacing = getattr(ds, "PixelSpacing", None)
    if pixel_spacing:
        metadata["series"]["pixel_spacing"] = [float(pixel_spacing[0]), float(pixel_spacing[1])]
    else:
        metadata["series"]["pixel_spacing"] = None

    image_orientation = getattr(ds, "ImageOrientationPatient", None)
    if image_orientation:
        metadata["series"]["image_orientation"] = [float(x) for x in image_orientation]
    else:
        metadata["series"]["image_orientation"] = None

    image_position = getattr(ds, "ImagePositionPatient", None)
    if image_position:
        metadata["series"]["image_position"] = [float(x) for x in image_position]
    else:
        metadata["series"]["image_position"] = None

    wc = getattr(ds, "WindowCenter", None)
    ww = getattr(ds, "WindowWidth", None)
    if wc:
        metadata["series"]["window_center"] = float(wc[0]) if isinstance(wc, list) else float(wc)
    if ww:
        metadata["series"]["window_width"] = float(ww[0]) if isinstance(ww, list) else float(ww)

    metadata["instance"]["instance_uid"] = getattr(ds, "SOPInstanceUID", str(uuid.uuid4()))
    metadata["instance"]["instance_number"] = getattr(ds, "InstanceNumber", None)
    metadata["instance"]["sop_class_uid"] = getattr(ds, "SOPClassUID", None)
    metadata["instance"]["slice_location"] = getattr(ds, "SliceLocation", None)

    image_position_inst = getattr(ds, "ImagePositionPatient", None)
    if image_position_inst:
        metadata["instance"]["image_position"] = [float(x) for x in image_position_inst]
    else:
        metadata["instance"]["image_position"] = None

    return metadata, None


def apply_voi_lut(arr: np.ndarray, window_center: float, window_width: float) -> np.ndarray:
    if window_width <= 0:
        min_val = arr.min()
        max_val = arr.max()
    else:
        min_val = window_center - window_width / 2
        max_val = window_center + window_width / 2

    arr = np.clip(arr, min_val, max_val)

    if max_val == min_val:
        arr = np.full_like(arr, 127, dtype=np.uint8)
    else:
        arr = ((arr - min_val) / (max_val - min_val) * 255).astype(np.uint8)

    return arr


def dicom_to_png(
    file_bytes: bytes,
    window_center: Optional[float] = None,
    window_width: Optional[float] = None
) -> Optional[bytes]:
    try:
        ds = dcmread(io.BytesIO(file_bytes), force=True)
        if not hasattr(ds, 'pixel_array'):
            return None

        arr = ds.pixel_array.astype(np.float32)

        if hasattr(ds, 'RescaleSlope') and ds.RescaleSlope is not None:
            try:
                arr = arr * float(ds.RescaleSlope)
            except (ValueError, TypeError):
                pass

        if hasattr(ds, 'RescaleIntercept') and ds.RescaleIntercept is not None:
            try:
                arr = arr + float(ds.RescaleIntercept)
            except (ValueError, TypeError):
                pass

        wc = window_center
        ww = window_width

        if wc is None or ww is None:
            ds_wc = getattr(ds, 'WindowCenter', None)
            ds_ww = getattr(ds, 'WindowWidth', None)

            if ds_wc is not None and wc is None:
                if isinstance(ds_wc, (list, tuple)):
                    try:
                        wc = float(ds_wc[0])
                    except (ValueError, TypeError, IndexError):
                        wc = None
                else:
                    try:
                        wc = float(ds_wc)
                    except (ValueError, TypeError):
                        wc = None

            if ds_ww is not None and ww is None:
                if isinstance(ds_ww, (list, tuple)):
                    try:
                        ww = float(ds_ww[0])
                    except (ValueError, TypeError, IndexError):
                        ww = None
                else:
                    try:
                        ww = float(ds_ww)
                    except (ValueError, TypeError):
                        ww = None

        if wc is None or ww is None:
            min_val = arr.min()
            max_val = arr.max()
            wc = (min_val + max_val) / 2
            ww = max_val - min_val

        arr = apply_voi_lut(arr, float(wc), float(ww))

        if arr.ndim == 3 and arr.shape[-1] == 3:
            img = Image.fromarray(arr, mode='RGB')
        else:
            img = Image.fromarray(arr, mode='L')

        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        return buffer.getvalue()

    except Exception as e:
        print(f"Error in dicom_to_png: {e}")
        return None
