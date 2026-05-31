import re
from typing import List, Dict, Any, Set
from vector_db import VectorDatabase
from config import get_config


class Retriever:
    def __init__(self):
        self.vector_db = VectorDatabase()
        self.default_top_k = get_config("top_k", 5)
        self.retrieval_k = get_config("retrieval_k", 10)
        self.min_similarity_threshold = get_config("min_similarity_threshold", 0.3)

    def _extract_keywords(self, query: str) -> Set[str]:
        keywords = set()

        words = re.findall(r'\b\w+\b', query.lower())
        keywords.update(words)

        quoted = re.findall(r'"([^"]+)"', query)
        for q in quoted:
            keywords.update(re.findall(r'\b\w+\b', q.lower()))

        stop_words = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
            'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
            'from', 'as', 'into', 'through', 'during', 'before', 'after',
            'above', 'below', 'between', 'under', 'again', 'further', 'then',
            'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
            'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
            'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't',
            'just', 'don', 'now', '什么', '如何', '怎么', '哪里', '为什么',
            '这个', '那个', '这些', '那些', '是', '的', '了', '和', '或',
            '与', '及', '以及', '包括', '包含', '在', '对于', '关于', '到'
        }

        keywords = {k for k in keywords if len(k) > 1 and k not in stop_words}
        return keywords

    def _keyword_match_score(self, content: str, keywords: Set[str]) -> float:
        if not keywords:
            return 0.0

        content_lower = content.lower()
        matches = 0

        for keyword in keywords:
            if re.search(rf'\b{re.escape(keyword)}\b', content_lower):
                matches += 1
            elif keyword in content_lower:
                matches += 0.5

        return matches / max(len(keywords), 1)

    def _rerank_results(
        self,
        results: List[Dict[str, Any]],
        query: str
    ) -> List[Dict[str, Any]]:
        if not results:
            return []

        keywords = self._extract_keywords(query)

        reranked = []
        for result in results:
            keyword_score = self._keyword_match_score(result["content"], keywords)
            vector_similarity = result["similarity"]

            combined_score = (
                0.6 * vector_similarity +
                0.4 * keyword_score
            )

            reranked.append({
                **result,
                "keyword_score": keyword_score,
                "combined_score": combined_score,
            })

        reranked.sort(key=lambda x: x["combined_score"], reverse=True)

        return reranked

    def _filter_irrelevant(
        self,
        results: List[Dict[str, Any]],
        min_similarity: float
    ) -> List[Dict[str, Any]]:
        if not results:
            return []

        actual_threshold = max(min_similarity, self.min_similarity_threshold)

        filtered = [
            r for r in results
            if r.get("similarity", 0) >= actual_threshold
            or r.get("combined_score", 0) >= actual_threshold * 0.8
        ]

        if len(filtered) == 0 and len(results) > 0:
            best_result = max(results, key=lambda x: x.get("similarity", 0))
            if best_result.get("similarity", 0) >= 0.1:
                filtered = [best_result]

        return filtered

    def search(
        self,
        query: str,
        top_k: int = None,
        min_similarity: float = None,
        file_filter: List[str] = None
    ) -> List[Dict[str, Any]]:
        actual_top_k = top_k or self.default_top_k
        actual_min_similarity = (
            min_similarity if min_similarity is not None
            else self.min_similarity_threshold
        )

        retrieval_count = max(actual_top_k * 2, self.retrieval_k)

        where = None
        if file_filter:
            where = {"file_path": {"$in": file_filter}}

        results = self.vector_db.query(
            query_text=query,
            top_k=retrieval_count,
            where=where
        )

        reranked = self._rerank_results(results, query)

        filtered = self._filter_irrelevant(reranked, actual_min_similarity)

        final_results = filtered[:actual_top_k]

        return final_results

    def format_context(self, results: List[Dict[str, Any]]) -> str:
        if not results:
            return ""

        context_parts = []
        for i, result in enumerate(results):
            metadata = result["metadata"]
            file_path = metadata.get("file_path", "unknown")
            language = metadata.get("language", "text")
            similarity = result.get("combined_score", result.get("similarity", 0))

            header = f"--- 相关代码片段 {i+1} (相关性: {similarity:.3f}, 文件: {file_path}) ---"
            code_block = f"```{language}\n{result['content']}\n```"
            context_parts.append(f"{header}\n{code_block}")

        return "\n\n".join(context_parts)

    def get_index_stats(self) -> Dict[str, Any]:
        return self.vector_db.get_collection_stats()

    def get_indexed_files(self) -> List[str]:
        return self.vector_db.list_files()

    def has_index(self) -> bool:
        stats = self.get_index_stats()
        return stats.get("document_count", 0) > 0
