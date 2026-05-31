from astropy.io import fits
from astropy.visualization import ZScaleInterval, ImageNormalize, PercentileInterval
from astropy.visualization.stretch import LinearStretch, LogStretch, AsinhStretch
import numpy as np
from PIL import Image
import os
import sys
import struct
from typing import Optional
from app.models import FITSMetadata


class FITSService:
    """FITS文件管理服务"""
    
    def __init__(self):
        self.preview_dir = "uploads/previews"
        os.makedirs(self.preview_dir, exist_ok=True)
    
    def _ensure_native_endian(self, data: np.ndarray) -> np.ndarray:
        """
        确保数组使用本地字节序
        
        FITS标准规定使用大端序（Big-endian, MSB first），
        但不同系统可能有不同的原生字节序：
        - Big-endian (>: MSB first, PowerPC, some ARM)
        - Little-endian (<: LSB first, x86, most ARM)
        
        对于浮点数如果字节序不匹配会导致NaN或异常值。
        """
        if data is None:
            return data
        
        if not isinstance(data, np.ndarray):
            return data
        
        if data.dtype.byteorder in ('=', '|'):
            return data
        
        sys_byteorder = np.dtype(np.float32).byteorder
        
        if data.dtype.byteorder != sys_byteorder:
            return data.byteswap().newbyteorder()
        
        return data
    
    def _safe_float_conversion(self, data: np.ndarray) -> np.ndarray:
        """
        安全地转换浮点数据，处理字节序和特殊值
        """
        if data is None:
            return data
        
        data = self._ensure_native_endian(data)
        
        data = np.nan_to_num(
            data,
            nan=0.0,
            posinf=np.nanmax(data) if np.isfinite(data).any() else 0.0,
            neginf=np.nanmin(data) if np.isfinite(data).any() else 0.0
        )
        
        if np.issubdtype(data.dtype, np.floating):
            finite_mask = np.isfinite(data)
            if not finite_mask.all():
                finite_data = data[finite_mask]
                if len(finite_data) > 0:
                    median_val = np.median(finite_data)
                    data[~finite_mask] = median_val
                else:
                    data[~finite_mask] = 0.0
        
        return data
    
    def _check_and_fix_byteorder_from_header(
        self, 
        data: np.ndarray, 
        header: fits.Header
    ) -> np.ndarray:
        """
        根据头信息检查并修复字节序
        """
        if data is None:
            return data
        
        bitpix = header.get('BITPIX', 0)
        
        if bitpix in (-32, -64):
            orig_byteorder = data.dtype.byteorder
            
            sys_is_le = sys.byteorder == 'little'
            
            if orig_byteorder in ('>', '=') and not sys_is_le:
                pass
            elif orig_byteorder in ('<', '=') and sys_is_le:
                pass
            else:
                data = data.byteswap().newbyteorder()
        
        return data
    
    async def get_metadata(self, file_path: str) -> FITSMetadata:
        """获取FITS文件元数据"""
        with fits.open(file_path) as hdul:
            primary_hdu = hdul[0]
            header = primary_hdu.header
            
            naxis = header.get("NAXIS", 0)
            
            return FITSMetadata(
                filename=os.path.basename(file_path),
                naxis=naxis,
                naxis1=header.get("NAXIS1"),
                naxis2=header.get("NAXIS2"),
                naxis3=header.get("NAXIS3"),
                bitpix=self._parse_bitpix(header.get("BITPIX", 0)),
                object_name=header.get("OBJECT"),
                ra=self._get_coord(header, ["RA", "OBJCTRA", "CRVAL1"]),
                dec=self._get_coord(header, ["DEC", "OBJCTDEC", "CRVAL2"]),
                date_obs=header.get("DATE-OBS") or header.get("DATE"),
                instrument=header.get("INSTRUME"),
                telescope=header.get("TELESCOP"),
                exposure_time=header.get("EXPTIME") or header.get("EXPOSURE"),
                filter=header.get("FILTER") or header.get("FILTNAME"),
                additional_headers=self._extract_other_headers(header)
            )
    
    async def get_full_header(self, file_path: str):
        """获取完整的FITS头信息"""
        with fits.open(file_path) as hdul:
            headers = []
            for i, hdu in enumerate(hdul):
                header_dict = {}
                for card in hdu.header.cards:
                    if card.keyword and not card.keyword.startswith("COMMENT") and not card.keyword.startswith("HISTORY"):
                        header_dict[card.keyword] = {
                            "value": str(card.value),
                            "comment": card.comment or ""
                        }
                headers.append({
                    "hdu_index": i,
                    "hdu_type": type(hdu).__name__,
                    "headers": header_dict
                })
        
        return {"hdus": headers}
    
    async def generate_preview(self, file_path: str, file_id: str) -> str:
        """生成FITS文件的预览PNG图"""
        preview_path = os.path.join(self.preview_dir, f"{file_id}.png")
        
        if os.path.exists(preview_path):
            return preview_path
        
        with fits.open(file_path) as hdul:
            data = None
            primary_header = None
            
            for hdu in hdul:
                if hasattr(hdu, 'data') and hdu.data is not None and len(hdu.data.shape) >= 2:
                    data = hdu.data
                    primary_header = hdu.header
                    break
            
            if data is None:
                return self._create_placeholder_preview(preview_path)
            
            if len(data.shape) == 3:
                data = data[0]
            
            if primary_header is not None:
                data = self._check_and_fix_byteorder_from_header(data, primary_header)
            
            data = self._safe_float_conversion(data)
            
            original_dtype = data.dtype
            if np.issubdtype(original_dtype, np.floating):
                pass
            elif np.issubdtype(original_dtype, np.integer):
                pass
            
            finite_data = data[np.isfinite(data)]
            if len(finite_data) == 0:
                return self._create_placeholder_preview(preview_path)
            
            try:
                interval = ZScaleInterval()
                vmin, vmax = interval.get_limits(data)
            except Exception as e:
                try:
                    interval = PercentileInterval(99.5)
                    vmin, vmax = interval.get_limits(data)
                except Exception:
                    finite_data = data[np.isfinite(data)]
                    if len(finite_data) > 0:
                        vmin = np.percentile(finite_data, 0.5)
                        vmax = np.percentile(finite_data, 99.5)
                    else:
                        vmin, vmax = 0, 1
            
            if not np.isfinite(vmin):
                vmin = np.nanmin(data[np.isfinite(data)]) if np.isfinite(data).any() else 0
            if not np.isfinite(vmax):
                vmax = np.nanmax(data[np.isfinite(data)]) if np.isfinite(data).any() else 1
            
            if vmax <= vmin:
                vmax = vmin + 1
            
            try:
                norm = ImageNormalize(
                    data,
                    vmin=vmin,
                    vmax=vmax,
                    stretch=LinearStretch()
                )
                normalized = norm(data)
            except Exception:
                normalized = (data - vmin) / (vmax - vmin)
            
            normalized = np.clip(normalized, 0, 1)
            
            normalized = np.nan_to_num(normalized, nan=0.0, posinf=1.0, neginf=0.0)
            
            image_data = (normalized * 255).astype(np.uint8)
            
            if len(image_data.shape) == 3:
                image_data = image_data[0]
            
            if image_data.dtype != np.uint8:
                image_data = image_data.astype(np.uint8)
            
            img = Image.fromarray(image_data)
            img = img.convert("RGB")
            img.save(preview_path, "PNG")
        
        return preview_path
    
    def _parse_bitpix(self, bitpix):
        """解析BITPIX值"""
        mapping = {
            8: "8-bit unsigned integer",
            16: "16-bit signed integer",
            32: "32-bit signed integer",
            64: "64-bit signed integer",
            -32: "32-bit floating point (IEEE single precision)",
            -64: "64-bit floating point (IEEE double precision)"
        }
        return mapping.get(bitpix, f"Unknown ({bitpix})")
    
    def _get_coord(self, header, keys):
        """从头信息中获取坐标值"""
        for key in keys:
            if key in header:
                val = header[key]
                if isinstance(val, (int, float)):
                    return float(val)
                if isinstance(val, str):
                    try:
                        return float(val)
                    except ValueError:
                        pass
        return None
    
    def _extract_other_headers(self, header):
        """提取其他有价值的头信息"""
        interesting_keys = [
            "SIMPLE", "EXTEND", "NAXIS", "NAXIS1", "NAXIS2", "NAXIS3", "BITPIX",
            "BZERO", "BSCALE", "BUNIT",
            "CTYPE1", "CRVAL1", "CRPIX1", "CDELT1", "CUNIT1",
            "CTYPE2", "CRVAL2", "CRPIX2", "CDELT2", "CUNIT2",
            "CTYPE3", "CRVAL3", "CRPIX3", "CDELT3",
            "CD1_1", "CD1_2", "CD2_1", "CD2_2",
            "PC1_1", "PC1_2", "PC2_1", "PC2_2",
            "EQUINOX", "EPOCH", "RADESYS",
            "AIRMASS", "AMSTART", "AMEND",
            "GAIN", "RDNOISE", "SATURATE",
            "OBSERVER", "PROG_ID", "PROPID",
            "PI-COI", "AUTHOR",
            "XTENSION", "PCOUNT", "GCOUNT", "TFIELDS"
        ]
        
        extracted = {}
        for key in interesting_keys:
            if key in header and header[key] is not None:
                extracted[key] = str(header[key])
        
        return extracted
    
    def _create_placeholder_preview(self, preview_path):
        """创建占位符预览图"""
        img = Image.new('RGB', (256, 256), color=(20, 20, 40))
        img.save(preview_path, "PNG")
        return preview_path
