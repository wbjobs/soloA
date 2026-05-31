import hashlib
import uuid
from pathlib import Path
from datetime import datetime
from typing import List, Tuple, Dict, Any
import re

def generate_id() -> str:
    return str(uuid.uuid4())

def generate_file_id(file_path: str) -> str:
    with open(file_path, "rb") as f:
        file_hash = hashlib.md5(f.read()).hexdigest()
    return file_hash

class ContentCleaner:
    MATH_PATTERNS = [
        r'\$\$[\s\S]*?\$\$',
        r'\$[^$\n]+\$',
        r'\\\[[\s\S]*?\\\]',
        r'\\\([\s\S]*?\\\)',
        r'\\begin\{equation\}[\s\S]*?\\end\{equation\}',
        r'\\begin\{align\}[\s\S]*?\\end\{align\}',
        r'\\begin\{equation\*\}[\s\S]*?\\end\{equation\*\}',
        r'\\begin\{align\*\}[\s\S]*?\\end\{align\*\}',
        r'\\frac\{[^}]+\}\{[^}]+\}',
        r'\\sum_[^\s]+',
        r'\\int_[^\s]+',
        r'\\prod_[^\s]+',
        r'\[\\?[a-zA-Z]+\b',
        r'\\alpha|\\beta|\\gamma|\\delta|\\epsilon|\\zeta|\\eta|\\theta|\\iota|\\kappa|\\lambda|\\mu|\\nu|\\xi|\\pi|\\rho|\\sigma|\\tau|\\upsilon|\\phi|\\chi|\\psi|\\omega',
        r'\\Alpha|\\Beta|\\Gamma|\\Delta|\\Epsilon|\\Zeta|\\Eta|\\Theta|\\Iota|\\Kappa|\\Lambda|\\Mu|\\Nu|\\Xi|\\Pi|\\Rho|\\Sigma|\\Tau|\\Upsilon|\\Phi|\\Chi|\\Psi|\\Omega',
    ]

    CODE_PATTERNS = [
        r'```[\s\S]*?```',
        r'`[^`\n]+`',
        r'(?:^|\n)\s*(?:def|class|function|var|let|const|import|from|if|for|while|try|except|return)\s+[^\n]*(?:\n[^\n]*)*',
        r'\b(?:def|class)\s+\w+\s*\([^)]*\)\s*:?',
    ]

    NOISE_PATTERNS = [
        r'\n{3,}',
        r'[ \t]{2,}',
        r'---+',
        r'==+',
        r'\*\*\*+',
    ]

    @classmethod
    def _extract_math_blocks(cls, text: str) -> Tuple[str, List[Tuple[int, int, str]]]:
        math_blocks = []
        offset = 0
        result = text
        
        for pattern in cls.MATH_PATTERNS:
            matches = list(re.finditer(pattern, result, flags=re.IGNORECASE | re.MULTILINE))
            for match in reversed(matches):
                start, end = match.span()
                math_content = match.group(0)
                if len(math_content) > 10:
                    placeholder = f" [MATH{len(math_blocks)}] "
                    result = result[:start] + placeholder + result[end:]
                    math_blocks.append((start, placeholder, math_content))
        
        return result, math_blocks

    @classmethod
    def _extract_code_blocks(cls, text: str) -> Tuple[str, List[Tuple[int, int, str]]]:
        code_blocks = []
        offset = 0
        result = text
        
        for pattern in cls.CODE_PATTERNS:
            matches = list(re.finditer(pattern, result, flags=re.MULTILINE))
            for match in reversed(matches):
                start, end = match.span()
                code_content = match.group(0)
                if len(code_content) > 20:
                    placeholder = f" [CODE{len(code_blocks)}] "
                    result = result[:start] + placeholder + result[end:]
                    code_blocks.append((start, placeholder, code_content))
        
        return result, code_blocks

    @classmethod
    def _classify_chunk(cls, text: str) -> Dict[str, Any]:
        math_count = sum(1 for p in cls.MATH_PATTERNS if re.search(p, text, flags=re.IGNORECASE))
        code_count = sum(1 for p in cls.CODE_PATTERNS if re.search(p, text, flags=re.MULTILINE))
        
        text_length = len(text)
        if text_length == 0:
            return {'type': 'normal', 'math_ratio': 0, 'code_ratio': 0}
        
        math_ratio = math_count / text_length
        code_ratio = code_count / text_length
        
        if math_ratio > 0.1 or '\\begin' in text or '$$' in text:
            return {'type': 'math', 'math_ratio': math_ratio, 'code_ratio': code_ratio}
        elif code_ratio > 0.1 or '```' in text or re.search(r'\bdef\s+\w+\s*\(', text):
            return {'type': 'code', 'math_ratio': math_ratio, 'code_ratio': code_ratio}
        
        return {'type': 'normal', 'math_ratio': math_ratio, 'code_ratio': code_ratio}

    @classmethod
    def create_embedding_text(cls, text: str) -> str:
        cleaned = text
        
        for pattern in cls.NOISE_PATTERNS:
            cleaned = re.sub(pattern, ' ', cleaned)
        
        classification = cls._classify_chunk(text)
        
        if classification['type'] == 'math':
            cleaned = cls._summarize_math(cleaned)
        elif classification['type'] == 'code':
            cleaned = cls._summarize_code(cleaned)
        
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()
        
        return cleaned

    @classmethod
    def _summarize_math(cls, text: str) -> str:
        normalized = text
        
        normalized = re.sub(r'\\frac\{([^}]+)\}\{([^}]+)\}', r'fraction(\1, \2)', normalized)
        normalized = re.sub(r'\\sum_\{([^}]+)\}\^([^\s]+)', r'sum from \1 to \2', normalized)
        normalized = re.sub(r'\\int_\{([^}]+)\}\^([^\s]+)', r'integral from \1 to \2', normalized)
        normalized = re.sub(r'\\prod_\{([^}]+)\}\^([^\s]+)', r'product from \1 to \2', normalized)
        normalized = re.sub(r'\\([a-zA-Z]+)', r'\1', normalized)
        normalized = re.sub(r'\$\$?', '', normalized)
        normalized = re.sub(r'\\\[|\\\]|\\\(|\\\)', '', normalized)
        normalized = re.sub(r'\{|\}', '', normalized)
        normalized = re.sub(r'_', ' subscript ', normalized)
        normalized = re.sub(r'\^', ' superscript ', normalized)
        
        math_desc = "This section contains mathematical formulas and equations "
        math_desc += "related to the surrounding context. "
        
        return math_desc + normalized

    @classmethod
    def _summarize_code(cls, text: str) -> str:
        normalized = text
        
        function_names = re.findall(r'\bdef\s+(\w+)\s*\(', normalized)
        class_names = re.findall(r'\bclass\s+(\w+)\s*[:\(]', normalized)
        imports = re.findall(r'\b(?:import|from)\s+(\w+)', normalized)
        
        summary_parts = []
        
        if class_names:
            summary_parts.append(f"Contains classes: {', '.join(class_names[:5])}")
        if function_names:
            summary_parts.append(f"Contains functions: {', '.join(function_names[:10])}")
        if imports:
            summary_parts.append(f"Uses modules: {', '.join(list(set(imports))[:5])}")
        
        normalized = re.sub(r'```[\s\S]*?```', '', normalized)
        normalized = re.sub(r'`[^`]+`', '', normalized)
        
        if summary_parts:
            code_desc = "This section contains code. " + "; ".join(summary_parts) + ". "
        else:
            code_desc = "This section contains programming code. "
        
        lines = normalized.strip().split('\n')
        meaningful_lines = [line.strip() for line in lines if len(line.strip()) > 20 and not line.strip().startswith('#')]
        
        if meaningful_lines:
            return code_desc + " ".join(meaningful_lines[:5])
        
        return code_desc + normalized[:500]

    @classmethod
    def clean_for_display(cls, text: str) -> str:
        cleaned = text
        for pattern in cls.NOISE_PATTERNS:
            cleaned = re.sub(pattern, '\n', cleaned)
        return cleaned.strip()


def chunk_text(
    text: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 200
) -> List[str]:
    chunks = []
    if len(text) <= chunk_size:
        return [text]
    
    paragraphs = re.split(r'\n\s*\n', text)
    current_chunk = []
    current_size = 0
    
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        para_size = len(para)
        
        if current_size + para_size > chunk_size:
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
            
            if para_size > chunk_size:
                sentences = re.split(r'(?<=[.!?])\s+', para)
                sub_chunk = []
                sub_size = 0
                for sent in sentences:
                    sent_size = len(sent)
                    if sub_size + sent_size > chunk_size:
                        if sub_chunk:
                            chunks.append(' '.join(sub_chunk))
                        overlap = ' '.join(sub_chunk[-1:]) if sub_chunk else ''
                        sub_chunk = [overlap, sent] if overlap else [sent]
                        sub_size = len(overlap) + sent_size if overlap else sent_size
                    else:
                        sub_chunk.append(sent)
                        sub_size += sent_size
                if sub_chunk:
                    chunks.append(' '.join(sub_chunk))
                current_chunk = []
                current_size = 0
            else:
                overlap = '\n\n'.join(current_chunk[-1:]) if current_chunk else ''
                current_chunk = [overlap, para] if overlap else [para]
                current_size = len(overlap) + para_size if overlap else para_size
        else:
            current_chunk.append(para)
            current_size += para_size
    
    if current_chunk:
        chunks.append('\n\n'.join(current_chunk))
    
    return chunks


def ensure_directory(directory: str) -> Path:
    path = Path(directory)
    path.mkdir(parents=True, exist_ok=True)
    return path

def format_datetime(dt: datetime) -> str:
    return dt.isoformat()

def sanitize_filename(filename: str) -> str:
    return re.sub(r'[\\/*?:"<>|]', "_", filename)
