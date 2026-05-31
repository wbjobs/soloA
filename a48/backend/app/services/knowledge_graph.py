import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass


@dataclass
class Entity:
    entity_type: str
    entity_text: str
    start_index: int
    end_index: int
    confidence: float
    metadata: Dict = None


@dataclass
class EntityRelation:
    source_entity: str
    target_entity: str
    relation_type: str
    confidence: float
    evidence_text: str


class KnowledgeGraphService:
    def __init__(self):
        self.chinese_surnames = [
            '王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴',
            '徐', '孙', '胡', '朱', '高', '林', '何', '郭', '马', '罗',
            '梁', '宋', '郑', '谢', '韩', '唐', '冯', '于', '董', '萧',
            '程', '曹', '袁', '邓', '许', '傅', '沈', '曾', '彭', '吕',
            '蘇', '盧', '蔣', '蔡', '賈', '丁', '魏', '薛', '葉', '閻',
            '孔', '白', '崔', '康', '毛', '邱', '秦', '江', '史', '顧',
            '侯', '邵', '孟', '龍', '萬', '段', '雷', '錢', '湯', '尹'
        ]
        
        self.chinese_dynasties = [
            '夏', '商', '周', '春秋', '戰國', '秦', '漢', '西漢', '東漢',
            '三國', '魏', '蜀', '吳', '晉', '西晉', '東晉', '南北朝',
            '隋', '唐', '五代', '宋', '北宋', '南宋', '遼', '金', '元',
            '明', '清', '民國', '中華民國'
        ]
        
        self.chinese_places = [
            '京師', '京', '南京', '北京', '西安', '洛陽', '開封', '杭州',
            '蘇州', '揚州', '成都', '重慶', '廣州', '福州', '廈門', '泉州',
            '長安', '咸陽', '臨安', '建康', '洛陽', '鄴', '平城', '汴梁',
            '燕京', '大都', '應天', '奉天', '山東', '山西', '河南', '河北',
            '陝西', '甘肅', '四川', '雲南', '貴州', '廣西', '廣東', '福建',
            '浙江', '江蘇', '安徽', '江西', '湖北', '湖南', '遼寧', '吉林',
            '黑龍江', '內蒙古', '新疆', '西藏', '青海', '寧夏', '海南', '臺灣'
        ]
        
        self.chinese_officials = [
            '皇帝', '天子', '王', '侯', '公', '伯', '子', '男',
            '丞相', '宰相', '太尉', '御史大夫', '太師', '太傅', '太保',
            '尚書', '侍郎', '郎中', '員外郎', '給事中', '中書舍人',
            '總督', '巡撫', '布政使', '按察使', '知府', '知州', '知縣',
            '將軍', '元帥', '都督', '總兵', '副將', '參將', '游擊',
            '翰林', '編修', '檢討', '庶吉士', '進士', '舉人', '秀才',
            '內閣大學士', '軍機大臣', '督辦', '欽差', '使臣', '太監'
        ]
        
        self.person_patterns = [
            r'([\u4e00-\u9fa5]{1,2}[\u4e00-\u9fa5]{1,2})公',
            r'([\u4e00-\u9fa5]{2,4})氏',
            r'([\u4e00-\u9fa5]{1,2}[\u4e00-\u9fa5]{1,2})大人',
            r'^([\u4e00-\u9fa5]{2,4})曰',
        ]
        
        self.relation_patterns = {
            'appointed': [r'任([\u4e00-\u9fa5]+)為([\u4e00-\u9fa5]+)', r'以([\u4e00-\u9fa5]+)為([\u4e00-\u9fa5]+)'],
            'from_place': [r'([\u4e00-\u9fa5]+)人', r'([\u4e00-\u9fa5]+)籍'],
            'in_dynasty': [r'([\u4e00-\u9fa5]+)[朝|代]'],
            'works_as': [r'([\u4e00-\u9fa5]+)官至([\u4e00-\u9fa5]+)'],
        }

    def extract_entities_from_text(self, text: str) -> List[Entity]:
        entities = []
        
        found_positions = set()
        
        for place in self.chinese_places:
            matches = list(re.finditer(re.escape(place), text))
            for match in matches:
                start, end = match.span()
                if not any(start <= p < end or start <= p < end for p in found_positions):
                    entities.append(Entity(
                        entity_type='GPE',
                        entity_text=place,
                        start_index=start,
                        end_index=end,
                        confidence=0.85,
                        metadata={'source': 'dictionary'}
                    ))
                    found_positions.update(range(start, end))
        
        for dynasty in self.chinese_dynasties:
            matches = list(re.finditer(re.escape(dynasty), text))
            for match in matches:
                start, end = match.span()
                if not any(start <= p < end for p in found_positions):
                    entities.append(Entity(
                        entity_type='Dynasty',
                        entity_text=dynasty,
                        start_index=start,
                        end_index=end,
                        confidence=0.90,
                        metadata={'source': 'dictionary'}
                    ))
                    found_positions.update(range(start, end))
        
        for official in self.chinese_officials:
            matches = list(re.finditer(re.escape(official), text))
            for match in matches:
                start, end = match.span()
                if not any(start <= p < end for p in found_positions):
                    entities.append(Entity(
                        entity_type='Position',
                        entity_text=official,
                        start_index=start,
                        end_index=end,
                        confidence=0.80,
                        metadata={'source': 'dictionary'}
                    ))
                    found_positions.update(range(start, end))
        
        for pattern in self.person_patterns:
            matches = list(re.finditer(pattern, text))
            for match in matches:
                if match.lastindex:
                    name = match.group(1)
                    start, end = match.span(1)
                    
                    if len(name) >= 2 and len(name) <= 4:
                        first_char = name[0]
                        if first_char in self.chinese_surnames:
                            if not any(start <= p < end for p in found_positions):
                                entities.append(Entity(
                                    entity_type='PERSON',
                                    entity_text=name,
                                    start_index=start,
                                    end_index=end,
                                    confidence=0.75,
                                    metadata={'source': 'pattern', 'pattern': pattern}
                                ))
                                found_positions.update(range(start, end))
        
        entities = sorted(entities, key=lambda e: e.start_index)
        
        return entities

    def extract_relations(self, text: str, entities: List[Entity]) -> List[EntityRelation]:
        relations = []
        
        person_entities = [e for e in entities if e.entity_type == 'PERSON']
        position_entities = [e for e in entities if e.entity_type == 'Position']
        place_entities = [e for e in entities if e.entity_type == 'GPE']
        dynasty_entities = [e for e in entities if e.entity_type == 'Dynasty']
        
        for person in person_entities:
            for position in position_entities:
                min_idx = min(person.start_index, position.start_index)
                max_idx = max(person.end_index, position.end_index)
                context = text[min_idx:max_idx]
                
                appointment_patterns = [r'任', r'為', r'官至', r'授', r'拜', r'封']
                if any(re.search(p, context) for p in appointment_patterns):
                    relations.append(EntityRelation(
                        source_entity=person.entity_text,
                        target_entity=position.entity_text,
                        relation_type='holds_position',
                        confidence=0.65,
                        evidence_text=context
                    ))
            
            for place in place_entities:
                min_idx = min(person.start_index, place.start_index)
                max_idx = max(person.end_index, place.end_index)
                context = text[min_idx:max_idx]
                
                location_patterns = [r'人', r'籍', r'生於', r'居於', r'來自']
                if any(re.search(p, context) for p in location_patterns):
                    relations.append(EntityRelation(
                        source_entity=person.entity_text,
                        target_entity=place.entity_text,
                        relation_type='from_place',
                        confidence=0.60,
                        evidence_text=context
                    ))
        
        for person in person_entities:
            for dynasty in dynasty_entities:
                min_idx = min(person.start_index, dynasty.start_index)
                max_idx = max(person.end_index, dynasty.end_index)
                context = text[min_idx:max_idx]
                
                if re.search(r'[朝|代|時|年]', context) or person.start_index > dynasty.start_index:
                    relations.append(EntityRelation(
                        source_entity=person.entity_text,
                        target_entity=dynasty.entity_text,
                        relation_type='in_dynasty',
                        confidence=0.55,
                        evidence_text=context
                    ))
        
        return relations

    def build_knowledge_graph(self, text: str) -> Tuple[List[Dict], List[Dict]]:
        entities = self.extract_entities_from_text(text)
        relations = self.extract_relations(text, entities)
        
        entities_dict = [
            {
                'entity_type': e.entity_type,
                'entity_text': e.entity_text,
                'start_index': e.start_index,
                'end_index': e.end_index,
                'confidence': e.confidence,
                'metadata': e.metadata
            }
            for e in entities
        ]
        
        relations_dict = [
            {
                'source_entity': r.source_entity,
                'target_entity': r.target_entity,
                'relation_type': r.relation_type,
                'confidence': r.confidence,
                'evidence_text': r.evidence_text
            }
            for r in relations
        ]
        
        return entities_dict, relations_dict

    def process_ocr_results(self, ocr_results: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
        all_text = ' '.join([r.get('text', '') for r in ocr_results])
        return self.build_knowledge_graph(all_text)


def get_knowledge_graph_service():
    return KnowledgeGraphService()
