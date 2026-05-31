import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import pytesseract


@dataclass
class OCRLine:
    text: str
    confidence: float
    x: int
    y: int
    width: int
    height: int
    is_vertical: bool


class OCRService:
    def __init__(self):
        try:
            self.tesseract_available = True
        except Exception:
            self.tesseract_available = False

    def _extract_text_region(self, image: np.ndarray, region: Dict) -> np.ndarray:
        x, y, w, h = region['x'], region['y'], region['width'], region['height']
        return image[y:y+h, x:x+w]

    def _preprocess_ocr_image(self, region_image: np.ndarray, is_vertical: bool = False) -> np.ndarray:
        if len(region_image.shape) == 3:
            gray = cv2.cvtColor(region_image, cv2.COLOR_BGR2GRAY)
        else:
            gray = region_image.copy()
        
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        threshold = cv2.adaptiveThreshold(
            enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, 15, 8
        )
        
        if is_vertical:
            threshold = cv2.rotate(threshold, cv2.ROTATE_90_COUNTERCLOCKWISE)
        
        return threshold

    def ocr_with_tesseract(self, processed_image: np.ndarray, lang: str = 'chi_tra+chi_sim+eng') -> Tuple[str, float]:
        if not self.tesseract_available:
            return "", 0.0
        
        try:
            custom_config = r'--oem 3 --psm 6'
            data = pytesseract.image_to_data(
                processed_image,
                lang=lang,
                config=custom_config,
                output_type=pytesseract.Output.DICT
            )
            
            texts = []
            confidences = []
            
            for i, text in enumerate(data['text']):
                if text.strip() and int(data['conf'][i]) > 0:
                    texts.append(text)
                    confidences.append(int(data['conf'][i]))
            
            if texts:
                return ' '.join(texts), np.mean(confidences) / 100.0
            return "", 0.0
        except Exception as e:
            print(f"Tesseract OCR error: {e}")
            return "", 0.0

    def ocr_fallback(self, processed_image: np.ndarray) -> Tuple[str, float]:
        h, w = processed_image.shape
        
        _, binary = cv2.threshold(processed_image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        projection = np.sum(binary == 0, axis=1)
        
        lines = []
        in_line = False
        line_start = 0
        
        for i, val in enumerate(projection):
            if val > w * 0.05 and not in_line:
                in_line = True
                line_start = i
            elif val <= w * 0.05 and in_line:
                in_line = False
                if i - line_start > 5:
                    lines.append((line_start, i))
        
        if len(lines) > 0:
            return f"Detected {len(lines)} text lines (OCR model not fully loaded)", 0.3
        return "", 0.0

    def _detect_vertical_text(self, region_image: np.ndarray) -> bool:
        if len(region_image.shape) == 3:
            gray = cv2.cvtColor(region_image, cv2.COLOR_BGR2GRAY)
        else:
            gray = region_image.copy()
        
        h, w = gray.shape
        if h == 0 or w == 0:
            return False
        
        aspect_ratio = w / h
        if aspect_ratio < 0.4:
            return True
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        vertical_projection = np.sum(binary, axis=0)
        horizontal_projection = np.sum(binary, axis=1)
        
        v_variance = np.var(vertical_projection)
        h_variance = np.var(horizontal_projection)
        
        if h_variance > v_variance * 1.5:
            return True
        
        return False

    def ocr_region(self, image: np.ndarray, region: Dict) -> Tuple[str, float, bool]:
        region_image = self._extract_text_region(image, region)
        
        if region_image.size == 0:
            return "", 0.0, False
        
        is_vertical = region.get('is_vertical', False) or self._detect_vertical_text(region_image)
        
        processed = self._preprocess_ocr_image(region_image, is_vertical)
        
        text, confidence = self.ocr_with_tesseract(processed)
        
        if not text or confidence < 0.2:
            text_fallback, conf_fallback = self.ocr_fallback(processed)
            if text_fallback:
                text = text_fallback
                confidence = conf_fallback
        
        if is_vertical:
            text = self._reorder_vertical_text(text)
        
        return text, confidence, is_vertical

    def _reorder_vertical_text(self, text: str) -> str:
        lines = text.split('\n')
        lines = [l.strip() for l in lines if l.strip()]
        
        if len(lines) > 1:
            return '\n'.join(reversed(lines))
        return text

    def ocr_document(self, image: np.ndarray, layout_regions: List[Dict]) -> List[Dict]:
        ocr_results = []
        
        for i, region in enumerate(layout_regions):
            if region['region_type'] == 'text':
                text, confidence, is_vertical = self.ocr_region(image, region)
                
                if text:
                    ocr_results.append({
                        'layout_region_index': i,
                        'text': text,
                        'confidence': confidence,
                        'is_vertical': is_vertical,
                        'region_info': region
                    })
        
        return ocr_results

    def ocr_bytes(self, image_bytes: bytes, layout_regions: List[Dict] = None) -> List[Dict]:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        if layout_regions is None:
            h, w = image.shape[:2]
            layout_regions = [{
                'region_type': 'text',
                'x': 0,
                'y': 0,
                'width': w,
                'height': h,
                'is_vertical': False
            }]
        
        return self.ocr_document(image, layout_regions)


def get_ocr_service():
    return OCRService()
