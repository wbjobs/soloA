import cv2
import numpy as np
from typing import Tuple, Dict, List


class ImagePreprocessor:
    def __init__(self):
        self.contrast_threshold = 0.3
        self.low_contrast_strength = 2.5
        self.normal_contrast_strength = 1.5

    def _calculate_local_contrast(self, gray: np.ndarray, block_size: int = 32) -> np.ndarray:
        h, w = gray.shape
        local_contrast = np.zeros_like(gray, dtype=np.float32)
        
        for i in range(0, h, block_size):
            for j in range(0, w, block_size):
                block = gray[i:min(i+block_size, h), j:min(j+block_size, w)]
                if block.size > 0:
                    block_std = np.std(block)
                    block_min = np.min(block)
                    block_max = np.max(block)
                    
                    if block_max - block_min > 0:
                        contrast = min(1.0, block_std / 64.0)
                        local_contrast[i:min(i+block_size, h), j:min(j+block_size, w)] = contrast
                    else:
                        local_contrast[i:min(i+block_size, h), j:min(j+block_size, w)] = 0
        
        local_contrast = cv2.GaussianBlur(local_contrast, (31, 31), 0)
        return local_contrast

    def _multi_scale_clahe(self, gray: np.ndarray, local_contrast: np.ndarray) -> np.ndarray:
        enhanced = np.zeros_like(gray, dtype=np.float32)
        
        clahe_small = cv2.createCLAHE(clipLimit=6.0, tileGridSize=(4, 4))
        clahe_medium = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8, 8))
        clahe_large = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(16, 16))
        
        enhanced_small = clahe_small.apply(gray).astype(np.float32)
        enhanced_medium = clahe_medium.apply(gray).astype(np.float32)
        enhanced_large = clahe_large.apply(gray).astype(np.float32)
        
        low_contrast_mask = local_contrast < self.contrast_threshold
        medium_contrast_mask = (local_contrast >= self.contrast_threshold) & (local_contrast < 0.6)
        high_contrast_mask = local_contrast >= 0.6
        
        enhanced = np.where(low_contrast_mask, enhanced_small, enhanced)
        enhanced = np.where(medium_contrast_mask, enhanced_medium, enhanced)
        enhanced = np.where(high_contrast_mask, enhanced_large, enhanced)
        
        return np.clip(enhanced, 0, 255).astype(np.uint8)

    def _background_modeling(self, gray: np.ndarray) -> np.ndarray:
        large_blur = cv2.GaussianBlur(gray, (101, 101), 0)
        medium_blur = cv2.GaussianBlur(gray, (51, 51), 0)
        
        background = (large_blur.astype(np.float32) * 0.6 + medium_blur.astype(np.float32) * 0.4)
        
        return background.astype(np.uint8)

    def _remove_shadows_and_stains(self, gray: np.ndarray) -> np.ndarray:
        background = self._background_modeling(gray)
        
        gray_float = gray.astype(np.float32)
        bg_float = background.astype(np.float32)
        
        ratio = gray_float / (bg_float + 1e-6)
        
        shadow_mask = ratio < 0.85
        
        corrected = gray.copy()
        for i in range(gray.shape[0]):
            for j in range(gray.shape[1]):
                if shadow_mask[i, j]:
                    scale = bg_float[i, j] / (gray_float[i, j] + 1e-6)
                    corrected[i, j] = min(255, int(gray[i, j] * min(scale, 2.5)))
        
        return corrected

    def _multi_scale_binarization(self, gray: np.ndarray) -> np.ndarray:
        h, w = gray.shape
        
        binarizations = []
        
        _, binary_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        binarizations.append(binary_otsu)
        
        for block_size in [11, 21, 35, 51]:
            for c in [3, 5, 8, 12]:
                binary = cv2.adaptiveThreshold(
                    gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                    cv2.THRESH_BINARY_INV, block_size, c
                )
                binarizations.append(binary)
        
        voting = np.zeros((h, w), dtype=np.float32)
        for binary in binarizations:
            voting += (binary / 255.0)
        
        threshold = len(binarizations) * 0.35
        final_binary = (voting >= threshold).astype(np.uint8) * 255
        
        kernel = np.ones((2, 2), np.uint8)
        final_binary = cv2.morphologyEx(final_binary, cv2.MORPH_CLOSE, kernel)
        
        return final_binary

    def _edge_enhancement(self, gray: np.ndarray) -> np.ndarray:
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        edges = cv2.magnitude(sobelx, sobely)
        edges = np.clip(edges, 0, 255).astype(np.uint8)
        
        _, edge_binary = cv2.threshold(edges, 30, 255, cv2.THRESH_BINARY)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edge_binary = cv2.morphologyEx(edge_binary, cv2.MORPH_DILATE, kernel, iterations=1)
        
        return edge_binary

    def _niblack_binarization(self, gray: np.ndarray, window_size: int = 31, k: float = -0.2) -> np.ndarray:
        h, w = gray.shape
        pad = window_size // 2
        
        padded = cv2.copyMakeBorder(gray, pad, pad, pad, pad, cv2.BORDER_REFLECT)
        
        result = np.zeros((h, w), dtype=np.uint8)
        
        for i in range(h):
            for j in range(w):
                window = padded[i:i+window_size, j:j+window_size]
                mean = np.mean(window)
                std = np.std(window)
                
                threshold = mean + k * std
                
                if gray[i, j] < threshold:
                    result[i, j] = 255
                else:
                    result[i, j] = 0
        
        return result

    def _sauvola_binarization(self, gray: np.ndarray, window_size: int = 31, k: float = 0.2, r: float = 128) -> np.ndarray:
        h, w = gray.shape
        pad = window_size // 2
        
        padded = cv2.copyMakeBorder(gray, pad, pad, pad, pad, cv2.BORDER_REFLECT)
        
        result = np.zeros((h, w), dtype=np.uint8)
        
        for i in range(h):
            for j in range(w):
                window = padded[i:i+window_size, j:j+window_size]
                mean = np.mean(window)
                std = np.std(window)
                
                threshold = mean * (1 + k * (std / r - 1))
                
                if gray[i, j] < threshold:
                    result[i, j] = 255
                else:
                    result[i, j] = 0
        
        return result

    def denoise(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            denoised = cv2.fastNlMeansDenoisingColored(image, None, 7, 7, 5, 15)
        else:
            denoised = cv2.fastNlMeansDenoising(image, None, 7, 5, 15)
        return denoised

    def advanced_contrast_enhancement(self, image: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        if len(image.shape) == 3:
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
        else:
            l = image.copy()
            a = None
            b = None
        
        local_contrast = self._calculate_local_contrast(l)
        
        shadow_removed = self._remove_shadows_and_stains(l)
        
        enhanced_l = self._multi_scale_clahe(shadow_removed, local_contrast)
        
        if len(image.shape) == 3:
            enhanced_lab = cv2.merge([enhanced_l, a, b])
            enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        else:
            enhanced = enhanced_l
        
        return enhanced, local_contrast

    def hybrid_binarization(self, gray: np.ndarray, local_contrast: np.ndarray) -> np.ndarray:
        binary_clahe = self._multi_scale_binarization(gray)
        
        binary_niblack = self._niblack_binarization(gray, window_size=31, k=-0.15)
        
        binary_sauvola = self._sauvola_binarization(gray, window_size=31, k=0.15, r=80)
        
        edge_binary = self._edge_enhancement(gray)
        
        binarizations = [binary_clahe, binary_niblack, binary_sauvola]
        
        voting = np.zeros_like(gray, dtype=np.float32)
        for binary in binarizations:
            voting += (binary / 255.0)
        
        low_contrast_mask = local_contrast < self.contrast_threshold
        
        final_binary = np.zeros_like(gray, dtype=np.uint8)
        final_binary[low_contrast_mask] = (voting[low_contrast_mask] >= 1).astype(np.uint8) * 255
        final_binary[~low_contrast_mask] = (voting[~low_contrast_mask] >= 2).astype(np.uint8) * 255
        
        kernel_small = np.ones((2, 2), np.uint8)
        final_binary = cv2.morphologyEx(final_binary, cv2.MORPH_CLOSE, kernel_small)
        
        final_binary = cv2.bitwise_or(final_binary, edge_binary)
        
        return final_binary

    def deskew(self, image: np.ndarray, binary: np.ndarray = None) -> np.ndarray:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        if binary is None:
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        coords = np.column_stack(np.where(binary > 0))
        
        if len(coords) < 50:
            return image
        
        angle = cv2.minAreaRect(coords)[-1]
        
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        
        if abs(angle) > 20:
            angle = 0
        
        (h, w) = image.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(image, M, (w, h),
                                 flags=cv2.INTER_CUBIC,
                                 borderMode=cv2.BORDER_REPLICATE)
        return rotated

    def remove_age_stains(self, image: np.ndarray) -> np.ndarray:
        if len(image.shape) == 3:
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            
            lower_brown1 = np.array([10, 20, 20])
            upper_brown1 = np.array([30, 100, 180])
            lower_brown2 = np.array([0, 0, 0])
            upper_brown2 = np.array([180, 30, 100])
            
            mask1 = cv2.inRange(hsv, lower_brown1, upper_brown1)
            mask2 = cv2.inRange(hsv, lower_brown2, upper_brown2)
            mask = cv2.bitwise_or(mask1, mask2)
            
            mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
            mask = cv2.GaussianBlur(mask, (11, 11), 0)
            _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            h, w = image.shape[:2]
            
            large_stain_mask = np.zeros_like(mask)
            for contour in contours:
                area = cv2.contourArea(contour)
                if area > (h * w * 0.01):
                    cv2.drawContours(large_stain_mask, [contour], 0, 255, -1)
            
            inpainted = cv2.inpaint(image, large_stain_mask, 5, cv2.INPAINT_TELEA)
            return inpainted
        return image

    def preprocess_pipeline(self, image: np.ndarray) -> Tuple[np.ndarray, np.ndarray, Dict]:
        stats = {}
        
        denoised = self.denoise(image)
        stats['denoised'] = True
        
        stain_removed = self.remove_age_stains(denoised)
        stats['stain_removed'] = True
        
        enhanced, local_contrast = self.advanced_contrast_enhancement(stain_removed)
        avg_contrast = float(np.mean(local_contrast))
        stats['average_local_contrast'] = avg_contrast
        stats['low_contrast_pixels'] = float(np.mean(local_contrast < self.contrast_threshold))
        
        if len(enhanced.shape) == 3:
            gray = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
        else:
            gray = enhanced.copy()
        
        binary = self.hybrid_binarization(gray, local_contrast)
        stats['binary_pixels'] = int(np.count_nonzero(binary))
        
        deskewed = self.deskew(enhanced, binary)
        
        if len(deskewed.shape) == 3:
            gray_deskewed = cv2.cvtColor(deskewed, cv2.COLOR_BGR2GRAY)
        else:
            gray_deskewed = deskewed.copy()
        
        binary_final = self.hybrid_binarization(gray_deskewed, local_contrast)
        stats['final_binary_pixels'] = int(np.count_nonzero(binary_final))
        
        return deskewed, binary_final, stats

    def preprocess_bytes(self, image_bytes: bytes) -> Tuple[bytes, bytes]:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        processed, binary, stats = self.preprocess_pipeline(image)
        
        _, processed_encoded = cv2.imencode('.png', processed)
        _, binary_encoded = cv2.imencode('.png', binary)
        
        return processed_encoded.tobytes(), binary_encoded.tobytes()


def get_preprocessor():
    return ImagePreprocessor()
