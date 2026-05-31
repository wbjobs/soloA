from typing import List, Dict, Any, Optional
import numpy as np

from shared.config import settings
from shared.utils import generate_id, chunk_text, ContentCleaner
from shared.models import Document, DocumentChunk

try:
    from pymilvus import (
        connections,
        utility,
        FieldSchema,
        CollectionSchema,
        DataType,
        Collection,
    )
    HAS_MILVUS = True
except ImportError:
    HAS_MILVUS = False


class EmbeddingService:
    def __init__(self):
        self.dimension = settings.EMBEDDING_DIMENSION
        self.collection_name = settings.MILVUS_COLLECTION
        self.collection = None
        self._connected = False

    def _connect(self):
        if not HAS_MILVUS:
            raise ImportError("pymilvus not installed")
        if not self._connected:
            connections.connect(
                alias="default",
                host=settings.MILVUS_HOST,
                port=settings.MILVUS_PORT
            )
            self._connected = True
            self._ensure_collection()

    def _ensure_collection(self):
        if utility.has_collection(self.collection_name):
            self.collection = Collection(self.collection_name)
        else:
            fields = [
                FieldSchema(name="id", dtype=DataType.VARCHAR, max_length=64, is_primary=True),
                FieldSchema(name="document_id", dtype=DataType.VARCHAR, max_length=64),
                FieldSchema(name="chunk_index", dtype=DataType.INT64),
                FieldSchema(name="content", dtype=DataType.VARCHAR, max_length=65535),
                FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=self.dimension),
                FieldSchema(name="metadata", dtype=DataType.JSON),
            ]
            schema = CollectionSchema(fields, "Academic paper chunks")
            self.collection = Collection(self.collection_name, schema)
            
            index_params = {
                "metric_type": "COSINE",
                "index_type": "IVF_FLAT",
                "params": {"nlist": 1024}
            }
            self.collection.create_index(
                field_name="embedding",
                index_params=index_params
            )
            self.collection.load()

    def _embed_text(self, text: str) -> List[float]:
        if settings.EMBEDDING_PROVIDER == "openai" and settings.OPENAI_API_KEY:
            try:
                from openai import OpenAI
                client = OpenAI(api_key=settings.OPENAI_API_KEY)
                response = client.embeddings.create(
                    input=[text],
                    model=settings.EMBEDDING_MODEL
                )
                return response.data[0].embedding
            except Exception as e:
                pass
        
        try:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer('all-MiniLM-L6-v2')
            embedding = model.encode(text).tolist()
            
            if len(embedding) != self.dimension:
                if len(embedding) > self.dimension:
                    embedding = embedding[:self.dimension]
                else:
                    embedding = embedding + [0.0] * (self.dimension - len(embedding))
            return embedding
        except Exception as e:
            return [0.0] * self.dimension

    def _embed_batch(self, texts: List[str]) -> List[List[float]]:
        embeddings = []
        for text in texts:
            embeddings.append(self._embed_text(text))
        return embeddings

    def chunk_document(self, document: Document) -> List[DocumentChunk]:
        cleaned_content = ContentCleaner.clean_for_display(document.content)
        
        text_chunks = chunk_text(
            cleaned_content,
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP
        )

        chunks = []
        for i, chunk_content in enumerate(text_chunks):
            chunk = DocumentChunk(
                id=generate_id(),
                document_id=document.id or "",
                content=chunk_content,
                chunk_index=i,
                metadata={
                    "title": document.title,
                    "authors": document.authors,
                    "keywords": document.keywords,
                    "year": document.year,
                    "conference": document.conference,
                    "citations": document.citations
                }
            )
            chunks.append(chunk)

        return chunks

    def index_document(self, document: Document) -> List[DocumentChunk]:
        self._connect()
        
        chunks = self.chunk_document(document)
        
        if not chunks:
            return []

        embedding_texts = [ContentCleaner.create_embedding_text(c.content) for c in chunks]
        embeddings = self._embed_batch(embedding_texts)

        data = [
            [c.id for c in chunks],
            [c.document_id for c in chunks],
            [c.chunk_index for c in chunks],
            [c.content for c in chunks],
            embeddings,
            [c.metadata for c in chunks],
        ]

        self.collection.insert(data)
        self.collection.flush()

        for chunk, embedding in zip(chunks, embeddings):
            chunk.embedding = embedding

        return chunks

    def search(
        self,
        query: str,
        top_k: int = 5,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        self._connect()
        
        cleaned_query = ContentCleaner.create_embedding_text(query)
        query_embedding = self._embed_text(cleaned_query)

        search_params = {
            "metric_type": "COSINE",
            "params": {"nprobe": 10}
        }

        results = self.collection.search(
            data=[query_embedding],
            anns_field="embedding",
            param=search_params,
            limit=top_k,
            output_fields=["id", "document_id", "chunk_index", "content", "metadata"]
        )

        formatted_results = []
        for hits in results:
            for hit in hits:
                formatted_results.append({
                    "id": hit.entity.get("id"),
                    "document_id": hit.entity.get("document_id"),
                    "chunk_index": hit.entity.get("chunk_index"),
                    "content": hit.entity.get("content"),
                    "metadata": hit.entity.get("metadata"),
                    "score": float(hit.distance)
                })

        return formatted_results

    def delete_by_document_id(self, document_id: str):
        self._connect()
        
        expr = f'document_id == "{document_id}"'
        self.collection.delete(expr)
        self.collection.flush()
