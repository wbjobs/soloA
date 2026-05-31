import re
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import json

from ..models import Dependency, DependencyTree, LanguageType
from .base import BaseParser


class PipParser(BaseParser):
    """
    Python pip 项目依赖解析器
    """

    @property
    def language(self) -> str:
        return LanguageType.PIP.value

    def can_parse(self, project_path: Path) -> bool:
        return any(
            [
                (project_path / "requirements.txt").exists(),
                (project_path / "Pipfile").exists(),
                (project_path / "pyproject.toml").exists(),
            ]
        )

    def get_config_files(self, project_path: Path) -> List[Path]:
        files = []
        candidates = [
            "requirements.txt",
            "Pipfile",
            "Pipfile.lock",
            "pyproject.toml",
            "poetry.lock",
            "setup.py",
            "setup.cfg",
        ]
        for candidate in candidates:
            path = project_path / candidate
            if path.exists():
                files.append(path)
        return files

    def _parse_requirement_line(
        self, line: str, depth: int = 0, is_transitive: bool = False
    ) -> Optional[Dependency]:
        line = line.strip()
        if not line or line.startswith("#"):
            return None

        pattern = r"^([a-zA-Z0-9_\-]+)(?:\[([^\]]+)\])?\s*([<>=!~\s].*)?$"
        match = re.match(pattern, line)
        if not match:
            return None

        name = match.group(1).replace("-", "_").lower()
        extras = match.group(2)
        version_spec = (match.group(3) or "").strip()

        version = None
        if version_spec:
            version_match = re.search(r"==\s*([^\s,]+)", version_spec)
            if version_match:
                version = version_match.group(1)

        return Dependency(
            name=name,
            version=version,
            depth=depth,
            is_transitive=is_transitive,
            original_spec=line,
        )

    def _parse_requirements_txt(
        self, req_path: Path
    ) -> List[Dependency]:
        deps: List[Dependency] = []
        try:
            with open(req_path, "r", encoding="utf-8") as f:
                for line in f:
                    dep = self._parse_requirement_line(line, depth=1, is_transitive=False)
                    if dep:
                        dep.source_file = str(req_path)
                        deps.append(dep)
        except Exception:
            pass
        return deps

    def _parse_pyproject_toml(
        self, toml_path: Path
    ) -> Tuple[Optional[Dependency], List[Dependency]]:
        root = None
        deps: List[Dependency] = []

        try:
            import tomllib
        except ImportError:
            try:
                import toml as tomllib
            except ImportError:
                return root, deps

        try:
            with open(toml_path, "rb") as f:
                data = tomllib.load(f)

            project = data.get("project", {})
            if project:
                name = project.get("name", "project")
                version = project.get("version", "1.0.0")
                root = Dependency(
                    name=name,
                    version=version,
                    depth=0,
                    is_transitive=False,
                    source_file=str(toml_path),
                )

                for dep_line in project.get("dependencies", []):
                    dep = self._parse_requirement_line(dep_line, depth=1, is_transitive=False)
                    if dep:
                        dep.source_file = str(toml_path)
                        deps.append(dep)

                optional_deps = project.get("optional-dependencies", {})
                for group, group_deps in optional_deps.items():
                    for dep_line in group_deps:
                        dep = self._parse_requirement_line(dep_line, depth=1, is_transitive=False)
                        if dep:
                            dep.source_file = str(toml_path)
                            dep.scope = f"optional:{group}"
                            deps.append(dep)

            poetry = data.get("tool", {}).get("poetry", {})
            if poetry:
                name = poetry.get("name", "project")
                version = poetry.get("version", "1.0.0")
                if not root:
                    root = Dependency(
                        name=name,
                        version=version,
                        depth=0,
                        is_transitive=False,
                        source_file=str(toml_path),
                    )

                main_deps = poetry.get("dependencies", {})
                for dep_name, dep_info in main_deps.items():
                    if dep_name == "python":
                        continue
                    version = None
                    if isinstance(dep_info, str):
                        version = dep_info
                    elif isinstance(dep_info, dict):
                        version = dep_info.get("version")
                    dep = Dependency(
                        name=dep_name.replace("-", "_").lower(),
                        version=version,
                        depth=1,
                        is_transitive=False,
                        source_file=str(toml_path),
                    )
                    deps.append(dep)

        except Exception:
            pass

        return root, deps

    def _parse_pipfile(
        self, pipfile_path: Path
    ) -> Tuple[Optional[Dependency], List[Dependency]]:
        root = None
        deps: List[Dependency] = []

        try:
            import tomllib
        except ImportError:
            try:
                import toml as tomllib
            except ImportError:
                return root, deps

        try:
            with open(pipfile_path, "rb") as f:
                data = tomllib.load(f)

            packages = data.get("packages", {})
            for dep_name, dep_info in packages.items():
                version = None
                if isinstance(dep_info, str):
                    version = dep_info
                elif isinstance(dep_info, dict):
                    version = dep_info.get("version")
                dep = Dependency(
                    name=dep_name.replace("-", "_").lower(),
                    version=version,
                    depth=1,
                    is_transitive=False,
                    source_file=str(pipfile_path),
                )
                deps.append(dep)

            dev_packages = data.get("dev-packages", {})
            for dep_name, dep_info in dev_packages.items():
                version = None
                if isinstance(dep_info, str):
                    version = dep_info
                elif isinstance(dep_info, dict):
                    version = dep_info.get("version")
                dep = Dependency(
                    name=dep_name.replace("-", "_").lower(),
                    version=version,
                    scope="dev",
                    depth=1,
                    is_transitive=False,
                    source_file=str(pipfile_path),
                )
                deps.append(dep)

        except Exception:
            pass

        return root, deps

    def parse(self, project_path: Path) -> DependencyTree:
        config_files = self.get_config_files(project_path)
        root: Optional[Dependency] = None
        all_deps: List[Dependency] = []

        pyproject_path = project_path / "pyproject.toml"
        if pyproject_path.exists():
            root, deps = self._parse_pyproject_toml(pyproject_path)
            if root:
                all_deps.append(root)
            for dep in deps:
                all_deps.append(dep)
                if root:
                    root.add_child(dep)

        pipfile_path = project_path / "Pipfile"
        if pipfile_path.exists() and not all_deps:
            root, deps = self._parse_pipfile(pipfile_path)
            if root:
                all_deps.append(root)
            for dep in deps:
                all_deps.append(dep)
                if root:
                    root.add_child(dep)

        req_path = project_path / "requirements.txt"
        if req_path.exists() and not all_deps:
            root = Dependency(
                name="requirements",
                version="1.0.0",
                depth=0,
                is_transitive=False,
                source_file=str(req_path),
            )
            all_deps.append(root)
            deps = self._parse_requirements_txt(req_path)
            for dep in deps:
                all_deps.append(dep)
                root.add_child(dep)

        if root is None:
            root = Dependency(
                name="project",
                version="1.0.0",
                depth=0,
                is_transitive=False,
            )
            all_deps.append(root)

        tree = DependencyTree(
            language=LanguageType.PIP,
            root=root,
            dependencies=all_deps,
            source_files=[str(f) for f in config_files],
        )

        return tree
