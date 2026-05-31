import os
from typing import List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SUPPORTED_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".c", ".cpp", ".h", ".hpp",
    ".go", ".rs", ".swift", ".kt", ".cs", ".php", ".rb", ".sh", ".bash",
    ".sql", ".html", ".css", ".scss", ".xml", ".json", ".yaml", ".yml",
    ".md", ".txt", ".rst"
}

CONFIG = {
    "db_path": os.path.join(BASE_DIR, "chroma_db"),
    "upload_dir": os.path.join(BASE_DIR, "uploads"),
    "collection_name": "code_base",
    "embedding_model": "all-MiniLM-L6-v2",
    "chunk_size": 1000,
    "chunk_overlap": 200,
    "max_chunk_size": 1500,
    "min_similarity_threshold": 0.3,
    "top_k": 5,
    "retrieval_k": 10,
    "llm_model_path": os.path.join(BASE_DIR, "models", "llama-2-7b-chat.gguf"),
    "llm_n_ctx": 4096,
    "llm_n_threads": 4,
    "llm_temperature": 0.1,
    "llm_max_tokens": 1024,
    "context_buffer_ratio": 0.5,
    "history_dir": os.path.join(BASE_DIR, "history"),
    "max_history_turns": 10,
    "history_context_ratio": 0.2,
}


def get_supported_extensions() -> List[str]:
    return list(SUPPORTED_EXTENSIONS)


def get_config(key: str, default=None):
    return CONFIG.get(key, default)
