from pathlib import Path
from typing import Optional

from .parsers import parse_project, get_parser_for_project
from .detectors import ConflictDetector
from .recommenders import Recommender
from .models import AnalysisResult, DependencyTree


class Analyzer:
    """
    依赖冲突分析引擎
    """

    def __init__(self):
        self.detector = ConflictDetector()
        self.recommender = Recommender()

    def analyze(self, project_path: Path) -> Optional[AnalysisResult]:
        """
        分析项目的依赖冲突
        """
        tree = parse_project(project_path)
        if tree is None:
            return None

        result = self.detector.detect(tree)
        self.recommender.generate_suggestions(result)

        return result

    def analyze_tree(self, tree: DependencyTree) -> AnalysisResult:
        """
        分析给定的依赖树
        """
        result = self.detector.detect(tree)
        self.recommender.generate_suggestions(result)
        return result
