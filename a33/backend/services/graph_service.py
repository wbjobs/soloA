from typing import List, Dict, Any, Optional, Tuple
import re
import json
from collections import defaultdict

from shared.config import settings
from shared.utils import generate_id
from shared.models import Document, Entity, Relation, KnowledgeGraphData

try:
    from neo4j import GraphDatabase, Driver, Session
    HAS_NEO4J = True
except ImportError:
    HAS_NEO4J = False


class AuthorNameNormalizer:
    NAME_PREFIXES = {'dr', 'dr.', 'mr', 'mr.', 'ms', 'ms.', 'mrs', 'mrs.', 'prof', 'prof.', 'phd', 'ph.d', 'md', 'm.d'}
    NAME_SUFFIXES = {'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'phd', 'ph.d', 'md', 'm.d'}

    @staticmethod
    def _normalize(name: str) -> str:
        name = name.strip().lower()
        name = re.sub(r'\s+', ' ', name)
        return name

    @classmethod
    def parse_name(cls, name: str) -> Dict[str, Any]:
        original = name.strip()
        normalized = cls._normalize(original)
        
        parts = normalized.replace(',', ' ').split()
        parts = [p.strip('.') for p in parts]
        
        parts = [p for p in parts if p not in cls.NAME_PREFIXES]
        parts = [p for p in parts if p not in cls.NAME_SUFFIXES]
        
        if not parts:
            return {'first': '', 'middle': '', 'last': normalized, 'full': normalized}
        
        has_comma = ',' in original
        if has_comma:
            last = parts[0]
            remaining = parts[1:]
        else:
            last = parts[-1]
            remaining = parts[:-1]
        
        first = remaining[0] if remaining else ''
        middle = ' '.join(remaining[1:]) if len(remaining) > 1 else ''
        
        return {
            'first': first,
            'middle': middle,
            'last': last,
            'full': normalized,
            'first_initial': first[0] if first else '',
            'middle_initial': middle[0] if middle else '',
        }

    @classmethod
    def canonicalize(cls, name: str) -> str:
        parsed = cls.parse_name(name)
        
        first = parsed['first'] or parsed['first_initial']
        middle = parsed['middle'] or parsed['middle_initial']
        
        if first and middle:
            key = f"{parsed['last']}_{first}_{middle}"
        elif first:
            key = f"{parsed['last']}_{first}"
        else:
            key = parsed['last']
        
        return key.lower()

    @classmethod
    def are_same_person(cls, name1: str, name2: str) -> Tuple[bool, str]:
        p1 = cls.parse_name(name1)
        p2 = cls.parse_name(name2)
        
        if p1['last'] != p2['last']:
            return False, ""
        
        canonical = cls.canonicalize(name1)
        
        f1 = p1['first']
        f2 = p2['first']
        fi1 = p1['first_initial']
        fi2 = p2['first_initial']
        
        if f1 and f2 and f1 != f2:
            if fi1 and fi2 and fi1 == fi2:
                return True, canonical
            return False, ""
        
        m1 = p1['middle']
        m2 = p2['middle']
        mi1 = p1['middle_initial']
        mi2 = p2['middle_initial']
        
        if m1 and m2 and m1 != m2:
            if mi1 and mi2 and mi1 == mi2:
                return True, canonical
            return False, ""
        
        return True, canonical


class GraphService:
    def __init__(self):
        self.driver: Optional[Driver] = None
        self._connected = False
        self._author_aliases: Dict[str, str] = {}
        self._canonical_to_primary: Dict[str, str] = {}

    def _connect(self) -> Driver:
        if not HAS_NEO4J:
            raise ImportError("neo4j not installed")
        if not self._connected:
            self.driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
            )
            self.driver.verify_connectivity()
            self._connected = True
        return self.driver

    def close(self):
        if self.driver:
            self.driver.close()
            self.driver = None
            self._connected = False

    def _resolve_author(self, author_name: str, session: Session) -> Optional[Entity]:
        name_lower = author_name.strip().lower()
        
        if name_lower in self._author_aliases:
            primary_name = self._author_aliases[name_lower]
            result = session.run(
                """
                MATCH (e:Entity {type: 'Author', name: $name})
                RETURN e.id AS id, e.name AS name
                """,
                {"name": primary_name}
            )
            record = result.single()
            if record:
                return Entity(id=record["id"], name=record["name"], type="Author")
        
        canonical = AuthorNameNormalizer.canonicalize(author_name)
        
        if canonical in self._canonical_to_primary:
            primary_name = self._canonical_to_primary[canonical]
            self._author_aliases[name_lower] = primary_name
            result = session.run(
                """
                MATCH (e:Entity {type: 'Author', name: $name})
                RETURN e.id AS id, e.name AS name
                """,
                {"name": primary_name}
            )
            record = result.single()
            if record:
                return Entity(id=record["id"], name=record["name"], type="Author")
        
        parsed = AuthorNameNormalizer.parse_name(author_name)
        last_name = parsed['last']
        first_initial = parsed['first_initial']
        
        if last_name:
            query = """
            MATCH (e:Entity {type: 'Author'})
            WHERE toLower(e.name) CONTAINS toLower($last)
            RETURN e.id AS id, e.name AS name
            """
            if first_initial:
                query = """
                MATCH (e:Entity {type: 'Author'})
                WHERE toLower(e.name) CONTAINS toLower($last)
                  AND (e.name =~ $initial_pattern OR e.name CONTAINS $full_first)
                RETURN e.id AS id, e.name AS name
                """
            
            result = session.run(
                query,
                last=last_name,
                initial_pattern=f".*\\b{first_initial}[a-z]*\\b.*" if first_initial else ".*",
                full_first=parsed['first'].title() if parsed['first'] else ""
            )
            
            for record in result:
                existing_name = record["name"]
                is_match, _ = AuthorNameNormalizer.are_same_person(author_name, existing_name)
                if is_match:
                    self._author_aliases[name_lower] = existing_name
                    existing_canonical = AuthorNameNormalizer.canonicalize(existing_name)
                    self._canonical_to_primary[canonical] = existing_name
                    self._canonical_to_primary[existing_canonical] = existing_name
                    return Entity(id=record["id"], name=existing_name, type="Author")
        
        return None

    def _normalize_author_name(self, author_name: str) -> str:
        parsed = AuthorNameNormalizer.parse_name(author_name)
        
        first = parsed['first'].title() if parsed['first'] else ''
        middle = parsed['middle'].title() if parsed['middle'] else ''
        last = parsed['last'].title()
        
        if first and middle:
            return f"{first} {middle} {last}"
        elif first:
            return f"{first} {last}"
        else:
            return last

    def extract_entities_from_document(
        self,
        document: Document,
        session: Optional[Session] = None
    ) -> List[Entity]:
        entities: List[Entity] = []
        entity_map: Dict[str, Entity] = {}

        def add_entity(name: str, entity_type: str):
            key = f"{entity_type}:{name.lower()}"
            if key not in entity_map:
                entity = Entity(
                    id=generate_id(),
                    name=name,
                    type=entity_type
                )
                entity_map[key] = entity
                entities.append(entity)
            return entity_map[key]

        for author in document.authors:
            if author and len(author) > 1:
                author_name = author.strip()
                
                if session:
                    existing = self._resolve_author(author_name, session)
                    if existing:
                        entity_map[f"Author:{existing.name.lower()}"] = existing
                        entities.append(existing)
                        continue
                
                normalized_name = self._normalize_author_name(author_name)
                entity = add_entity(normalized_name, "Author")
                
                canonical = AuthorNameNormalizer.canonicalize(author_name)
                self._canonical_to_primary[canonical] = normalized_name

        for keyword in document.keywords:
            if keyword and len(keyword) > 1:
                add_entity(keyword.strip(), "Keyword")

        if document.conference:
            add_entity(document.conference, "Conference")

        if document.year:
            add_entity(str(document.year), "Year")

        return entities

    def extract_relations(
        self,
        document: Document,
        entities: List[Entity]
    ) -> List[Relation]:
        relations: List[Relation] = []
        name_to_entity = {e.name: e for e in entities}
        type_to_entities = {}
        for e in entities:
            if e.type not in type_to_entities:
                type_to_entities[e.type] = []
            type_to_entities[e.type].append(e)

        paper_entity = Entity(
            id=generate_id(),
            name=document.title,
            type="Paper"
        )

        author_entities = type_to_entities.get("Author", [])
        for author in author_entities:
            relations.append(Relation(
                source_id=paper_entity.id,
                target_id=author.id,
                relation_type="WRITTEN_BY",
                metadata={"document_id": document.id}
            ))
            relations.append(Relation(
                source_id=author.id,
                target_id=paper_entity.id,
                relation_type="WROTE",
                metadata={"document_id": document.id}
            ))

        keyword_entities = type_to_entities.get("Keyword", [])
        for keyword in keyword_entities:
            relations.append(Relation(
                source_id=paper_entity.id,
                target_id=keyword.id,
                relation_type="HAS_KEYWORD",
                metadata={"document_id": document.id}
            ))
            relations.append(Relation(
                source_id=keyword.id,
                target_id=paper_entity.id,
                relation_type="USED_IN",
                metadata={"document_id": document.id}
            ))

        conference_entities = type_to_entities.get("Conference", [])
        for conf in conference_entities:
            relations.append(Relation(
                source_id=paper_entity.id,
                target_id=conf.id,
                relation_type="PRESENTED_AT",
                metadata={"document_id": document.id}
            ))

        year_entities = type_to_entities.get("Year", [])
        for year in year_entities:
            relations.append(Relation(
                source_id=paper_entity.id,
                target_id=year.id,
                relation_type="PUBLISHED_IN",
                metadata={"document_id": document.id}
            ))

        if document.citations > 0:
            citation_node = Entity(
                id=generate_id(),
                name=f"Cited {document.citations} times",
                type="Citation"
            )
            relations.append(Relation(
                source_id=paper_entity.id,
                target_id=citation_node.id,
                relation_type="HAS_CITATIONS",
                metadata={"count": document.citations}
            ))

        return paper_entity, relations

    def index_document(self, document: Document) -> Tuple[Entity, List[Entity], List[Relation]]:
        driver = self._connect()

        with driver.session() as session:
            entities = self.extract_entities_from_document(document, session)
            paper_entity, relations = self.extract_relations(document, entities)

            all_entities = [paper_entity] + entities

            self._create_nodes(session, all_entities)
            self._create_relations(session, relations)

        return paper_entity, entities, relations

    def _create_nodes(self, session: Session, entities: List[Entity]):
        for entity in entities:
            query = """
            MERGE (e:Entity {name: $name, type: $type})
            SET e.id = $id
            RETURN e
            """
            session.run(
                query,
                id=entity.id,
                name=entity.name,
                type=entity.type
            )

    def _create_relations(self, session: Session, relations: List[Relation]):
        for rel in relations:
            query = """
            MATCH (a:Entity), (b:Entity)
            WHERE a.id = $source_id AND b.id = $target_id
            MERGE (a)-[r:RELATION {type: $rel_type}]->(b)
            SET r.metadata = $metadata
            """
            session.run(
                query,
                source_id=rel.source_id,
                target_id=rel.target_id,
                rel_type=rel.relation_type,
                metadata=rel.metadata
            )

    def run_cypher_query(self, query: str, parameters: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        driver = self._connect()
        
        with driver.session() as session:
            result = session.run(query, parameters or {})
            return [dict(record) for record in result]

    def get_papers_by_author(self, author_name: str) -> List[Dict[str, Any]]:
        cypher = """
        MATCH (author:Entity {type: 'Author', name: $name})-[:WROTE]->(paper:Entity {type: 'Paper'})
        RETURN paper.name AS title
        """
        return self.run_cypher_query(cypher, {"name": author_name})

    def get_papers_by_keyword(self, keyword: str) -> List[Dict[str, Any]]:
        cypher = """
        MATCH (kw:Entity {type: 'Keyword', name: $name})-[:USED_IN]->(paper:Entity {type: 'Paper'})
        RETURN paper.name AS title
        """
        return self.run_cypher_query(cypher, {"name": keyword})

    def get_coauthors(self, author_name: str) -> List[Dict[str, Any]]:
        cypher = """
        MATCH (a:Entity {type: 'Author', name: $name})-[:WROTE]->(p:Entity {type: 'Paper'})<-[:WROTE]-(co:Entity {type: 'Author'})
        WHERE a <> co
        RETURN DISTINCT co.name AS coauthor, COUNT(p) AS papers_count
        ORDER BY papers_count DESC
        """
        return self.run_cypher_query(cypher, {"name": author_name})

    def get_full_graph(self, limit: int = 100) -> KnowledgeGraphData:
        driver = self._connect()

        nodes_query = """
        MATCH (n:Entity)
        RETURN n.id AS id, n.name AS name, n.type AS type
        LIMIT $limit
        """
        
        edges_query = """
        MATCH (a:Entity)-[r:RELATION]->(b:Entity)
        RETURN a.id AS source, b.id AS target, r.type AS relation
        LIMIT $limit
        """

        with driver.session() as session:
            nodes_result = session.run(nodes_query, {"limit": limit})
            nodes = []
            for record in nodes_result:
                nodes.append({
                    "id": record["id"],
                    "name": record["name"],
                    "type": record["type"]
                })

            edges_result = session.run(edges_query, {"limit": limit})
            edges = []
            for record in edges_result:
                edges.append({
                    "source": record["source"],
                    "target": record["target"],
                    "relation": record["relation"]
                })

        return KnowledgeGraphData(nodes=nodes, edges=edges)

    def get_graph_around_entity(
        self,
        entity_name: str,
        hops: int = 2,
        limit: int = 50
    ) -> KnowledgeGraphData:
        driver = self._connect()

        query = f"""
        MATCH path = (start:Entity {{name: $name}})-[*1..{hops}]-(related)
        WITH nodes(path) AS ns, relationships(path) AS rs
        UNWIND ns AS n
        WITH DISTINCT n, rs
        UNWIND rs AS r
        WITH DISTINCT n, r
        RETURN 
            collect(DISTINCT {{id: n.id, name: n.name, type: n.type}}) AS nodes,
            collect(DISTINCT {{source: startNode(r).id, target: endNode(r).id, relation: r.type}}) AS edges
        LIMIT $limit
        """

        with driver.session() as session:
            result = session.run(query, {"name": entity_name, "limit": limit})
            record = result.single()

            if record:
                return KnowledgeGraphData(
                    nodes=record["nodes"] or [],
                    edges=record["edges"] or []
                )

        return KnowledgeGraphData(nodes=[], edges=[])

    def multi_hop_query(
        self,
        start_entity: str,
        relation_path: List[str]
    ) -> List[Dict[str, Any]]:
        if not relation_path:
            return []

        driver = self._connect()
        
        pattern_parts = []
        current = "e0"
        
        for i, rel_type in enumerate(relation_path):
            next_node = f"e{i+1}"
            pattern_parts.append(f"({current})-[:RELATION {{type: '{rel_type}'}}]->({next_node})")
            current = next_node

        pattern = ", ".join(pattern_parts)
        query = f"""
        MATCH {pattern}
        WHERE e0.name = $start_name
        RETURN {current}.name AS result, {current}.type AS type
        """

        with driver.session() as session:
            result = session.run(query, {"start_name": start_entity})
            return [{"name": r["result"], "type": r["type"]} for r in result]
