import cv2
import numpy as np
from typing import Tuple, List, Dict
from PIL import Image


class InpaintingService:
    def __init__(self):
        self.telea_radius = 5
        self.ns_radius = 3

    def detect_damage_regions(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        mask = np.zeros_like(gray, dtype=np.uint8)
        
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if 10 < area < 5000:
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / h if h > 0 else 0
                
                if 0.1 < aspect_ratio < 10:
                    mask[y:y+h, x:x+w] = 255
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV) if len(image.shape) == 3 else None
        if hsv is not None:
            lower_stain = np.array([10, 20, 30])
            upper_stain = np.array([40, 100, 180])
            stain_mask = cv2.inRange(hsv, lower_stain, upper_stain)
            mask = cv2.bitwise_or(mask, stain_mask)
        
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.dilate(mask, kernel, iterations=2)
        mask = cv2.GaussianBlur(mask, (7, 7), 0)
        _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
        
        return mask

    def inpaint_telea(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        return cv2.inpaint(image, mask, self.telea_radius, cv2.INPAINT_TELEA)

    def inpaint_ns(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        return cv2.inpaint(image, mask, self.ns_radius, cv2.INPAINT_NS)

    def enhance_ink(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            
            l = cv2.addWeighted(l, 1.2, l, 0, -20)
            
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            
            lab = cv2.merge((l, a, b))
            enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
            
            kernel = np.array([
                [-1, -1, -1],
                [-1, 9, -1],
                [-1, -1, -1]
            ])
            enhanced = cv2.filter2D(enhanced, -1, kernel)
            
            return enhanced
        return image

    def hybrid_inpainting(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        telea = self.inpaint_telea(image, mask)
        ns = self.inpaint_ns(image, mask)
        
        blended = cv2.addWeighted(telea, 0.6, ns, 0.4, 0)
        enhanced = self.enhance_ink(blended)
        
        return enhanced

    def inpaint_pipeline(self, image: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        mask = self.detect_damage_regions(image)
        inpainted = self.hybrid_inpainting(image, mask)
        return inpainted, mask

    def inpaint_bytes(self, image_bytes: bytes) -> Tuple[bytes, bytes]:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        inpainted, mask = self.inpaint_pipeline(image)
        
        _, inpainted_encoded = cv2.imencode('.png', inpainted)
        _, mask_encoded = cv2.imencode('.png', mask)
        
        return inpainted_encoded.tobytes(), mask_encoded.tobytes()


def get_inpainting_service():
    return InpaintingService()
