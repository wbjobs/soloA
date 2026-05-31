from typing import List, Dict, Any, Optional, Tuple
import re
import json
from dataclasses import dataclass

from shared.config import settings
from shared.models import (
    Document, SearchQuery, SearchResult, Answer, Message,
    KnowledgeGraphData, DocumentChunk
)
from services.embedding_service import EmbeddingService
from services.graph_service import GraphService
from services.llm_gateway import LLMGateway


@dataclass
class ContextLimits:
    MAX_TOTAL_TOKENS: int = 8000
    MAX_VECTOR_RESULTS: int = 5
    MAX_GRAPH_RESULTS: int = 3
    MAX_CHUNK_SIZE: int = 300
    MAX_HISTORY_MESSAGES: int = 4
    RESERVED_OUTPUT_TOKENS: int = 1500
    RESERVED_SYSTEM_PROMPT: int = 200


class TokenCounter:
    _word_token_ratio = 0.75
    _char_token_ratio = 4.0

    @classmethod
    def estimate(cls, text: str) -> int:
        if not text:
            return 0
        
        words = len(text.split())
        chars = len(text)
        
        token_count = int(words * cls._word_token_ratio + chars / cls._char_token_ratio) // 2
        return max(token_count, 1)

    @classmethod
    def estimate_message(cls, msg: Dict[str, str]) -> int:
        return cls.estimate(msg.get("content", "")) + 4

    @classmethod
    def estimate_messages(cls, messages: List[Dict[str, str]]) -> int:
        return sum(cls.estimate_message(m) for m in messages) + 3


class ContextCompressor:
    @staticmethod
    def compress_chunks(
        results: List[SearchResult],
        max_results: int,
        max_chunk_size: int,
        min_score_threshold: float = 0.5
    ) -> List[SearchResult]:
        filtered = [r for r in results if r.score >= min_score_threshold]
        
        if not filtered:
            filtered = results
        
        sorted_results = sorted(filtered, key=lambda r: r.score, reverse=True)
        top_results = sorted_results[:max_results]
        
        for result in top_results:
            if len(result.chunk.content) > max_chunk_size:
                result.chunk.content = result.chunk.content[:max_chunk_size] + "..."
        
        return top_results

    @staticmethod
    def deduplicate_results(results: List[SearchResult]) -> List[SearchResult]:
        seen_docs = set()
        unique_results = []
        
        for result in results:
            doc_id = result.chunk.document_id
            if doc_id not in seen_docs:
                seen_docs.add(doc_id)
                unique_results.append(result)
        
        return unique_results

    @staticmethod
    def compress_history(
        history: List[Message],
        max_messages: int,
        max_message_tokens: int = 500
    ) -> List[Dict[str, str]]:
        if not history:
            return []
        
        recent = history[-max_messages:]
        
        compressed = []
        for msg in recent:
            content = msg.content
            if TokenCounter.estimate(content) > max_message_tokens:
                words = content.split()
                while TokenCounter.estimate(content) > max_message_tokens and len(words) > 50:
                    words = words[:-10]
                    content = ' '.join(words) + "..."
            compressed.append({"role": msg.role, "content": content})
        
        return compressed


class ReasoningService:
    def __init__(
        self,
        embedding_service: Optional[EmbeddingService] = None,
        graph_service: Optional[GraphService] = None,
        llm_gateway: Optional[LLMGateway] = None
    ):
        self.embedding_service = embedding_service or EmbeddingService()
        self.graph_service = graph_service or GraphService()
        self.llm_gateway = llm_gateway or LLMGateway()
        self.limits = ContextLimits()

    def vector_search(
        self,
        query: SearchQuery
    ) -> List[SearchResult]:
        results = self.embedding_service.search(
            query=query.query,
            top_k=query.top_k or settings.TOP_K,
            filters=query.filters
        )

        formatted_results = []
        for result in results:
            chunk = DocumentChunk(
                id=result["id"],
                document_id=result["document_id"],
                content=result["content"],
                chunk_index=result["chunk_index"],
                metadata=result["metadata"]
            )
            formatted_results.append(SearchResult(
                chunk=chunk,
                score=result["score"]
            ))

        return formatted_results

    def _should_use_graph(self, query: str) -> bool:
        graph_keywords = [
            "who wrote", "author", "authors", "co-author", "coauthor",
            "citation", "citations", "cited by",
            "conference", "proceedings", "published", "year",
            "keyword", "topics", "concepts", "related work",
            "relationship", "connection", "network", "graph"
        ]
        
        query_lower = query.lower()
        return any(kw in query_lower for kw in graph_keywords)

    def _generate_cypher_query(self, user_query: str) -> Optional[str]:
        system_prompt = """You are a Cypher query generator for an academic knowledge graph.
The graph has these node types: Paper, Author, Keyword, Conference, Year
The graph has these relationship types: WROTE, WRITTEN_BY, HAS_KEYWORD, USED_IN, PRESENTED_AT, PUBLISHED_IN

Generate a Cypher query to answer the user's question. Return ONLY the Cypher query, no explanation.

Example:
User: "Who wrote papers about machine learning?"
Cypher: MATCH (k:Keyword {name: 'machine learning'})-[:USED_IN]->(p:Paper)<-[:WROTE]-(a:Author) RETURN a.name AS author

User: "What papers were published in 2023?"
Cypher: MATCH (p:Paper)-[:PUBLISHED_IN]->(y:Year {name: '2023'}) RETURN p.name AS title
"""

        messages = [{"role": "user", "content": user_query}]
        
        try:
            cypher = self.llm_gateway.generate(
                messages=messages,
                system_prompt=system_prompt,
                max_tokens=200,
                temperature=0.1
            )
            cypher = cypher.strip()
            if cypher.upper().startswith("MATCH"):
                return cypher
        except Exception:
            pass
        
        return None

    def _graph_search(self, query: str) -> Tuple[List[Dict[str, Any]], str]:
        graph_results = []
        graph_explanation = ""

        cypher_query = self._generate_cypher_query(query)
        
        if cypher_query:
            try:
                graph_results = self.graph_service.run_cypher_query(cypher_query)
                graph_explanation = f"Generated Cypher query: {cypher_query}"
            except Exception as e:
                graph_explanation = f"Cypher execution failed: {e}"

        if not graph_results:
            keywords = re.findall(r'"([^"]+)"|\b(?:about|on|of|for)\s+([A-Za-z][A-Za-z\s]{2,30})', query)
            for match in keywords:
                keyword = match[0] or match[1]
                if keyword:
                    try:
                        graph_results = self.graph_service.get_papers_by_keyword(keyword.strip())
                        break
                    except Exception:
                        pass

        return graph_results, graph_explanation

    def _build_context_with_limit(
        self,
        vector_results: List[SearchResult],
        graph_results: List[Dict[str, Any]],
        max_tokens: int
    ) -> Tuple[str, List[SearchResult], List[Dict[str, Any]]]:
        limits = self.limits
        
        vector_results = ContextCompressor.deduplicate_results(vector_results)
        vector_results = ContextCompressor.compress_chunks(
            vector_results,
            max_results=limits.MAX_VECTOR_RESULTS,
            max_chunk_size=limits.MAX_CHUNK_SIZE
        )
        
        graph_results = graph_results[:limits.MAX_GRAPH_RESULTS]

        context_parts = []
        used_results = []
        used_graph_results = []

        current_tokens = 0

        if vector_results:
            context_parts.append("### Retrieved Document Sections:")
            for i, result in enumerate(vector_results, 1):
                metadata = result.chunk.metadata
                title = metadata.get("title", "Unknown")
                authors = ", ".join(metadata.get("authors", [])) or "Unknown"
                
                chunk_context = f"\n[{i}] Source: {title}\n"
                chunk_context += f"    Authors: {authors}\n"
                if metadata.get("year"):
                    chunk_context += f"    Year: {metadata['year']}\n"
                chunk_context += f"\n{result.chunk.content}"
                
                chunk_tokens = TokenCounter.estimate(chunk_context)
                
                if current_tokens + chunk_tokens > max_tokens:
                    break
                
                context_parts.append(chunk_context)
                current_tokens += chunk_tokens
                used_results.append(result)

        if graph_results and current_tokens < max_tokens * 0.8:
            context_parts.append("\n### Knowledge Graph Results:")
            for i, result in enumerate(graph_results, 1):
                graph_text = f"[{i}] {json.dumps(result, ensure_ascii=False)}"
                graph_tokens = TokenCounter.estimate(graph_text)
                
                if current_tokens + graph_tokens > max_tokens:
                    break
                
                context_parts.append(graph_text)
                current_tokens += graph_tokens
                used_graph_results.append(result)

        return "\n".join(context_parts), used_results, used_graph_results

    def answer_question(
        self,
        query: SearchQuery,
        conversation_history: Optional[List[Message]] = None
    ) -> Answer:
        limits = self.limits
        vector_results = []
        graph_results = []
        graph_hops = []
        citations = []

        try:
            vector_results = self.vector_search(query)
        except Exception as e:
            print(f"Vector search error: {e}")

        if self._should_use_graph(query.query):
            try:
                graph_results, explanation = self._graph_search(query.query)
                if explanation:
                    graph_hops.append({"explanation": explanation})
                if graph_results:
                    graph_hops.append({"results": graph_results})
            except Exception as e:
                print(f"Graph search error: {e}")

        system_prompt = """You are an academic research assistant. Answer the user's question based ONLY on the provided context.
If the answer is not in the context, say "I don't have enough information to answer that question."
Cite your sources using [1], [2], etc. corresponding to the numbered sources in the context.
Be precise and academic in your responses."""

        system_prompt_tokens = TokenCounter.estimate(system_prompt)
        question_tokens = TokenCounter.estimate(query.query)
        
        available_tokens = (
            limits.MAX_TOTAL_TOKENS
            - limits.RESERVED_OUTPUT_TOKENS
            - system_prompt_tokens
            - question_tokens
            - 200
        )

        messages = []
        if conversation_history:
            history = ContextCompressor.compress_history(
                conversation_history,
                max_messages=limits.MAX_HISTORY_MESSAGES
            )
            history_tokens = TokenCounter.estimate_messages(history)
            available_tokens -= history_tokens
            messages = history

        context, used_vector_results, used_graph_results = self._build_context_with_limit(
            vector_results,
            graph_results,
            max_tokens=max(available_tokens, 500)
        )

        user_message = f"Context:\n{context}\n\nQuestion: {query.query}"
        messages.append({"role": "user", "content": user_message})

        try:
            answer_content = self.llm_gateway.generate(
                messages=messages,
                system_prompt=system_prompt,
                max_tokens=limits.RESERVED_OUTPUT_TOKENS,
                temperature=0.3
            )
        except Exception as e:
            answer_content = f"I apologize, but I couldn't generate an answer. Error: {str(e)}"

        for i, result in enumerate(used_vector_results, 1):
            if f"[{i}]" in answer_content or str(i) in answer_content[:100]:
                citations.append({
                    "index": i,
                    "title": result.chunk.metadata.get("title", "Unknown"),
                    "authors": result.chunk.metadata.get("authors", []),
                    "snippet": result.chunk.content[:200],
                    "score": result.score
                })

        return Answer(
            content=answer_content,
            citations=citations,
            graph_hops=graph_hops,
            source_documents=used_vector_results
        )

    def get_graph_data(
        self,
        entity_name: Optional[str] = None,
        limit: int = 100
    ) -> KnowledgeGraphData:
        try:
            if entity_name:
                return self.graph_service.get_graph_around_entity(entity_name, limit=limit)
            return self.graph_service.get_full_graph(limit=limit)
        except Exception as e:
            print(f"Graph retrieval error: {e}")
            return KnowledgeGraphData(nodes=[], edges=[])

    def search_papers(
        self,
        query: SearchQuery
    ) -> List[SearchResult]:
        return self.vector_search(query)

    def execute_cypher(self, cypher_query: str) -> List[Dict[str, Any]]:
        try:
            return self.graph_service.run_cypher_query(cypher_query)
        except Exception as e:
            return [{"error": str(e)}]
