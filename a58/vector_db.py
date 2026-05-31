import os
import uuid
from typing import List, Dict, Any, Optional
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions
from config import get_config


class VectorDatabase:
    def __init__(self):
        self.db_path = get_config("db_path", "chroma_db")
        self.collection_name = get_config("collection_name", "code_base")
        self.embedding_model_name = get_config("embedding_model", "all-MiniLM-L6-v2")

        os.makedirs(self.db_path, exist_ok=True)

        self.client = chromadb.PersistentClient(
            path=self.db_path,
            settings=Settings(anonymized_telemetry=False)
        )

        self.embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name=self.embedding_model_name
        )

        self.collection = self._get_or_create_collection()

    def _get_or_create_collection(self):
        return self.client.get_or_create_collection(
            name=self.collection_name,
            embedding_function=self.embedding_function
        )

    def add_documents(self, documents: List[Dict[str, Any]]):
        if not documents:
            return 0

        ids = []
        contents = []
        metadatas = []

        for doc in documents:
            doc_id = doc.get("id") or str(uuid.uuid4())
            ids.append(doc_id)
            contents.append(doc["content"])
            metadatas.append(doc.get("metadata", {}))

        self.collection.add(
            ids=ids,
            documents=contents,
            metadatas=metadatas
        )

        return len(documents)

    def delete_collection(self):
        try:
            self.client.delete_collection(self.collection_name)
            self.collection = self._get_or_create_collection()
        except Exception as e:
            print(f"Error deleting collection: {e}")

    def query(
        self,
        query_text: str,
        top_k: int = 5,
        where: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        results = self.collection.query(
            query_texts=[query_text],
            n_results=top_k,
            where=where
        )

        documents = results.get("documents", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        ids = results.get("ids", [[]])[0]

        formatted_results = []
        for i in range(len(documents)):
            formatted_results.append({
                "id": ids[i] if i < len(ids) else "",
                "content": documents[i],
                "metadata": metadatas[i] if i < len(metadatas) else {},
                "distance": distances[i] if i < len(distances) else 0.0,
                "similarity": 1.0 - (distances[i] if i < len(distances) else 0.0)
            })

        return formatted_results

    def get_collection_stats(self) -> Dict[str, Any]:
        count = self.collection.count()
        return {
            "collection_name": self.collection_name,
            "document_count": count,
            "db_path": self.db_path,
        }

    def list_files(self) -> List[str]:
        all_docs = self.collection.get()
        metadatas = all_docs.get("metadatas", [])
        files = set()
        for meta in metadatas:
            if meta and "file_path" in meta:
                files.add(meta["file_path"])
        return sorted(list(files))
