import os
import re
from typing import List, Dict, Any, Optional, Tuple
from config import SUPPORTED_EXTENSIONS, get_config
from langchain.text_splitter import RecursiveCharacterTextSplitter


LANGUAGE_PATTERNS = {
    "python": {
        "class_pattern": r"^class\s+\w+",
        "function_pattern": r"^(async\s+)?def\s+\w+",
        "import_pattern": r"^(from|import)\s+",
        "comment_pattern": r"#.*$",
        "docstring_pattern": r'"""[\s\S]*?"""',
    },
    "javascript": {
        "class_pattern": r"^(export\s+)?(default\s+)?class\s+\w+",
        "function_pattern": r"^(export\s+)?(async\s+)?function\s+\w+|^const\s+\w+\s*=\s*(async\s+)?\(",
        "import_pattern": r"^(import|export)\s+",
        "comment_pattern": r"//.*$",
    },
    "typescript": {
        "class_pattern": r"^(export\s+)?(default\s+)?class\s+\w+",
        "function_pattern": r"^(export\s+)?(async\s+)?function\s+\w+|^const\s+\w+\s*=\s*(async\s+)?\(",
        "import_pattern": r"^(import|export)\s+",
        "comment_pattern": r"//.*$",
    },
    "java": {
        "class_pattern": r"^(public|private|protected)?\s*(abstract|final)?\s*class\s+\w+",
        "function_pattern": r"^(public|private|protected)?\s*(static|final)?\s*\w+[\s\[\]]+\w+\s*\(",
        "import_pattern": r"^import\s+",
        "comment_pattern": r"//.*$",
    },
    "cpp": {
        "class_pattern": r"^(class|struct)\s+\w+",
        "function_pattern": r"^\w+[\s\*&]+\w+\s*\([^;]*$",
        "include_pattern": r"^#include\s+",
        "comment_pattern": r"//.*$",
    },
}


class CodeProcessor:
    def __init__(self):
        self.chunk_size = get_config("chunk_size", 1000)
        self.chunk_overlap = get_config("chunk_overlap", 200)
        self.max_chunk_size = get_config("max_chunk_size", 1500)
        self.supported_extensions = SUPPORTED_EXTENSIONS

    def _is_supported_file(self, file_path: str) -> bool:
        _, ext = os.path.splitext(file_path)
        return ext.lower() in self.supported_extensions

    def _get_language(self, file_path: str) -> str:
        ext_map = {
            ".py": "python",
            ".js": "javascript",
            ".jsx": "javascript",
            ".ts": "typescript",
            ".tsx": "typescript",
            ".java": "java",
            ".c": "cpp",
            ".cpp": "cpp",
            ".h": "cpp",
            ".hpp": "cpp",
            ".go": "go",
            ".rs": "rust",
            ".swift": "swift",
            ".kt": "kotlin",
            ".cs": "csharp",
            ".php": "php",
            ".rb": "ruby",
            ".sh": "bash",
            ".bash": "bash",
            ".sql": "sql",
            ".html": "html",
            ".css": "css",
            ".scss": "css",
            ".xml": "xml",
            ".json": "json",
            ".yaml": "yaml",
            ".yml": "yaml",
            ".md": "markdown",
            ".txt": "text",
            ".rst": "rst",
        }
        _, ext = os.path.splitext(file_path)
        return ext_map.get(ext.lower(), "text")

    def _count_lines(self, content: str) -> int:
        return content.count("\n") + 1 if content else 0

    def _estimate_tokens(self, content: str) -> int:
        return len(content) // 4

    def _find_semantic_boundaries(self, content: str, language: str) -> List[int]:
        lines = content.split("\n")
        boundaries = [0]

        patterns = LANGUAGE_PATTERNS.get(language, {})

        for i, line in enumerate(lines):
            is_boundary = False

            if "class_pattern" in patterns:
                if re.match(patterns["class_pattern"], line.strip()):
                    is_boundary = True

            if "function_pattern" in patterns and not is_boundary:
                if re.match(patterns["function_pattern"], line.strip()):
                    is_boundary = True

            if line.strip().startswith("def ") or line.strip().startswith("class "):
                is_boundary = True

            if line.strip().startswith("function "):
                is_boundary = True

            if line.strip().startswith("//") and len(line.strip()) > 10:
                if i + 1 < len(lines) and lines[i + 1].strip():
                    is_boundary = True

            if i > 0 and lines[i].strip().startswith("/*"):
                is_boundary = True

            if i > 0 and not lines[i-1].strip() and lines[i].strip():
                if i > 1 and not lines[i-2].strip():
                    is_boundary = True

            if is_boundary and i > 0:
                boundaries.append(i)

        boundaries.append(len(lines))
        return sorted(list(set(boundaries)))

    def _smart_split_large_chunk(
        self,
        chunk: str,
        target_size: int,
        language: str
    ) -> List[str]:
        if len(chunk) <= target_size:
            return [chunk]

        result = []
        lines = chunk.split("\n")

        patterns = LANGUAGE_PATTERNS.get(language, {})

        preferred_split_points = []
        for i, line in enumerate(lines):
            is_good_split = False

            if "function_pattern" in patterns:
                if re.match(patterns["function_pattern"], line.strip()):
                    is_good_split = True

            if "class_pattern" in patterns and not is_good_split:
                if re.match(patterns["class_pattern"], line.strip()):
                    is_good_split = True

            if not line.strip():
                if i > 0 and lines[i-1].strip().endswith(":"):
                    pass
                else:
                    is_good_split = True

            if line.strip().startswith("#") and len(line.strip()) > 5:
                is_good_split = True

            if line.strip().startswith("//") and len(line.strip()) > 5:
                is_good_split = True

            if is_good_split:
                preferred_split_points.append(i)

        current_start = 0
        current_size = 0

        for i, line in enumerate(lines):
            current_size += len(line) + 1

            if current_size >= target_size:
                split_idx = None
                for sp in reversed(preferred_split_points):
                    if current_start < sp <= i:
                        split_idx = sp
                        break

                if split_idx is None:
                    split_idx = i

                if split_idx > current_start:
                    result_chunk = "\n".join(lines[current_start:split_idx])
                    result.append(result_chunk)

                    overlap_lines = min(
                        self.chunk_overlap // 50,
                        split_idx - current_start - 1
                    )
                    current_start = max(current_start, split_idx - overlap_lines)
                    current_size = sum(
                        len(l) + 1 for l in lines[current_start:split_idx]
                    )

        if current_start < len(lines):
            remaining = "\n".join(lines[current_start:])
            if remaining.strip():
                result.append(remaining)

        return result

    def split_code(self, content: str, language: str = "text") -> List[str]:
        if not content or not content.strip():
            return []

        line_count = self._count_lines(content)

        if line_count > 1000 or len(content) > self.max_chunk_size:
            boundaries = self._find_semantic_boundaries(content, language)
            lines = content.split("\n")

            preliminary_chunks = []
            for i in range(len(boundaries) - 1):
                start = boundaries[i]
                end = boundaries[i + 1]
                if end > start:
                    chunk_lines = lines[start:end]
                    preliminary_chunks.append("\n".join(chunk_lines))

            final_chunks = []
            for chunk in preliminary_chunks:
                if len(chunk) > self.max_chunk_size:
                    split_chunks = self._smart_split_large_chunk(
                        chunk,
                        self.chunk_size,
                        language
                    )
                    final_chunks.extend(split_chunks)
                elif len(chunk) > 0:
                    final_chunks.append(chunk)

            merged_chunks = []
            current_chunk = ""
            current_size = 0

            for chunk in final_chunks:
                chunk_len = len(chunk)

                if current_size + chunk_len <= self.chunk_size:
                    if current_chunk:
                        current_chunk += "\n\n" + chunk
                    else:
                        current_chunk = chunk
                    current_size = len(current_chunk)
                else:
                    if current_chunk:
                        merged_chunks.append(current_chunk)
                    current_chunk = chunk
                    current_size = chunk_len

            if current_chunk:
                merged_chunks.append(current_chunk)

            final_merged = []
            for c in merged_chunks:
                if len(c) > self.max_chunk_size:
                    small_chunks = self._smart_split_large_chunk(
                        c, self.chunk_size, language
                    )
                    final_merged.extend(small_chunks)
                else:
                    final_merged.append(c)

            return [c for c in final_merged if c.strip()]

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            length_function=len,
            separators=[
                "\nclass ",
                "\nclass\t",
                "\ndef ",
                "\nasync def ",
                "\nfunction ",
                "\npublic ",
                "\nprivate ",
                "\nprotected ",
                "\nstatic ",
                "\n\n",
                "\n",
                " ",
                "",
            ],
        )
        chunks = text_splitter.split_text(content)

        final_chunks = []
        for chunk in chunks:
            if len(chunk) > self.max_chunk_size:
                small_chunks = self._smart_split_large_chunk(
                    chunk, self.chunk_size, language
                )
                final_chunks.extend(small_chunks)
            else:
                final_chunks.append(chunk)

        return [c for c in final_chunks if c.strip()]

    def scan_directory(self, directory_path: str) -> List[str]:
        if not os.path.exists(directory_path):
            raise ValueError(f"Directory does not exist: {directory_path}")

        file_paths = []
        for root, dirs, files in os.walk(directory_path):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in [
                "__pycache__", "node_modules", "dist", "build", "target",
                "venv", ".git", ".svn", ".idea", ".vscode"
            ]]
            for file_name in files:
                file_path = os.path.join(root, file_name)
                if self._is_supported_file(file_path):
                    file_paths.append(file_path)

        return file_paths

    def read_file(self, file_path: str) -> str:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, "r", encoding="latin-1") as f:
                    return f.read()
            except Exception as e:
                raise ValueError(f"Unable to read file {file_path}: {e}")

    def process_file(self, file_path: str, base_directory: str) -> List[Dict[str, Any]]:
        content = self.read_file(file_path)
        language = self._get_language(file_path)

        line_count = self._count_lines(content)

        if line_count > 5000:
            print(f"Warning: Large file detected ({line_count} lines): {file_path}")

        chunks = self.split_code(content, language)

        if not chunks:
            return []

        relative_path = os.path.relpath(file_path, base_directory)

        results = []
        for i, chunk in enumerate(chunks):
            chunk_line_count = self._count_lines(chunk)
            results.append({
                "id": f"{relative_path}::chunk_{i}",
                "content": chunk,
                "metadata": {
                    "file_path": relative_path,
                    "absolute_path": file_path,
                    "language": language,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "chunk_size_chars": len(chunk),
                    "chunk_size_lines": chunk_line_count,
                    "file_line_count": line_count,
                },
            })

        return results

    def process_directory(self, directory_path: str) -> List[Dict[str, Any]]:
        file_paths = self.scan_directory(directory_path)
        all_chunks = []

        total_files = len(file_paths)
        print(f"Found {total_files} files to process")

        for idx, file_path in enumerate(file_paths, 1):
            try:
                if idx % 10 == 0:
                    print(f"Processing file {idx}/{total_files}: {file_path}")

                chunks = self.process_file(file_path, directory_path)
                all_chunks.extend(chunks)
            except Exception as e:
                print(f"Warning: Error processing file {file_path}: {e}")
                continue

        total_chunks = len(all_chunks)
        total_files_processed = len(set(
            c["metadata"]["file_path"] for c in all_chunks
        ))
        print(f"Processed {total_files_processed} files into {total_chunks} chunks")

        return all_chunks
