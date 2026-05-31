from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

from shared.utils import generate_id
from shared.models import (
    MissingLink, ResearchHypothesis, HypothesisResponse
)
from services.graph_service import GraphService
from services.llm_gateway import LLMGateway


class HypothesisService:
    def __init__(
        self,
        graph_service: Optional[GraphService] = None,
        llm_gateway: Optional[LLMGateway] = None
    ):
        self.graph_service = graph_service or GraphService()
        self.llm_gateway = llm_gateway or LLMGateway()

    def _get_graph_statistics(self) -> Dict[str, Any]:
        try:
            entity_query = """
            MATCH (e:Entity)
            RETURN e.type AS type, COUNT(e) AS count
            ORDER BY count DESC
            """
            type_counts = self.graph_service.run_cypher_query(entity_query)
            
            relation_query = """
            MATCH ()-[r:RELATION]->()
            RETURN r.type AS type, COUNT(r) AS count
            ORDER BY count DESC
            """
            relation_counts = self.graph_service.run_cypher_query(relation_query)
            
            top_authors_query = """
            MATCH (a:Entity {type: 'Author'})-[:WROTE]->(p:Entity {type: 'Paper'})
            RETURN a.name AS author, COUNT(p) AS papers
            ORDER BY papers DESC
            LIMIT 10
            """
            top_authors = self.graph_service.run_cypher_query(top_authors_query)
            
            top_keywords_query = """
            MATCH (k:Entity {type: 'Keyword'})<-[:HAS_KEYWORD]-(p:Entity {type: 'Paper'})
            RETURN k.name AS keyword, COUNT(p) AS papers
            ORDER BY papers DESC
            LIMIT 20
            """
            top_keywords = self.graph_service.run_cypher_query(top_keywords_query)
            
            return {
                "entity_types": {r["type"]: r["count"] for r in type_counts},
                "relation_types": {r["type"]: r["count"] for r in relation_counts},
                "top_authors": top_authors,
                "top_keywords": top_keywords
            }
        except Exception as e:
            return {"error": str(e)}

    def _find_missing_connections(self) -> List[MissingLink]:
        missing_links = []
        
        try:
            keyword_cooccur_query = """
            MATCH (p1:Entity {type: 'Paper'})-[:HAS_KEYWORD]->(k1:Entity {type: 'Keyword'}),
                  (p1)-[:HAS_KEYWORD]->(k2:Entity {type: 'Keyword'})
            WHERE k1.name < k2.name
            RETURN k1.name AS kw1, k2.name AS kw2, COUNT(p1) AS co_count
            ORDER BY co_count DESC
            LIMIT 50
            """
            keyword_cooccur = self.graph_service.run_cypher_query(keyword_cooccur_query)
            
            keyword_author_query = """
            MATCH (p:Entity {type: 'Paper'})-[:HAS_KEYWORD]->(k:Entity {type: 'Keyword'}),
                  (p)<-[:WROTE]-(a:Entity {type: 'Author'})
            WITH k.name AS keyword, COLLECT(DISTINCT a.name) AS authors, COUNT(p) AS total_papers
            WHERE total_papers > 1
            RETURN keyword, authors, total_papers
            ORDER BY total_papers DESC
            LIMIT 30
            """
            keyword_authors = self.graph_service.run_cypher_query(keyword_author_query)
            
            for kw_data in keyword_authors:
                authors = kw_data.get("authors", [])
                total = kw_data.get("total_papers", 0)
                keyword = kw_data.get("keyword", "")
                
                if total >= 2 and len(authors) >= 2:
                    for i, a1 in enumerate(authors):
                        for a2 in authors[i+1:]:
                            coauthor_query = """
                            MATCH (a1:Entity {type: 'Author', name: $a1_name}),
                                  (a2:Entity {type: 'Author', name: $a2_name}),
                                  (a1)-[:WROTE]->(p:Entity {type: 'Paper'})<-[:WROTE]-(a2)
                            RETURN COUNT(p) AS co_papers
                            """
                            result = self.graph_service.run_cypher_query(
                                coauthor_query, 
                                {"a1_name": a1, "a2_name": a2}
                            )
                            co_papers = result[0].get("co_papers", 0) if result else 0
                            
                            if co_papers == 0:
                                missing_links.append(MissingLink(
                                    source_name=a1,
                                    source_type="Author",
                                    target_name=a2,
                                    target_type="Author",
                                    missing_relation="POTENTIAL_COAUTHOR",
                                    confidence=min(0.8, total * 0.2),
                                    evidence=[
                                        f"Both work on '{keyword}'",
                                        f"Keyword appears in {total} papers",
                                        f"No prior co-authorship recorded"
                                    ]
                                ))
            
            author_keyword_query = """
            MATCH (a:Entity {type: 'Author'})-[:WROTE]->(p:Entity {type: 'Paper'}),
                  (p)-[:HAS_KEYWORD]->(k:Entity {type: 'Keyword'})
            WITH a.name AS author, k.name AS keyword, COUNT(p) AS paper_count
            ORDER BY author, paper_count DESC
            """
            author_keywords = self.graph_service.run_cypher_query(author_keyword_query)
            
            author_kws = defaultdict(list)
            for row in author_keywords:
                author_kws[row["author"]].append((row["keyword"], row["paper_count"]))
            
            keywords_authors = defaultdict(list)
            for row in author_keywords:
                keywords_authors[row["keyword"]].append(row["author"])
            
            for author, kws in author_kws.items():
                if len(kws) >= 2:
                    for related_kw, count in kws:
                        for other_author in keywords_authors.get(related_kw, []):
                            if other_author != author:
                                has_relation = False
                                for kw2, _ in kws:
                                    if kw2 == related_kw:
                                        continue
                                    if other_author in keywords_authors.get(kw2, []):
                                        has_relation = True
                                        break
                                
                                if not has_relation and count >= 2:
                                    missing_links.append(MissingLink(
                                        source_name=author,
                                        source_type="Author",
                                        target_name=related_kw,
                                        target_type="Keyword",
                                        missing_relation="EXTENDED_INTEREST",
                                        confidence=min(0.7, count * 0.15),
                                        evidence=[
                                            f"Co-occurs with {other_author} on '{related_kw}'",
                                            f"Appears in {count} of author's papers"
                                        ]
                                    ))
            
            year_conference_query = """
            MATCH (p:Entity {type: 'Paper'})-[:PUBLISHED_IN]->(y:Entity {type: 'Year'}),
                  (p)-[:PRESENTED_AT]->(c:Entity {type: 'Conference'})
            WITH y.name AS year, c.name AS conference, COUNT(p) AS papers
            RETURN year, conference, papers
            ORDER BY year DESC, papers DESC
            """
            year_conf = self.graph_service.run_cypher_query(year_conference_query)
            
            if len(year_conf) >= 5:
                years = sorted(set(r["year"] for r in year_conf))
                for i in range(len(years) - 1):
                    y1, y2 = years[i], years[i+1]
                    confs_y1 = {r["conference"] for r in year_conf if r["year"] == y1}
                    confs_y2 = {r["conference"] for r in year_conf if r["year"] == y2}
                    
                    disappeared = confs_y1 - confs_y2
                    for conf in disappeared:
                        missing_links.append(MissingLink(
                            source_name=y1,
                            source_type="Year",
                            target_name=conf,
                            target_type="Conference",
                            missing_relation="CONTINUED_PRESENCE",
                            confidence=0.6,
                            evidence=[
                                f"{conf} had papers in {y1}",
                                f"No papers in {y2} - trend shift or gap"
                            ]
                        ))
        
        except Exception as e:
            print(f"Error finding missing links: {e}")
        
        return sorted(missing_links, key=lambda x: x.confidence, reverse=True)[:10]

    def _generate_hypotheses_with_llm(
        self,
        missing_links: List[MissingLink],
        graph_stats: Dict[str, Any]
    ) -> List[ResearchHypothesis]:
        if not missing_links:
            return []
        
        top_keywords = [
            k.get("keyword", "") 
            for k in graph_stats.get("top_keywords", [])[:10]
        ]
        top_authors = [
            a.get("author", "") 
            for a in graph_stats.get("top_authors", [])[:5]
        ]

        system_prompt = """You are an AI research assistant that generates testable scientific hypotheses from knowledge graph insights.

For each identified gap in the knowledge graph, generate:
1. A clear, testable hypothesis statement
2. 2-3 specific experiments or studies to verify it
3. Confidence score (0.0-1.0) based on available evidence

Return as a JSON array of objects with fields:
- hypothesis: the hypothesis statement
- confidence: float
- experiments: array of experiment descriptions
- based_on: array of evidence strings
- related_work: array of related keywords/authors

Be creative but scientifically grounded."""

        missing_links_text = "\n".join([
            f"Gap {i+1}: {ml.source_type} '{ml.source_name}' --[MISSING: {ml.missing_relation}]--> {ml.target_type} '{ml.target_name}'\n"
            f"  Evidence: {'; '.join(ml.evidence)}\n"
            f"  Confidence: {ml.confidence:.2f}"
            for i, ml in enumerate(missing_links[:5])
        ])

        user_prompt = f"""Graph Context:
- Top research topics: {', '.join(top_keywords)}
- Active researchers: {', '.join(top_authors)}

Identified potential gaps:
{missing_links_text}

Generate 3-5 specific, testable research hypotheses from these insights."""

        try:
            result = self.llm_gateway.generate_json(
                prompt=user_prompt,
                system_prompt=system_prompt
            )
            
            hypotheses = []
            if isinstance(result, dict) and "hypotheses" in result:
                items = result["hypotheses"]
            elif isinstance(result, list):
                items = result
            else:
                items = []
            
            for i, item in enumerate(items[:5]):
                if isinstance(item, dict):
                    hyp = ResearchHypothesis(
                        id=generate_id(),
                        statement=item.get("hypothesis", item.get("statement", str(item))),
                        confidence=float(item.get("confidence", 0.5)),
                        based_on=item.get("based_on", item.get("evidence", [])),
                        experiments=item.get("experiments", item.get("verification", [])),
                        related_work=item.get("related_work", item.get("related", []))
                    )
                    hypotheses.append(hyp)
            
            return hypotheses
            
        except Exception as e:
            print(f"LLM hypothesis generation error: {e}")
            return self._generate_fallback_hypotheses(missing_links)

    def _generate_fallback_hypotheses(
        self,
        missing_links: List[MissingLink]
    ) -> List[ResearchHypothesis]:
        hypotheses = []
        
        for i, ml in enumerate(missing_links[:3]):
            if ml.source_type == "Author" and ml.target_type == "Author":
                hyp = ResearchHypothesis(
                    id=generate_id(),
                    statement=f"Researchers {ml.source_name} and {ml.target_name} could benefit from collaboration on topics related to '{ml.evidence[0] if ml.evidence else 'shared research interests'}'.",
                    confidence=ml.confidence,
                    based_on=ml.evidence,
                    experiments=[
                        f"Review recent publications from {ml.source_name} and {ml.target_name} for methodological complementarity",
                        "Identify overlapping datasets or tools that could enable joint projects",
                        "Check for shared conference participation or workshop attendance"
                    ],
                    related_work=[ml.source_name, ml.target_name]
                )
                hypotheses.append(hyp)
            
            elif ml.source_type == "Author" and ml.target_type == "Keyword":
                hyp = ResearchHypothesis(
                    id=generate_id(),
                    statement=f"Author {ml.source_name}'s research interests may extend to include '{ml.target_name}' based on co-occurrence patterns.",
                    confidence=ml.confidence,
                    based_on=ml.evidence,
                    experiments=[
                        f"Search recent papers by {ml.source_name} for implicit references to '{ml.target_name}'",
                        "Check citation networks for methodological connections",
                        "Review author's conference topics over time"
                    ],
                    related_work=[ml.source_name, ml.target_name]
                )
                hypotheses.append(hyp)
            
            elif ml.target_type == "Conference":
                hyp = ResearchHypothesis(
                    id=generate_id(),
                    statement=f"The absence of papers from {ml.target_name} in {ml.source_name} may indicate a research trend shift or temporary gap.",
                    confidence=ml.confidence,
                    based_on=ml.evidence,
                    experiments=[
                        f"Verify if {ml.target_name} was held in {ml.source_name}",
                        "Check related conferences for absorption of this community",
                        "Analyze keyword evolution in the research community"
                    ],
                    related_work=[ml.source_name, ml.target_name]
                )
                hypotheses.append(hyp)
        
        return hypotheses

    def generate_research_hypotheses(
        self,
        focus_entity: Optional[str] = None
    ) -> HypothesisResponse:
        graph_stats = self._get_graph_statistics()
        
        missing_links = self._find_missing_connections()
        
        if focus_entity:
            filtered = [
                ml for ml in missing_links
                if focus_entity.lower() in ml.source_name.lower()
                or focus_entity.lower() in ml.target_name.lower()
            ]
            if filtered:
                missing_links = filtered
        
        hypotheses = self._generate_hypotheses_with_llm(
            missing_links,
            graph_stats
        )
        
        summary = self._generate_summary(missing_links, hypotheses, graph_stats)
        
        return HypothesisResponse(
            missing_links=missing_links,
            hypotheses=hypotheses,
            summary=summary
        )

    def _generate_summary(
        self,
        missing_links: List[MissingLink],
        hypotheses: List[ResearchHypothesis],
        graph_stats: Dict[str, Any]
    ) -> str:
        if not missing_links and not hypotheses:
            return "Insufficient graph data to generate hypotheses. Upload more papers to enable hypothesis generation."
        
        summary_parts = []
        
        paper_count = graph_stats.get("entity_types", {}).get("Paper", 0)
        author_count = graph_stats.get("entity_types", {}).get("Author", 0)
        keyword_count = graph_stats.get("entity_types", {}).get("Keyword", 0)
        
        summary_parts.append(
            f"Analysis of {paper_count} papers, {author_count} authors, and {keyword_count} research topics "
            f"revealed {len(missing_links)} potential knowledge gaps."
        )
        
        if hypotheses:
            summary_parts.append(
                f"Generated {len(hypotheses)} testable research hypotheses. "
                f"Highest confidence: {max(h.confidence for h in hypotheses):.2f}"
            )
        
        high_confidence = [h for h in hypotheses if h.confidence > 0.6]
        if high_confidence:
            summary_parts.append(
                f"{len(high_confidence)} hypotheses have sufficient confidence to recommend experimental validation."
            )
        
        return " ".join(summary_parts)
