import os
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor

from shared.config import settings
from shared.utils import ensure_directory, sanitize_filename, generate_id

try:
    from pypdf import PdfReader
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False


@dataclass
class ParsedDocument:
    title: str
    authors: List[str]
    abstract: str
    content: str
    keywords: List[str]
    year: Optional[int]
    conference: Optional[str]
    citations: int


class DocumentParserService:
    def __init__(self):
        self.upload_dir = ensure_directory(settings.UPLOAD_DIR)

    def parse_pdf(self, file_path: str) -> ParsedDocument:
        if not HAS_PDF:
            raise ImportError("pypdf not installed")

        reader = PdfReader(file_path)
        full_text = []

        for page in reader.pages:
            full_text.append(page.extract_text() or "")

        content = "\n\n".join(full_text)
        
        metadata = self._extract_metadata(content, reader.metadata)
        
        return ParsedDocument(
            title=metadata.get("title", "Untitled Document"),
            authors=metadata.get("authors", []),
            abstract=metadata.get("abstract", ""),
            content=content,
            keywords=metadata.get("keywords", []),
            year=metadata.get("year"),
            conference=metadata.get("conference"),
            citations=0
        )

    def parse_pdf_with_plumber(self, file_path: str) -> ParsedDocument:
        if not HAS_PDFPLUMBER:
            return self.parse_pdf(file_path)

        full_text = []
        tables = []

        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    full_text.append(text)
                page_tables = page.extract_tables()
                if page_tables:
                    tables.extend(page_tables)

        content = "\n\n".join(full_text)
        
        if tables:
            tables_text = "\n\n--- Tables ---\n\n"
            for i, table in enumerate(tables):
                tables_text += f"Table {i+1}:\n"
                for row in table:
                    tables_text += " | ".join(str(cell) for cell in row if cell) + "\n"
            content += tables_text

        metadata = self._extract_metadata(content, None)

        return ParsedDocument(
            title=metadata.get("title", "Untitled Document"),
            authors=metadata.get("authors", []),
            abstract=metadata.get("abstract", ""),
            content=content,
            keywords=metadata.get("keywords", []),
            year=metadata.get("year"),
            conference=metadata.get("conference"),
            citations=0
        )

    def _extract_metadata(self, content: str, pdf_metadata: Optional[Any]) -> Dict[str, Any]:
        metadata = {}

        if pdf_metadata and pdf_metadata.title:
            metadata["title"] = pdf_metadata.title
        else:
            title_match = re.search(r'^(.{1,200})\n', content)
            if title_match:
                metadata["title"] = title_match.group(1).strip()[:100]
            else:
                metadata["title"] = "Untitled Document"

        abstract_match = re.search(
            r'(?:Abstract|ABSTRACT)[\s:]*([\s\S]{100,1000}?)(?=\n(?:1\.\s|Introduction|1\s+Introduction|Keywords|Keywords:))',
            content,
            re.IGNORECASE
        )
        if abstract_match:
            metadata["abstract"] = abstract_match.group(1).strip()

        authors_pattern = r'(?:by|By|Written by|Authors?:?)\s+(.{1,300}?)(?=\n\n|\n\d|Abstract|1\.\s)'
        authors_match = re.search(authors_pattern, content, re.DOTALL)
        if authors_match:
            authors_text = authors_match.group(1)
            authors = re.split(r'[,;]|\band\b|,?\s+and\s+', authors_text)
            authors = [a.strip() for a in authors if a.strip() and len(a.strip()) > 1]
            authors = authors[:10]
            if authors:
                metadata["authors"] = authors

        keywords_match = re.search(
            r'(?:Keywords|KEYWORDS|Index Terms)[\s:]*([\s\S]{1,200}?)(?=\n(?:1\.|Abstract|Introduction|$))',
            content,
            re.IGNORECASE
        )
        if keywords_match:
            kw_text = keywords_match.group(1)
            keywords = re.split(r'[,;]', kw_text)
            keywords = [k.strip() for k in keywords if k.strip()][:20]
            metadata["keywords"] = keywords

        year_match = re.search(r'(?:\b(19|20)\d{2}\b)', content)
        if year_match:
            metadata["year"] = int(year_match.group(0))

        conference_patterns = [
            r'(?:Proceedings of|In\s+)(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:Conference|Symposium|Workshop)',
            r'([A-Z]{2,6})\s*\d{4}',
        ]
        for pattern in conference_patterns:
            conf_match = re.search(pattern, content)
            if conf_match:
                metadata["conference"] = conf_match.group(1).strip()[:50]
                break

        return metadata

    def parse_file(self, file_content: bytes, filename: str) -> ParsedDocument:
        safe_filename = sanitize_filename(filename)
        file_path = self.upload_dir / safe_filename
        
        with open(file_path, "wb") as f:
            f.write(file_content)

        ext = Path(filename).suffix.lower()
        
        if ext == ".pdf":
            try:
                return self.parse_pdf_with_plumber(str(file_path))
            except Exception:
                return self.parse_pdf(str(file_path))
        else:
            raise ValueError(f"Unsupported file type: {ext}")

    def clean_up(self, filename: str):
        safe_filename = sanitize_filename(filename)
        file_path = self.upload_dir / safe_filename
        if file_path.exists():
            file_path.unlink()
