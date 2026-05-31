import cv2
import numpy as np
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
from PIL import Image, ImageFont, ImageDraw
import io


@dataclass
class StyleTransferResult:
    original_text: str
    styled_text: str
    style_name: str
    transfer_strength: float
    image_bytes: Optional[bytes] = None
    metadata: Dict = None


class StyleTransferService:
    def __init__(self):
        self.available_styles = {
            'kaishu': {
                'name': '楷书',
                'description': '规范端正的楷书风格',
                'stroke_width': 1.0,
                'horizontal_stretch': 1.0,
                'slant_angle': 0,
                'noise_level': 0.05,
            },
            'xingshu': {
                'name': '行书',
                'description': '流畅的行书风格',
                'stroke_width': 0.9,
                'horizontal_stretch': 1.05,
                'slant_angle': 5,
                'noise_level': 0.08,
            },
            'caoshu': {
                'name': '草书',
                'description': '简化流畅的草书风格',
                'stroke_width': 0.8,
                'horizontal_stretch': 1.1,
                'slant_angle': 8,
                'noise_level': 0.12,
            },
            'songti_gu': {
                'name': '古宋体',
                'description': '古籍雕版宋体风格',
                'stroke_width': 1.2,
                'horizontal_stretch': 0.95,
                'slant_angle': 0,
                'noise_level': 0.1,
            },
            'weibei': {
                'name': '魏碑',
                'description': '刚劲有力的魏碑风格',
                'stroke_width': 1.3,
                'horizontal_stretch': 0.9,
                'slant_angle': -2,
                'noise_level': 0.08,
            },
        }
        
        self.stroke_patterns = {
            'horizontal': [(0, 0), (1, 0), (2, 0)],
            'vertical': [(0, 0), (0, 1), (0, 2)],
            'diagonal_lr': [(0, 0), (1, 1), (2, 2)],
            'diagonal_rl': [(2, 0), (1, 1), (0, 2)],
        }

    def get_available_styles(self) -> Dict[str, Dict]:
        return {
            key: {
                'name': value['name'],
                'description': value['description'],
            }
            for key, value in self.available_styles.items()
        }

    def _apply_style_transform(
        self,
        text_image: np.ndarray,
        style_config: Dict,
        strength: float = 0.7
    ) -> np.ndarray:
        h, w = text_image.shape
        
        result = text_image.copy()
        
        kernel_size = max(1, int(3 * strength * style_config['stroke_width']))
        if kernel_size % 2 == 0:
            kernel_size += 1
        
        if strength > 0.3:
            kernel = np.ones((kernel_size, kernel_size), np.uint8)
            if style_config['stroke_width'] > 1.0:
                result = cv2.dilate(result, kernel, iterations=1)
            else:
                result = cv2.erode(result, kernel, iterations=1)
        
        if strength > 0.5 and style_config['slant_angle'] != 0:
            angle = style_config['slant_angle'] * strength
            (center_h, center_w) = (h // 2, w // 2)
            M = cv2.getRotationMatrix2D((center_w, center_h), angle, 1.0)
            result = cv2.warpAffine(result, M, (w, h),
                                      flags=cv2.INTER_CUBIC,
                                      borderMode=cv2.BORDER_REPLICATE)
        
        if strength > 0.4:
            stretch = 1 + (style_config['horizontal_stretch'] - 1) * strength
            if stretch != 1.0:
                result = cv2.resize(result, None, fx=stretch, fy=1.0,
                                   interpolation=cv2.INTER_CUBIC)
        
        if strength > 0.2:
            noise_level = style_config['noise_level'] * strength
            noise = np.random.normal(0, 255 * noise_level, result.shape).astype(np.float32)
            result_float = result.astype(np.float32) + noise
            result = np.clip(result_float, 0, 255).astype(np.uint8)
        
        if strength > 0.6:
            kernel = np.ones((2, 2), np.uint8)
            result = cv2.morphologyEx(result, cv2.MORPH_OPEN, kernel)
        
        return result

    def _generate_text_image(
        self,
        text: str,
        font_size: int = 48,
        image_size: Tuple[int, int] = (400, 100)
    ) -> np.ndarray:
        img = Image.new('L', image_size, color=255)
        draw = ImageDraw.Draw(img)
        
        try:
            font = ImageFont.truetype("simhei.ttf", font_size)
        except:
            try:
                font = ImageFont.truetype("msyh.ttc", font_size)
            except:
                font = ImageFont.load_default()
        
        try:
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
        except:
            text_width, text_height = draw.textsize(text, font=font)
        
        x = (image_size[0] - text_width) // 2
        y = (image_size[1] - text_height) // 2
        
        draw.text((x, y), text, fill=0, font=font)
        
        return np.array(img)

    def transfer_style(
        self,
        text: str,
        style_name: str = 'kaishu',
        strength: float = 0.7,
        font_size: int = 48,
        generate_image: bool = True
    ) -> StyleTransferResult:
        if style_name not in self.available_styles:
            style_name = 'kaishu'
        
        style_config = self.available_styles[style_name]
        strength = max(0.0, min(1.0, strength))
        
        styled_text = self._apply_text_style_transform(text, style_config, strength)
        
        image_bytes = None
        if generate_image:
            text_image = self._generate_text_image(text, font_size)
            styled_image = self._apply_style_transform(text_image, style_config, strength)
            
            _, buffer = cv2.imencode('.png', styled_image)
            image_bytes = buffer.tobytes()
        
        return StyleTransferResult(
            original_text=text,
            styled_text=styled_text,
            style_name=style_name,
            transfer_strength=strength,
            image_bytes=image_bytes,
            metadata={
                'stroke_width': style_config['stroke_width'],
                'slant_angle': style_config['slant_angle'],
                'noise_level': style_config['noise_level'],
            }
        )

    def _apply_text_style_transform(
        self,
        text: str,
        style_config: Dict,
        strength: float
    ) -> str:
        if strength < 0.3:
            return text
        
        style_name = style_config['name']
        
        transformations = {
            '草书': self._caoshu_transform,
            '行书': self._xingshu_transform,
        }
        
        if style_name in transformations and strength > 0.5:
            return transformations[style_name](text, strength)
        
        return text

    def _xingshu_transform(self, text: str, strength: float) -> str:
        substitutions = {
            '的': '旳',
            '是': '昰',
            '有': '冇',
            '不': '不',
            '为': '为',
        }
        
        if strength > 0.7:
            result = []
            for char in text:
                if char in substitutions and np.random.random() < strength * 0.3:
                    result.append(substitutions[char])
                else:
                    result.append(char)
            return ''.join(result)
        
        return text

    def _caoshu_transform(self, text: str, strength: float) -> str:
        if strength > 0.8:
            if len(text) > 3:
                return text[0] + '…' + text[-1]
        
        return text

    def transfer_batch(
        self,
        texts: List[str],
        style_name: str = 'kaishu',
        strength: float = 0.7
    ) -> List[StyleTransferResult]:
        return [
            self.transfer_style(text, style_name, strength, generate_image=False)
            for text in texts
        ]

    def get_style_preview(
        self,
        style_name: str,
        strength: float = 0.7,
        sample_text: str = "古籍文档"
    ) -> bytes:
        result = self.transfer_style(
            sample_text,
            style_name,
            strength,
            font_size=64,
            image_size=(500, 120),
            generate_image=True
        )
        return result.image_bytes

    def analyze_image_style(self, image_bytes: bytes) -> Dict:
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_GRAYSCALE)
        
        if image is None:
            return {'error': '无法解码图像'}
        
        _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        if len(contours) == 0:
            return {'error': '未检测到文字'}
        
        aspect_ratios = []
        solidities = []
        orientations = []
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < 50:
                continue
            
            rect = cv2.minAreaRect(contour)
            box = cv2.boxPoints(rect)
            box_area = cv2.contourArea(box)
            
            if box_area > 0:
                solidities.append(area / box_area)
                aspect_ratios.append(rect[1][0] / rect[1][1] if rect[1][1] > 0 else 1)
                orientations.append(rect[2])
        
        if len(solidities) == 0:
            return {'error': '无法分析文字特征'}
        
        avg_solidity = np.mean(solidities)
        avg_aspect_ratio = np.mean(aspect_ratios)
        orientation_variance = np.var(orientations) if len(orientations) > 1 else 0
        
        style_scores = {}
        for key, config in self.available_styles.items():
            score = 0.0
            
            if config['name'] == '楷书':
                if 0.85 < avg_solidity < 0.98 and 0.9 < avg_aspect_ratio < 1.1:
                    score = 0.8
            elif config['name'] == '行书':
                if 0.7 < avg_solidity < 0.9 and orientation_variance > 50:
                    score = 0.7
            elif config['name'] == '草书':
                if avg_solidity < 0.7 and orientation_variance > 200:
                    score = 0.6
            elif config['name'] == '古宋体':
                if 0.9 < avg_solidity < 0.99 and avg_aspect_ratio < 0.95:
                    score = 0.75
            elif config['name'] == '魏碑':
                if avg_solidity > 0.9 and avg_aspect_ratio < 0.9:
                    score = 0.65
            
            style_scores[key] = score
        
        best_style = max(style_scores.keys(), key=lambda k: style_scores[k])
        
        return {
            'detected_style': best_style,
            'style_name': self.available_styles[best_style]['name'],
            'confidence': style_scores[best_style],
            'style_scores': style_scores,
            'features': {
                'average_solidity': float(avg_solidity),
                'average_aspect_ratio': float(avg_aspect_ratio),
                'orientation_variance': float(orientation_variance),
            }
        }


def get_style_transfer_service():
    return StyleTransferService()
