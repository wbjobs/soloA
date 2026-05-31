from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict
from datetime import datetime

from shared.utils import generate_id
from shared.models import (
    TopicCluster, LiteratureReview, SearchResult, ReviewRequest,
    TrendDataPoint
)
from services.embedding_service import EmbeddingService
from services.graph_service import GraphService
from services.llm_gateway import LLMGateway


class ReviewService:
    def __init__(
        self,
        embedding_service: Optional[EmbeddingService] = None,
        graph_service: Optional[GraphService] = None,
        llm_gateway: Optional[LLMGateway] = None
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.graph_service = graph_service or GraphService()
        self.llm_gateway = llm_gateway or LLMGateway()

    def _cluster_by_keywords(
        self,
        results: List[SearchResult],
        max_clusters: int = 5
    ) -> Dict[str, List[Dict[str, Any]]]:
        keyword_clusters = defaultdict(list)
        general_cluster = []

        for result in results:
            metadata = result.chunk.metadata
            keywords = metadata.get("keywords", [])
            
            paper_info = {
                "title": metadata.get("title", "Unknown"),
                "authors": metadata.get("authors", []),
                "year": metadata.get("year"),
                "conference": metadata.get("conference"),
                "content": result.chunk.content,
                "score": result.score,
                "keywords": keywords
            }

            if keywords:
                main_keyword = keywords[0]
                keyword_clusters[main_keyword].append(paper_info)
            else:
                general_cluster.append(paper_info)

        sorted_clusters = sorted(
            keyword_clusters.items(),
            key=lambda x: len(x[1]),
            reverse=True
        )[:max_clusters]

        clusters = dict(sorted_clusters)
        
        if general_cluster:
            if len(clusters) < max_clusters:
                clusters["Other Topics"] = general_cluster
            elif clusters:
                last_key = list(clusters.keys())[-1]
                clusters[last_key].extend(general_cluster)

        return clusters

    def _extract_trends(
        self,
        papers: List[Dict[str, Any]]
    ) -> List[TrendDataPoint]:
        year_stats = defaultdict(lambda: {"count": 0, "keywords": set()})

        for paper in papers:
            year = paper.get("year")
            if year:
                try:
                    year_int = int(year)
                    year_stats[year_int]["count"] += 1
                    for kw in paper.get("keywords", []):
                        year_stats[year_int]["keywords"].add(kw)
                except (ValueError, TypeError):
                    continue

        trends = []
        for year in sorted(year_stats.keys()):
            stats = year_stats[year]
            trends.append(TrendDataPoint(
                year=year,
                count=stats["count"],
                keywords=list(stats["keywords"])[:5]
            ))

        return trends

    def _extract_dominant_authors(
        self,
        papers: List[Dict[str, Any]],
        top_n: int = 5
    ) -> List[str]:
        author_counts = defaultdict(int)
        
        for paper in papers:
            for author in paper.get("authors", []):
                author_counts[author] += 1

        sorted_authors = sorted(
            author_counts.items(),
            key=lambda x: x[1],
            reverse=True
        )[:top_n]

        return [author for author, count in sorted_authors]

    def _generate_cluster_summary(
        self,
        topic_name: str,
        papers: List[Dict[str, Any]],
        dominant_authors: List[str]
    ) -> str:
        if len(papers) <= 2:
            titles = "\n".join([f"- {p['title']}" for p in papers[:3]])
            return f"Topic cluster '{topic_name}' contains {len(papers)} papers:\n{titles}"

        paper_titles = "\n".join([
            f"- {p['title']} ({p.get('year', 'N/A')})"
            for p in papers[:10]
        ])

        system_prompt = """You are an academic reviewer. Summarize the key themes and contributions of these papers.
Focus on:
1. Main research question/problem
2. Key methodologies or approaches
3. Significant findings
4. Limitations and open problems

Keep the summary concise (150-200 words)."""

        user_prompt = f"""Topic: {topic_name}
Key researchers: {', '.join(dominant_authors[:5])}

Papers in this cluster:
{paper_titles}

Provide a structured summary of this research area."""

        try:
            return self.llm_gateway.generate(
                messages=[{"role": "user", "content": user_prompt}],
                system_prompt=system_prompt,
                max_tokens=300,
                temperature=0.3
            )
        except Exception:
            return f"Research area focusing on {topic_name}, with {len(papers)} papers from leading researchers including {', '.join(dominant_authors[:3])}."

    def _generate_overall_review(
        self,
        query: str,
        clusters: Dict[str, List[Dict[str, Any]]],
        all_papers: List[Dict[str, Any]]
    ) -> Tuple[str, str, List[str]]:
        cluster_names = list(clusters.keys())
        total_papers = sum(len(papers) for papers in clusters.values())

        clusters_text = "\n\n".join([
            f"Cluster {i+1}: {name}\nPapers: {len(papers)}"
            for i, (name, papers) in enumerate(clusters.items())
        ])

        system_prompt = """You are an expert academic reviewer. Generate a literature review summary.
Return a JSON object with:
- title: A concise review title
- summary: Comprehensive overview (300-400 words)
- future_directions: Array of 3-5 future research directions

The summary should:
1. Provide an overview of the research landscape
2. Compare and contrast different approaches
3. Highlight key debates or controversies
4. Identify gaps in existing literature"""

        user_prompt = f"""Query: {query}
Total papers reviewed: {total_papers}
Research clusters identified: {len(clusters)}

Cluster breakdown:
{clusters_text}

Generate a structured literature review."""

        try:
            result = self.llm_gateway.generate_json(
                prompt=user_prompt,
                system_prompt=system_prompt
            )

            if isinstance(result, dict):
                title = result.get("title", f"Literature Review: {query}")
                summary = result.get("summary", "")
                future_directions = result.get("future_directions", [])
                
                if not summary:
                    summary = self._fallback_summary(query, clusters, total_papers)
                
                return title, summary, future_directions
        except Exception as e:
            print(f"LLM review generation error: {e}")

        title = f"Literature Review: {query}"
        summary = self._fallback_summary(query, clusters, total_papers)
        future_directions = [
            f"Further exploration of emerging topics in {', '.join(cluster_names[-2:]) if len(cluster_names) > 2 else 'this domain'}",
            "Cross-domain comparisons between research clusters",
            "Meta-analysis of methodologies across studies"
        ]

        return title, summary, future_directions

    def _fallback_summary(
        self,
        query: str,
        clusters: Dict[str, List[Dict[str, Any]]],
        total_papers: int
    ) -> str:
        cluster_names = list(clusters.keys())

        summary = f"This literature review covers {total_papers} papers related to '{query}'. "
        summary += f"The research landscape can be organized into {len(clusters)} main clusters: {', '.join(cluster_names)}. "

        if clusters:
            largest_cluster = max(clusters.items(), key=lambda x: len(x[1]))
            summary += f"The most active area is '{largest_cluster[0]}' with {len(largest_cluster[1])} papers. "

            if len(clusters) > 1:
                summary += "Key research directions span across these interconnected topics, suggesting a multifaceted research domain."

        return summary

    def generate_review(
        self,
        request: ReviewRequest
    ) -> LiteratureReview:
        from shared.models import SearchQuery

        search_query = SearchQuery(
            query=request.query,
            top_k=request.top_k,
            filters={}
        )

        search_results = []
        try:
            results_data = self.embedding_service.search(
                query=request.query,
                top_k=request.top_k
            )
            for r in results_data:
                from shared.models import DocumentChunk
                search_results.append(SearchResult(
                    chunk=DocumentChunk(
                        id=r["id"],
                        document_id=r["document_id"],
                        content=r["content"],
                        chunk_index=r["chunk_index"],
                        metadata=r["metadata"]
                    ),
                    score=r["score"]
                ))
        except Exception as e:
            print(f"Search error during review: {e}")

        if not search_results:
            return LiteratureReview(
                id=generate_id(),
                query=request.query,
                title=f"Literature Review: {request.query}",
                summary="Insufficient papers found to generate a comprehensive review. Please upload more relevant papers or adjust your search query.",
                clusters=[],
                research_trends=[],
                future_directions=[],
                citations=[]
            )

        clusters = self._cluster_by_keywords(search_results)

        all_papers = []
        for papers in clusters.values():
            all_papers.extend(papers)

        topic_clusters = []
        for topic_name, papers in clusters.items():
            dominant_authors = self._extract_dominant_authors(papers)
            trends = self._extract_trends(papers)

            trend_dict = {t.year: t.count for t in trends}

            cluster = TopicCluster(
                topic_name=topic_name,
                keywords=[p["keywords"][0] for p in papers[:5] if p.get("keywords")],
                paper_count=len(papers),
                papers=[{
                    "title": p["title"],
                    "authors": p["authors"],
                    "year": p["year"],
                    "summary": p["content"][:200] + "..." if len(p["content"]) > 200 else p["content"]
                } for p in papers[:10]],
                dominant_authors=dominant_authors,
                trend_data=trend_dict
            )
            topic_clusters.append(cluster)

        title, summary, future_directions = self._generate_overall_review(
            request.query,
            clusters,
            all_papers
        )

        all_trends = self._extract_trends(all_papers)
        research_trends = [t.model_dump() for t in all_trends]

        citations = []
        seen_titles = set()
        for result in search_results[:10]:
            meta = result.chunk.metadata
            title_ = meta.get("title", "")
            if title_ and title_ not in seen_titles:
                seen_titles.add(title_)
                citations.append({
                    "title": title_,
                    "authors": meta.get("authors", []),
                    "year": meta.get("year"),
                    "conference": meta.get("conference")
                })

        return LiteratureReview(
            id=generate_id(),
            query=request.query,
            title=title,
            summary=summary,
            clusters=topic_clusters,
            research_trends=research_trends,
            future_directions=future_directions,
            citations=citations
        )

    def generate_trend_visualization_data(
        self,
        query: str,
        top_k: int = 50
    ) -> Dict[str, Any]:
        from shared.models import SearchQuery

        search_results = []
        try:
            results_data = self.embedding_service.search(
                query=query,
                top_k=top_k
            )
            for r in results_data:
                from shared.models import DocumentChunk
                search_results.append(SearchResult(
                    chunk=DocumentChunk(
                        id=r["id"],
                        document_id=r["document_id"],
                        content=r["content"],
                        chunk_index=r["chunk_index"],
                        metadata=r["metadata"]
                    ),
                    score=r["score"]
                ))
        except Exception:
            pass

        papers = []
        for result in search_results:
            metadata = result.chunk.metadata
            papers.append({
                "title": metadata.get("title", ""),
                "year": metadata.get("year"),
                "keywords": metadata.get("keywords", []),
                "authors": metadata.get("authors", []),
                "conference": metadata.get("conference")
            })

        year_trends = self._extract_trends(papers)

        keyword_trends = defaultdict(lambda: defaultdict(int))
        for paper in papers:
            year = paper.get("year")
            if year:
                try:
                    year_int = int(year)
                    for kw in paper.get("keywords", []):
                        keyword_trends[kw][year_int] += 1
                except (ValueError, TypeError):
                    continue

        top_keywords = sorted(
            keyword_trends.items(),
            key=lambda x: sum(x[1].values()),
            reverse=True
        )[:10]

        return {
            "query": query,
            "year_trends": [t.model_dump() for t in year_trends],
            "keyword_trends": {
                kw: dict(year_counts)
                for kw, year_counts in top_keywords
            },
            "conference_distribution": self._get_conference_distribution(papers)
        }

    def _get_conference_distribution(
        self,
        papers: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        conf_counts = defaultdict(int)
        for paper in papers:
            conf = paper.get("conference")
            if conf:
                conf_counts[conf] += 1
        return dict(sorted(conf_counts.items(), key=lambda x: x[1], reverse=True)[:10])
