from pathlib import Path
from typing import Optional

from ..models import DependencyTree, LanguageType
from .base import BaseParser
from .maven import MavenParser
from .npm import NpmParser
from .pip import PipParser


__all__ = [
    "BaseParser",
    "MavenParser",
    "NpmParser",
    "PipParser",
    "get_parser_for_project",
    "parse_project",
]


PARSERS = [
    MavenParser,
    NpmParser,
    PipParser,
]


def get_parser_for_project(project_path: Path) -> Optional[BaseParser]:
    """
    根据项目路径自动识别并返回合适的解析器
    """
    for parser_cls in PARSERS:
        parser = parser_cls()
        if parser.can_parse(project_path):
            return parser
    return None


def parse_project(project_path: Path) -> Optional[DependencyTree]:
    """
    解析项目并返回依赖树
    """
    parser = get_parser_for_project(project_path)
    if parser:
        return parser.parse(project_path)
    return None
