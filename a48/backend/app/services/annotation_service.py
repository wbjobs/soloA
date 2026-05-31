import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
import re


@dataclass
class AnnotationRegion:
    id: int
    document_id: int
    annotation_type: str
    text: str
    x: int
    y: int
    width: int
    height: int
    linked_text_region_id: Optional[int] = None
    confidence: float = 0.0
    metadata: Dict = None


@dataclass
class TextRegion:
    id: int
    text: str
    x: int
    y: int
    width: int
    height: int
    is_vertical: bool = False


class AnnotationService:
    def __init__(self):
        self.annotation_types = {
            'meipi': {
                'name': '眉批',
                'description': '页面上方或侧边的批注',
                'proximity_weight': 0.6,
                'semantic_weight': 0.4,
            },
            'jiapi': {
                'name': '夹批',
                'description': '正文行间的批注',
                'proximity_weight': 0.7,
                'semantic_weight': 0.3,
            },
            'weipi': {
                'name': '尾批',
                'description': '段落或篇章末尾的批注',
                'proximity_weight': 0.5,
                'semantic_weight': 0.5,
            },
            'pangzhu': {
                'name': '旁注',
                'description': '正文旁边的注释',
                'proximity_weight': 0.65,
                'semantic_weight': 0.35,
            },
        }
        
        self.stop_words = set([
            '的', '了', '是', '在', '我', '有', '和', '就',
            '不', '人', '都', '一', '一个', '上', '也', '很',
            '到', '说', '要', '去', '你', '会', '着', '没有',
            '看', '好', '自己', '这', '那', '之', '乎', '者',
            '也', '焉', '哉', '矣', '耳', '尔', '欤', '耶',
            '夫', '惟', '盖', '且', '而', '以', '于', '为',
        ])
        
        self.keyword_indicators = {
            'comment': ['评曰', '论曰', '赞曰', '案', '按', '注', '释'],
            'reference': ['参阅', '参见', '详见', '参考', '见'],
            'explanation': ['即', '指', '意为', '意思是', '解释为'],
        }

    def detect_annotation_regions(
        self,
        image: np.ndarray,
        text_regions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image.copy()
        
        h, w = gray.shape
        
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        text_region_mask = np.zeros_like(binary, dtype=np.uint8)
        for region in text_regions:
            x, y = region.get('x', 0), region.get('y', 0)
            rw, rh = region.get('width', 0), region.get('height', 0)
            text_region_mask[y:y+rh, x:x+rw] = 255
        
        non_text_binary = cv2.bitwise_and(binary, cv2.bitwise_not(text_region_mask))
        
        annotations = []
        
        annotations.extend(self._detect_meipi(binary, h, w, text_regions))
        annotations.extend(self._detect_jiapi(binary, h, w, text_regions))
        annotations.extend(self._detect_weipi(binary, h, w, text_regions))
        
        return annotations

    def _detect_meipi(
        self,
        binary: np.ndarray,
        h: int,
        w: int,
        text_regions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        annotations = []
        
        top_region = binary[:int(h*0.15), :]
        left_region = binary[:, :int(w*0.15)]
        right_region = binary[:, int(w*0.85):]
        
        for region_name, region_binary, offset in [
            ('top', top_region, (0, 0)),
            ('left', left_region, (0, 0)),
            ('right', right_region, (int(w*0.85), 0)),
        ]:
            contours, _ = cv2.findContours(region_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for contour in contours:
                area = cv2.contourArea(contour)
                if 100 < area < 5000:
                    x, y, rw, rh = cv2.boundingRect(contour)
                    
                    annotations.append({
                        'annotation_type': 'meipi',
                        'x': x + offset[0],
                        'y': y + offset[1],
                        'width': rw,
                        'height': rh,
                        'confidence': 0.6,
                        'location': region_name,
                    })
        
        return annotations

    def _detect_jiapi(
        self,
        binary: np.ndarray,
        h: int,
        w: int,
        text_regions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        annotations = []
        
        if not text_regions:
            return annotations
        
        text_heights = [r.get('height', 0) for r in text_regions]
        avg_text_height = np.mean(text_heights) if text_heights else 30
        
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if 50 < area < 2000:
                x, y, rw, rh = cv2.boundingRect(contour)
                
                aspect_ratio = rw / rh if rh > 0 else 0
                if 0.3 < aspect_ratio < 5 and rh < avg_text_height * 0.8:
                    annotations.append({
                        'annotation_type': 'jiapi',
                        'x': x,
                        'y': y,
                        'width': rw,
                        'height': rh,
                        'confidence': 0.5,
                    })
        
        return annotations

    def _detect_weipi(
        self,
        binary: np.ndarray,
        h: int,
        w: int,
        text_regions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        annotations = []
        
        if not text_regions:
            return annotations
        
        max_y = max([r.get('y', 0) + r.get('height', 0) for r in text_regions])
        
        bottom_region = binary[max_y:h, :]
        
        contours, _ = cv2.findContours(bottom_region, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if 200 < area < 10000:
                x, y, rw, rh = cv2.boundingRect(contour)
                
                annotations.append({
                    'annotation_type': 'weipi',
                    'x': x,
                    'y': y + max_y,
                    'width': rw,
                    'height': rh,
                    'confidence': 0.55,
                })
        
        return annotations

    def calculate_proximity_score(
        self,
        annotation: Dict[str, Any],
        text_region: Dict[str, Any]
    ) -> float:
        ax, ay = annotation['x'], annotation['y']
        aw, ah = annotation['width'], annotation['height']
        acx, acy = ax + aw/2, ay + ah/2
        
        tx, ty = text_region.get('x', 0), text_region.get('y', 0)
        tw, th = text_region.get('width', 0), text_region.get('height', 0)
        tcx, tcy = tx + tw/2, ty + th/2
        
        horizontal_distance = abs(acx - tcx)
        vertical_distance = abs(acy - tcy)
        
        annotation_type = annotation.get('annotation_type', 'meipi')
        type_config = self.annotation_types.get(annotation_type, {})
        
        max_h_distance = 500
        max_v_distance = 300
        
        h_score = max(0, 1 - horizontal_distance / max_h_distance)
        v_score = max(0, 1 - vertical_distance / max_v_distance)
        
        if annotation_type == 'meipi':
            if ay < ty:
                proximity_score = 0.7 * v_score + 0.3 * h_score
            else:
                proximity_score = 0.3 * v_score + 0.3 * h_score
        elif annotation_type == 'jiapi':
            y_overlap = max(0, min(ay + ah, ty + th) - max(ay, ty))
            if y_overlap > 0:
                overlap_ratio = y_overlap / min(ah, th)
                proximity_score = 0.8 * overlap_ratio + 0.2 * h_score
            else:
                proximity_score = 0.3 * v_score + 0.3 * h_score
        elif annotation_type == 'weipi':
            if ay > ty:
                proximity_score = 0.6 * v_score + 0.4 * h_score
            else:
                proximity_score = 0.2 * v_score + 0.2 * h_score
        else:
            proximity_score = 0.5 * v_score + 0.5 * h_score
        
        return max(0.0, min(1.0, proximity_score))

    def _tokenize(self, text: str) -> List[str]:
        tokens = []
        current_word = []
        
        for char in text:
            if '\u4e00' <= char <= '\u9fff':
                if current_word and not ('\u4e00' <= current_word[-1] <= '\u9fff'):
                    tokens.append(''.join(current_word))
                    current_word = []
                tokens.append(char)
            elif char.isalnum():
                current_word.append(char)
            else:
                if current_word:
                    tokens.append(''.join(current_word))
                    current_word = []
        
        if current_word:
            tokens.append(''.join(current_word))
        
        return [t for t in tokens if t and t not in self.stop_words]

    def calculate_semantic_similarity(
        self,
        annotation_text: str,
        text_region_text: str
    ) -> float:
        if not annotation_text or not text_region_text:
            return 0.0
        
        ann_tokens = set(self._tokenize(annotation_text))
        text_tokens = set(self._tokenize(text_region_text))
        
        if not ann_tokens or not text_tokens:
            return 0.0
        
        intersection = ann_tokens & text_tokens
        union = ann_tokens | text_tokens
        
        jaccard = len(intersection) / len(union) if union else 0.0
        
        keyword_score = 0.0
        for keyword_type, keywords in self.keyword_indicators.items():
            for kw in keywords:
                if kw in annotation_text:
                    keyword_score += 0.1
        
        ann_chars = set(annotation_text)
        text_chars = set(text_region_text)
        char_overlap = len(ann_chars & text_chars) / len(ann_chars) if ann_chars else 0.0
        
        final_score = 0.5 * jaccard + 0.3 * char_overlap + 0.2 * keyword_score
        
        return max(0.0, min(1.0, final_score))

    def find_best_matching_text_region(
        self,
        annotation: Dict[str, Any],
        annotation_text: str,
        text_regions: List[Dict[str, Any]]
    ) -> Tuple[Optional[int], float, Dict[str, float]]:
        if not text_regions:
            return None, 0.0, {}
        
        scores = []
        annotation_type = annotation.get('annotation_type', 'meipi')
        type_config = self.annotation_types.get(annotation_type, {})
        
        proximity_weight = type_config.get('proximity_weight', 0.5)
        semantic_weight = type_config.get('semantic_weight', 0.5)
        
        for i, text_region in enumerate(text_regions):
            proximity_score = self.calculate_proximity_score(annotation, text_region)
            
            text_region_text = text_region.get('text', '')
            semantic_score = self.calculate_semantic_similarity(annotation_text, text_region_text)
            
            combined_score = (
                proximity_weight * proximity_score +
                semantic_weight * semantic_score
            )
            
            scores.append({
                'index': i,
                'region_id': text_region.get('id', i),
                'proximity_score': proximity_score,
                'semantic_score': semantic_score,
                'combined_score': combined_score,
            })
        
        if not scores:
            return None, 0.0, {}
        
        best = max(scores, key=lambda x: x['combined_score'])
        
        return best['region_id'], best['combined_score'], {
            'proximity': best['proximity_score'],
            'semantic': best['semantic_score'],
        }

    def link_annotations_to_text(
        self,
        annotations: List[Dict[str, Any]],
        annotation_texts: List[str],
        text_regions: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        linked_annotations = []
        
        for i, annotation in enumerate(annotations):
            annotation_text = annotation_texts[i] if i < len(annotation_texts) else ''
            
            linked_region_id, confidence, score_details = self.find_best_matching_text_region(
                annotation, annotation_text, text_regions
            )
            
            linked_annotations.append({
                **annotation,
                'text': annotation_text,
                'linked_text_region_id': linked_region_id,
                'confidence': confidence,
                'score_details': score_details,
            })
        
        return sorted(linked_annotations, key=lambda x: x['confidence'], reverse=True)

    def group_annotations_by_text(
        self,
        linked_annotations: List[Dict[str, Any]]
    ) -> Dict[int, List[Dict[str, Any]]]:
        groups = {}
        
        for annotation in linked_annotations:
            region_id = annotation.get('linked_text_region_id')
            if region_id is not None:
                if region_id not in groups:
                    groups[region_id] = []
                groups[region_id].append(annotation)
        
        return groups

    def analyze_annotation_relationships(
        self,
        annotations: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        if not annotations:
            return {'error': '没有批注数据'}
        
        type_counts = {}
        for ann in annotations:
            ann_type = ann.get('annotation_type', 'unknown')
            type_counts[ann_type] = type_counts.get(ann_type, 0) + 1
        
        linked_count = sum(1 for ann in annotations if ann.get('linked_text_region_id') is not None)
        total_count = len(annotations)
        link_rate = linked_count / total_count if total_count > 0 else 0.0
        
        avg_confidence = np.mean([
            ann.get('confidence', 0) for ann in annotations
            if ann.get('confidence', 0) > 0
        ]) if any(ann.get('confidence', 0) > 0 for ann in annotations) else 0.0
        
        return {
            'total_annotations': total_count,
            'linked_annotations': linked_count,
            'link_rate': link_rate,
            'type_distribution': type_counts,
            'average_confidence': float(avg_confidence),
            'high_confidence_count': sum(
                1 for ann in annotations if ann.get('confidence', 0) > 0.7
            ),
        }


def get_annotation_service():
    return AnnotationService()
