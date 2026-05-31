from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Optional

from ..models import DependencyTree


class BaseParser(ABC):
    """
    依赖解析器的基类
    """

    @property
    @abstractmethod
    def language(self) -> str:
        pass

    @abstractmethod
    def can_parse(self, project_path: Path) -> bool:
        """
        检查是否可以解析该项目
        """
        pass

    @abstractmethod
    def parse(self, project_path: Path) -> DependencyTree:
        """
        解析项目的依赖并返回依赖树
        """
        pass

    @abstractmethod
    def get_config_files(self, project_path: Path) -> List[Path]:
        """
        找到项目中的配置文件
        """
        pass
