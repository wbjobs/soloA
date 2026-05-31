import asyncio
import json
import time
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
from config import settings

try:
    from elasticsearch import AsyncElasticsearch
    from elasticsearch.exceptions import ConnectionError, NotFoundError
    ES_AVAILABLE = True
except ImportError:
    ES_AVAILABLE = False

@dataclass
class DocumentIndex:
    document_id: str
    title: str
    owner_id: str
    content: str
    version: int
    content_type: str = "text/plain"
    metadata: Dict[str, Any] = None
    indexed_at: float = 0.0

class SearchService:
    INDEX_NAME = "documents"
    
    def __init__(self):
        self._es_client: Optional[AsyncElasticsearch] = None
        self._initialized = False
        self._fallback_index: Dict[str, DocumentIndex] = {}
    
    async def init(self):
        if self._initialized:
            return
        
        if ES_AVAILABLE:
            try:
                elasticsearch_url = getattr(settings, 'elasticsearch_url', 'http://localhost:9200')
                self._es_client = AsyncElasticsearch(elasticsearch_url)
                
                if not await self._es_client.ping():
                    print("Elasticsearch connection failed")
                    self._es_client = None
                else:
                    if not await self._es_client.indices.exists(index=self.INDEX_NAME):
                        await self._es_client.indices.create(
                            index=self.INDEX_NAME,
                            body=self._get_index_mapping()
                        )
                    print("Search Service connected to Elasticsearch")
                    self._initialized = True
            except Exception as e:
                print(f"Failed to connect to Elasticsearch: {e}")
                self._es_client = None
        
        if not self._initialized:
            print("Search Service running in in-memory mode")
    
    async def close(self):
        if self._es_client:
            await self._es_client.close()
    
    def _get_index_mapping(self) -> Dict:
        return {
            "mappings": {
                "properties": {
                    "document_id": {"type": "keyword"},
                    "title": {
                        "type": "text",
                        "analyzer": "standard",
                        "fields": {
                            "keyword": {"type": "keyword"}
                        }
                    },
                    "content": {
                        "type": "text",
                        "analyzer": "standard"
                    },
                    "owner_id": {"type": "keyword"},
                    "version": {"type": "integer"},
                    "content_type": {"type": "keyword"},
                    "metadata": {"type": "object", "dynamic": True},
                    "indexed_at": {"type": "date"}
                }
            }
        }
    
    async def index_document(
        self,
        document_id: str,
        title: str,
        owner_id: str,
        content: str,
        version: int,
        content_type: str = "text/plain",
        metadata: Dict = None
    ) -> bool:
        doc_index = DocumentIndex(
            document_id=document_id,
            title=title,
            owner_id=owner_id,
            content=content,
            version=version,
            content_type=content_type,
            metadata=metadata or {},
            indexed_at=time.time()
        )
        
        if self._es_client and self._initialized:
            try:
                await self._es_client.index(
                    index=self.INDEX_NAME,
                    id=document_id,
                    document={
                        "document_id": document_id,
                        "title": title,
                        "owner_id": owner_id,
                        "content": content,
                        "version": version,
                        "content_type": content_type,
                        "metadata": metadata or {},
                        "indexed_at": datetime.utcnow().isoformat()
                    }
                )
                return True
            except Exception as e:
                print(f"Failed to index document {document_id}: {e}")
        
        self._fallback_index[document_id] = doc_index
        return True
    
    async def get_document(self, document_id: str) -> Optional[Dict]:
        if self._es_client and self._initialized:
            try:
                result = await self._es_client.get(
                    index=self.INDEX_NAME,
                    id=document_id
                )
                return result["_source"]
            except NotFoundError:
                return None
            except Exception as e:
                print(f"Failed to get document {document_id}: {e}")
        
        if document_id in self._fallback_index:
            doc = self._fallback_index[document_id]
            return {
                "document_id": doc.document_id,
                "title": doc.title,
                "owner_id": doc.owner_id,
                "content": doc.content,
                "version": doc.version,
                "content_type": doc.content_type,
                "metadata": doc.metadata
            }
        
        return None
    
    async def search(
        self,
        query: str,
        owner_id: Optional[str] = None,
        limit: int = 20,
        offset: int = 0
    ) -> Dict:
        if self._es_client and self._initialized:
            try:
                es_query = {
                    "bool": {
                        "must": [
                            {
                                "multi_match": {
                                    "query": query,
                                    "fields": ["title^3", "content"]
                                }
                            }
                        ]
                    }
                }
                
                if owner_id:
                    es_query["bool"]["filter"] = [
                        {"term": {"owner_id": owner_id}}
                    ]
                
                result = await self._es_client.search(
                    index=self.INDEX_NAME,
                    query=es_query,
                    size=limit,
                    from_=offset
                )
                
                return {
                    "total": result["hits"]["total"]["value"],
                    "hits": [
                        {
                            "document_id": hit["_source"]["document_id"],
                            "title": hit["_source"]["title"],
                            "owner_id": hit["_source"]["owner_id"],
                            "version": hit["_source"]["version"],
                            "score": hit["_score"],
                            "highlight": hit.get("highlight", {})
                        }
                        for hit in result["hits"]["hits"]
                    ],
                    "took": result["took"]
                }
            except Exception as e:
                print(f"Search failed: {e}")
        
        return await self._fallback_search(query, owner_id, limit, offset)
    
    async def _fallback_search(
        self,
        query: str,
        owner_id: Optional[str],
        limit: int,
        offset: int
    ) -> Dict:
        query_lower = query.lower()
        results = []
        
        for doc_id, doc in self._fallback_index.items():
            if owner_id and doc.owner_id != owner_id:
                continue
            
            score = 0
            if query_lower in doc.title.lower():
                score += 3
            if query_lower in doc.content.lower():
                score += 1
            
            if score > 0:
                results.append({
                    "document_id": doc.document_id,
                    "title": doc.title,
                    "owner_id": doc.owner_id,
                    "version": doc.version,
                    "score": score
                })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "total": len(results),
            "hits": results[offset:offset + limit],
            "took": 0
        }
    
    async def delete_document(self, document_id: str) -> bool:
        if self._es_client and self._initialized:
            try:
                await self._es_client.delete(
                    index=self.INDEX_NAME,
                    id=document_id
                )
                return True
            except NotFoundError:
                return True
            except Exception as e:
                print(f"Failed to delete document {document_id}: {e}")
        
        self._fallback_index.pop(document_id, None)
        return True
    
    async def bulk_index(self, documents: List[Dict]) -> int:
        if self._es_client and self._initialized:
            try:
                actions = []
                for doc in documents:
                    actions.append({"index": {"_id": doc["document_id"]}})
                    actions.append({
                        "document_id": doc["document_id"],
                        "title": doc["title"],
                        "owner_id": doc["owner_id"],
                        "content": doc["content"],
                        "version": doc["version"],
                        "content_type": doc.get("content_type", "text/plain"),
                        "metadata": doc.get("metadata", {}),
                        "indexed_at": datetime.utcnow().isoformat()
                    })
                
                if actions:
                    await self._es_client.bulk(
                        operations=actions,
                        index=self.INDEX_NAME
                    )
                
                return len(documents)
            except Exception as e:
                print(f"Bulk index failed: {e}")
        
        count = 0
        for doc in documents:
            await self.index_document(
                document_id=doc["document_id"],
                title=doc["title"],
                owner_id=doc["owner_id"],
                content=doc["content"],
                version=doc["version"],
                content_type=doc.get("content_type", "text/plain"),
                metadata=doc.get("metadata")
            )
            count += 1
        
        return count
    
    async def get_stats(self) -> Dict:
        if self._es_client and self._initialized:
            try:
                stats = await self._es_client.indices.stats(index=self.INDEX_NAME)
                return {
                    "mode": "elasticsearch",
                    "total_docs": stats["_all"]["total"]["docs"]["count"]
                }
            except Exception as e:
                print(f"Failed to get stats: {e}")
        
        return {
            "mode": "in-memory",
            "total_docs": len(self._fallback_index)
        }

search_service = SearchService()
