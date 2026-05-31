import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass


@dataclass
class LayoutRegion:
    region_type: str
    x: int
    y: int
    width: int
    height: int
    confidence: float
    is_vertical: bool = False
    metadata: Dict = None


class LayoutAnalyzer:
    def __init__(self):
        self.region_types = {
            'text': (0, 255, 0),
            'illustration': (255, 0, 0),
            'table': (0, 0, 255),
            'seal': (255, 0, 255),
        }
        self.min_text_area = 50
        self.max_text_area_ratio = 0.8

    def _calculate_local_contrast(self, gray: np.ndarray, block_size: int = 32) -> np.ndarray:
        h, w = gray.shape
        local_contrast = np.zeros_like(gray, dtype=np.float32)
        
        for i in range(0, h, block_size):
            for j in range(0, w, block_size):
                block = gray[i:min(i+block_size, h), j:min(j+block_size, w)]
                if block.size > 0:
                    block_std = np.std(block)
                    local_contrast[i:min(i+block_size, h), j:min(j+block_size, w)] = min(1.0, block_std / 64.0)
        
        return cv2.GaussianBlur(local_contrast, (31, 31), 0)

    def _multi_scale_morphology(self, binary: np.ndarray) -> List[np.ndarray]:
        dilated_images = []
        
        kernels = [
            cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3)),
            cv2.getStructuringElement(cv2.MORPH_RECT, (20, 4)),
            cv2.getStructuringElement(cv2.MORPH_RECT, (30, 5)),
            cv2.getStructuringElement(cv2.MORPH_RECT, (15, 6)),
            cv2.getStructuringElement(cv2.MORPH_RECT, (3, 25)),
            cv2.getStructuringElement(cv2.MORPH_RECT, (4, 20)),
        ]
        
        for kernel in kernels:
            dilated = cv2.dilate(binary, kernel, iterations=1)
            dilated_images.append(dilated)
        
        return dilated_images

    def _edge_based_text_detection(self, gray: np.ndarray) -> np.ndarray:
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        
        magnitude = cv2.magnitude(sobelx, sobely)
        magnitude = np.clip(magnitude, 0, 255).astype(np.uint8)
        
        _, edges = cv2.threshold(magnitude, 25, 255, cv2.THRESH_BINARY)
        
        kernel_h = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))
        kernel_v = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))
        
        edges_h = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_h)
        edges_v = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_v)
        
        combined_edges = cv2.bitwise_or(edges_h, edges_v)
        kernel = np.ones((3, 3), np.uint8)
        combined_edges = cv2.morphologyEx(combined_edges, cv2.MORPH_CLOSE, kernel)
        
        return combined_edges

    def _connected_component_analysis(self, binary: np.ndarray) -> List[Tuple[int, int, int, int, float]]:
        regions = []
        
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
            binary.astype(np.uint8), connectivity=8
        )
        
        h, w = binary.shape
        
        for i in range(1, num_labels):
            x = stats[i, cv2.CC_STAT_LEFT]
            y = stats[i, cv2.CC_STAT_TOP]
            width = stats[i, cv2.CC_STAT_WIDTH]
            height = stats[i, cv2.CC_STAT_HEIGHT]
            area = stats[i, cv2.CC_STAT_AREA]
            
            if area < self.min_text_area:
                continue
            if area > h * w * self.max_text_area_ratio:
                continue
            
            aspect_ratio = width / height if height > 0 else 0
            
            if aspect_ratio > 0.1 and aspect_ratio < 50:
                fill_ratio = area / (width * height) if width * height > 0 else 0
                
                if fill_ratio > 0.05 and fill_ratio < 0.95:
                    confidence = self._calculate_region_confidence(
                        binary, x, y, width, height, fill_ratio, aspect_ratio
                    )
                    regions.append((x, y, width, height, confidence))
        
        return regions

    def _calculate_region_confidence(
        self, binary: np.ndarray, x: int, y: int, w: int, h: int,
        fill_ratio: float, aspect_ratio: float
    ) -> float:
        roi = binary[y:y+h, x:x+w]
        
        if roi.size == 0:
            return 0.3
        
        horizontal_projection = np.sum(roi, axis=1) / 255.0
        vertical_projection = np.sum(roi, axis=0) / 255.0
        
        h_peaks = self._count_peaks(horizontal_projection)
        v_peaks = self._count_peaks(vertical_projection)
        
        score = 0.0
        
        if 0.1 < aspect_ratio < 0.6:
            score += 0.25
        elif 0.6 <= aspect_ratio < 5:
            score += 0.2
        elif 5 <= aspect_ratio < 30:
            score += 0.3
        elif aspect_ratio >= 30:
            score += 0.1
        
        if 0.15 < fill_ratio < 0.6:
            score += 0.25
        elif 0.6 <= fill_ratio < 0.85:
            score += 0.15
        else:
            score += 0.05
        
        if h_peaks > 1 or v_peaks > 1:
            score += 0.25
        
        if h_peaks > 3 or v_peaks > 3:
            score += 0.1
        
        local_density = np.count_nonzero(roi) / roi.size
        if 0.05 < local_density < 0.7:
            score += 0.1
        
        return min(0.95, max(0.3, score))

    def _count_peaks(self, signal: np.ndarray, min_peak_height: float = 5) -> int:
        if len(signal) < 3:
            return 0
        
        peaks = 0
        for i in range(1, len(signal) - 1):
            if signal[i] > signal[i-1] and signal[i] > signal[i+1] and signal[i] > min_peak_height:
                peaks += 1
        
        return peaks

    def _merge_nearby_regions(
        self, regions: List[LayoutRegion], max_gap_h: int = 100, max_gap_v: int = 30
    ) -> List[LayoutRegion]:
        if len(regions) < 2:
            return regions
        
        sorted_regions = sorted(regions, key=lambda r: (r.y, r.x))
        merged = []
        used = set()
        
        for i, region in enumerate(sorted_regions):
            if i in used:
                continue
            
            current = region
            used.add(i)
            
            for j, other in enumerate(sorted_regions):
                if j in used or j == i:
                    continue
                
                if current.is_vertical != other.is_vertical:
                    continue
                
                gap_h = max(0, other.x - (current.x + current.width))
                gap_v = max(0, other.y - (current.y + current.height))
                
                overlap_x = (current.x < other.x + other.width) and (current.x + current.width > other.x)
                overlap_y = (current.y < other.y + other.height) and (current.y + current.height > other.y)
                
                should_merge = False
                
                if current.is_vertical:
                    if (overlap_y and gap_h < max_gap_h) or (abs(current.x - other.x) < 50 and abs(current.y - other.y) < 200):
                        should_merge = True
                else:
                    if (overlap_x and gap_v < max_gap_v) or (abs(current.y - other.y) < 50 and abs(current.x - other.x) < 300):
                        should_merge = True
                
                if should_merge:
                    new_x = min(current.x, other.x)
                    new_y = min(current.y, other.y)
                    new_w = max(current.x + current.width, other.x + other.width) - new_x
                    new_h = max(current.y + current.height, other.y + other.height) - new_y
                    
                    current = LayoutRegion(
                        region_type='text',
                        x=new_x, y=new_y,
                        width=new_w, height=new_h,
                        confidence=max(current.confidence, other.confidence),
                        is_vertical=current.is_vertical,
                        metadata={
                            'merged': True,
                            'original_count': (current.metadata or {}).get('original_count', 1) + 
                                              (other.metadata or {}).get('original_count', 1)
                        }
                    )
                    used.add(j)
            
            merged.append(current)
        
        return merged

    def _detect_text_lines_projection(self, binary: np.ndarray) -> List[Tuple[int, int, int, int]]:
        h, w = binary.shape
        regions = []
        
        horizontal_projection = np.sum(binary, axis=1) / 255.0
        
        threshold = np.mean(horizontal_projection) * 0.3
        
        lines = []
        in_line = False
        line_start = 0
        empty_count = 0
        
        for i in range(h):
            if horizontal_projection[i] > threshold:
                if not in_line:
                    in_line = True
                    line_start = i
                    empty_count = 0
            else:
                if in_line:
                    empty_count += 1
                    if empty_count > 5:
                        in_line = False
                        lines.append((line_start, i - empty_count))
                        empty_count = 0
        
        if in_line:
            lines.append((line_start, h - 1))
        
        for y1, y2 in lines:
            if y2 - y1 < 10:
                continue
            
            line_roi = binary[y1:y2, :]
            vertical_projection = np.sum(line_roi, axis=0) / 255.0
            
            v_threshold = np.mean(vertical_projection) * 0.2
            
            x_lines = []
            in_vline = False
            vline_start = 0
            
            for j in range(w):
                if vertical_projection[j] > v_threshold:
                    if not in_vline:
                        in_vline = True
                        vline_start = j
                else:
                    if in_vline:
                        in_vline = False
                        if j - vline_start > 10:
                            x_lines.append((vline_start, j))
            
            if in_vline:
                if w - vline_start > 10:
                    x_lines.append((vline_start, w - 1))
            
            for x1, x2 in x_lines:
                regions.append((x1, y1, x2 - x1, y2 - y1))
        
        return regions

    def detect_text_regions(self, binary_image: np.ndarray, gray_image: Optional[np.ndarray] = None) -> List[LayoutRegion]:
        regions = []
        h, w = binary_image.shape[:2]
        
        seen_regions = set()
        
        dilated_list = self._multi_scale_morphology(binary_image)
        
        for dilated in dilated_list:
            cc_regions = self._connected_component_analysis(dilated)
            for x, y, width, height, conf in cc_regions:
                region_key = (x, y, width, height)
                if region_key not in seen_regions:
                    seen_regions.add(region_key)
                    aspect_ratio = width / height if height > 0 else 0
                    is_vertical = aspect_ratio < 0.5
                    
                    regions.append(LayoutRegion(
                        region_type='text',
                        x=x, y=y,
                        width=width, height=height,
                        confidence=conf,
                        is_vertical=is_vertical,
                        metadata={'source': 'morphology', 'aspect_ratio': aspect_ratio}
                    ))
        
        edge_binary = self._edge_based_text_detection(gray_image) if gray_image is not None else None
        
        if edge_binary is not None:
            edge_dilated_list = self._multi_scale_morphology(edge_binary)
            
            for dilated in edge_dilated_list:
                cc_regions = self._connected_component_analysis(dilated)
                for x, y, width, height, conf in cc_regions:
                    region_key = (x, y, width, height)
                    if region_key not in seen_regions:
                        seen_regions.add(region_key)
                        aspect_ratio = width / height if height > 0 else 0
                        is_vertical = aspect_ratio < 0.5
                        
                        regions.append(LayoutRegion(
                            region_type='text',
                            x=x, y=y,
                            width=width, height=height,
                            confidence=conf * 0.8,
                            is_vertical=is_vertical,
                            metadata={'source': 'edge', 'aspect_ratio': aspect_ratio}
                        ))
        
        projection_lines = self._detect_text_lines_projection(binary_image)
        for x, y, width, height in projection_lines:
            region_key = (x, y, width, height)
            if region_key not in seen_regions:
                seen_regions.add(region_key)
                aspect_ratio = width / height if height > 0 else 0
                is_vertical = aspect_ratio < 0.5
                roi = binary_image[y:y+height, x:x+width]
                fill_ratio = np.count_nonzero(roi) / (width * height) if width * height > 0 else 0
                
                conf = 0.6
                if 0.1 < fill_ratio < 0.6:
                    conf = 0.75
                if 2 < height < 200:
                    conf = min(0.85, conf + 0.1)
                
                regions.append(LayoutRegion(
                    region_type='text',
                    x=x, y=y,
                    width=width, height=height,
                    confidence=conf,
                    is_vertical=is_vertical,
                    metadata={'source': 'projection', 'fill_ratio': fill_ratio}
                ))
        
        text_regions = [r for r in regions if r.region_type == 'text']
        text_regions = self._merge_overlapping_text_regions(text_regions)
        text_regions = self._merge_nearby_regions(text_regions)
        
        final_regions = []
        for region in text_regions:
            if region.width > 5 and region.height > 5:
                if region.metadata is None:
                    region.metadata = {}
                region.metadata['final'] = True
                final_regions.append(region)
        
        return final_regions

    def _merge_overlapping_text_regions(self, regions: List[LayoutRegion]) -> List[LayoutRegion]:
        if not regions:
            return regions
        
        changed = True
        while changed:
            changed = False
            new_regions = []
            used = [False] * len(regions)
            
            for i, r1 in enumerate(regions):
                if used[i]:
                    continue
                used[i] = True
                
                for j, r2 in enumerate(regions[i+1:], start=i+1):
                    if used[j]:
                        continue
                    
                    if r1.is_vertical != r2.is_vertical:
                        continue
                    
                    iou = self._iou(r1, r2)
                    overlap_ratio = self._overlap_ratio(r1, r2)
                    
                    if iou > 0.2 or overlap_ratio > 0.5:
                        x = min(r1.x, r2.x)
                        y = min(r1.y, r2.y)
                        w = max(r1.x + r1.width, r2.x + r2.width) - x
                        h = max(r1.y + r1.height, r2.y + r2.height) - y
                        
                        r1 = LayoutRegion(
                            region_type='text',
                            x=x, y=y,
                            width=w, height=h,
                            confidence=max(r1.confidence, r2.confidence),
                            is_vertical=r1.is_vertical,
                            metadata={
                                'merged': True,
                                'iou': iou,
                                'confidences': [r1.confidence, r2.confidence]
                            }
                        )
                        used[j] = True
                        changed = True
                
                new_regions.append(r1)
            
            regions = new_regions
        
        return regions

    def _overlap_ratio(self, a: LayoutRegion, b: LayoutRegion) -> float:
        x1 = max(a.x, b.x)
        y1 = max(a.y, b.y)
        x2 = min(a.x + a.width, b.x + b.width)
        y2 = min(a.y + a.height, b.y + b.height)
        
        inter_area = max(0, x2 - x1) * max(0, y2 - y1)
        a_area = a.width * a.height
        b_area = b.width * b.height
        
        if a_area == 0 or b_area == 0:
            return 0
        
        return inter_area / min(a_area, b_area)

    def detect_illustrations(self, image: np.ndarray) -> List[LayoutRegion]:
        regions = []
        
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        kernel_large = cv2.getStructuringElement(cv2.MORPH_RECT, (50, 50))
        closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_large)
        
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            h, w = gray.shape
            
            if 3000 < area < (h * w * 0.6):
                x, y, width, height = cv2.boundingRect(contour)
                
                aspect_ratio = width / height
                if 0.3 < aspect_ratio < 3.0:
                    density = self._calculate_density(binary, x, y, width, height)
                    
                    if 0.05 < density < 0.7:
                        regions.append(LayoutRegion(
                            region_type='illustration',
                            x=x, y=y,
                            width=width, height=height,
                            confidence=0.70,
                            is_vertical=False,
                            metadata={'density': density, 'area': area}
                        ))
        
        return regions

    def detect_tables(self, image: np.ndarray) -> List[LayoutRegion]:
        regions = []
        
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (100, 1))
        vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 100))
        
        horizontal_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horizontal_kernel, iterations=2)
        vertical_lines = cv2.morphologyEx(binary, cv2.MORPH_OPEN, vertical_kernel, iterations=2)
        
        grid = cv2.add(horizontal_lines, vertical_lines)
        
        contours, _ = cv2.findContours(grid, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 800:
                continue
            
            x, y, width, height = cv2.boundingRect(contour)
            horizontal_count = np.count_nonzero(horizontal_lines[y:y+height, x:x+width])
            vertical_count = np.count_nonzero(vertical_lines[y:y+height, x:x+width])
            
            if horizontal_count > 30 and vertical_count > 30:
                regions.append(LayoutRegion(
                    region_type='table',
                    x=x, y=y,
                    width=width, height=height,
                    confidence=0.75,
                    is_vertical=False,
                    metadata={'horizontal_lines': horizontal_count, 'vertical_lines': vertical_count}
                ))
        
        return regions

    def detect_seals(self, image: np.ndarray) -> List[LayoutRegion]:
        regions = []
        
        if len(image.shape) < 3:
            return regions
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        
        lower_red1 = np.array([0, 40, 40])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([160, 40, 40])
        upper_red2 = np.array([180, 255, 255])
        
        mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
        mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
        red_mask = cv2.add(mask1, mask2)
        
        red_mask = cv2.morphologyEx(red_mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        red_mask = cv2.dilate(red_mask, np.ones((8, 8), np.uint8), iterations=1)
        
        contours, _ = cv2.findContours(red_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 300:
                continue
            
            x, y, width, height = cv2.boundingRect(contour)
            aspect_ratio = width / height
            
            if 0.6 < aspect_ratio < 1.6:
                circularity = self._calculate_circularity(contour)
                
                if circularity > 0.4:
                    regions.append(LayoutRegion(
                        region_type='seal',
                        x=x, y=y,
                        width=width, height=height,
                        confidence=min(circularity, 0.9),
                        is_vertical=False,
                        metadata={'circularity': circularity, 'area': area}
                    ))
        
        return regions

    def _calculate_density(self, binary: np.ndarray, x: int, y: int, w: int, h: int) -> float:
        roi = binary[y:y+h, x:x+w]
        if roi.size == 0:
            return 0
        return np.count_nonzero(roi) / roi.size

    def _calculate_circularity(self, contour: np.ndarray) -> float:
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        if perimeter == 0:
            return 0
        return 4 * np.pi * area / (perimeter ** 2)

    def _iou(self, a: LayoutRegion, b: LayoutRegion) -> float:
        x1 = max(a.x, b.x)
        y1 = max(a.y, b.y)
        x2 = min(a.x + a.width, b.x + b.width)
        y2 = min(a.y + a.height, b.y + b.height)
        
        inter_area = max(0, x2 - x1) * max(0, y2 - y1)
        a_area = a.width * a.height
        b_area = b.width * b.height
        union_area = a_area + b_area - inter_area
        
        return inter_area / union_area if union_area > 0 else 0

    def analyze_layout(self, image: np.ndarray, binary: np.ndarray) -> List[LayoutRegion]:
        all_regions = []
        
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        all_regions.extend(self.detect_text_regions(binary, gray))
        all_regions.extend(self.detect_illustrations(image))
        all_regions.extend(self.detect_tables(image))
        all_regions.extend(self.detect_seals(image))
        
        merged_regions = self._filter_and_merge_regions(all_regions)
        
        return merged_regions

    def _filter_and_merge_regions(self, regions: List[LayoutRegion]) -> List[LayoutRegion]:
        if not regions:
            return regions
        
        text_regions = [r for r in regions if r.region_type == 'text']
        non_text_regions = [r for r in regions if r.region_type != 'text']
        
        final_text = []
        for tr in text_regions:
            is_inside_non_text = False
            for ntr in non_text_regions:
                if (tr.x >= ntr.x and tr.y >= ntr.y and
                    tr.x + tr.width <= ntr.x + ntr.width and
                    tr.y + tr.height <= ntr.y + ntr.height):
                    is_inside_non_text = True
                    break
            
            if not is_inside_non_text:
                final_text.append(tr)
        
        return final_text + non_text_regions

    def analyze_bytes(self, image_bytes: bytes) -> List[Dict]:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        local_contrast = self._calculate_local_contrast(gray)
        low_contrast_ratio = np.mean(local_contrast < 0.3)
        
        binary = self._advanced_binarization(gray, local_contrast)
        
        regions = self.analyze_layout(image, binary)
        
        return [
            {
                'region_type': r.region_type,
                'x': r.x,
                'y': r.y,
                'width': r.width,
                'height': r.height,
                'confidence': r.confidence,
                'is_vertical': r.is_vertical,
                'metadata': {
                    **(r.metadata or {}),
                    'low_contrast_ratio': float(low_contrast_ratio),
                    'avg_local_contrast': float(np.mean(local_contrast))
                }
            }
            for r in regions
        ]

    def _advanced_binarization(self, gray: np.ndarray, local_contrast: np.ndarray) -> np.ndarray:
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
        
        low_contrast_mask = local_contrast < 0.3
        
        final_binary = np.zeros_like(gray, dtype=np.uint8)
        final_binary[low_contrast_mask] = (voting[low_contrast_mask] >= 1).astype(np.uint8) * 255
        final_binary[~low_contrast_mask] = (voting[~low_contrast_mask] >= 2).astype(np.uint8) * 255
        
        sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
        sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
        edges = cv2.magnitude(sobelx, sobely)
        edges = np.clip(edges, 0, 255).astype(np.uint8)
        _, edge_binary = cv2.threshold(edges, 25, 255, cv2.THRESH_BINARY)
        
        final_binary = cv2.bitwise_or(final_binary, edge_binary)
        
        kernel = np.ones((2, 2), np.uint8)
        final_binary = cv2.morphologyEx(final_binary, cv2.MORPH_CLOSE, kernel)
        
        return final_binary


def get_layout_analyzer():
    return LayoutAnalyzer()
