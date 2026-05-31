import json
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple

from ..models import Dependency, DependencyTree, LanguageType
from .base import BaseParser


class NpmParser(BaseParser):
    """
    npm 项目依赖解析器
    """

    @property
    def language(self) -> str:
        return LanguageType.NPM.value

    def can_parse(self, project_path: Path) -> bool:
        return (project_path / "package.json").exists()

    def get_config_files(self, project_path: Path) -> List[Path]:
        files = []
        pkg_path = project_path / "package.json"
        if pkg_path.exists():
            files.append(pkg_path)
        lock_path = project_path / "package-lock.json"
        if lock_path.exists():
            files.append(lock_path)
        yarn_lock = project_path / "yarn.lock"
        if yarn_lock.exists():
            files.append(yarn_lock)
        return files

    def _parse_package_json(
        self, pkg_path: Path
    ) -> Tuple[Optional[Dependency], List[Dependency], Dict[str, Any]]:
        with open(pkg_path, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)

        name = pkg_data.get("name", "project")
        version = pkg_data.get("version", "1.0.0")

        root = Dependency(
            name=name,
            version=version,
            depth=0,
            is_transitive=False,
            source_file=str(pkg_path),
        )

        direct_deps: List[Dependency] = []

        deps = pkg_data.get("dependencies", {})
        for dep_name, spec in deps.items():
            dep = Dependency(
                name=dep_name,
                version=None,
                scope=None,
                depth=1,
                is_transitive=False,
                source_file=str(pkg_path),
                original_spec=spec,
            )
            direct_deps.append(dep)

        dev_deps = pkg_data.get("devDependencies", {})
        for dep_name, spec in dev_deps.items():
            dep = Dependency(
                name=dep_name,
                version=None,
                scope="dev",
                depth=1,
                is_transitive=False,
                source_file=str(pkg_path),
                original_spec=spec,
            )
            direct_deps.append(dep)

        return root, direct_deps, pkg_data

    def _parse_package_lock(
        self, lock_path: Path, root: Dependency, direct_deps: List[Dependency]
    ) -> None:
        with open(lock_path, "r", encoding="utf-8") as f:
            lock_data = json.load(f)

        lock_version = lock_data.get("lockfileVersion", 1)

        packages_map: Dict[str, Dict[str, Any]] = {}

        if lock_version >= 2:
            packages = lock_data.get("packages", {})
            for pkg_path, pkg_info in packages.items():
                if pkg_path == "":
                    continue
                name = pkg_info.get("name") or pkg_path.split("/")[-1]
                packages_map[name] = pkg_info
        else:
            deps = lock_data.get("dependencies", {})
            for name, info in deps.items():
                packages_map[name] = info

        name_to_dep: Dict[str, Dependency] = {}
        for dep in direct_deps:
            name_to_dep[dep.name] = dep

        for dep in direct_deps:
            lock_info = packages_map.get(dep.name)
            if lock_info:
                version = lock_info.get("version")
                if version:
                    dep.version = version

                deps = lock_info.get("dependencies") or lock_info.get("requires")
                if deps:
                    if isinstance(deps, dict):
                        for sub_name, sub_spec in deps.items():
                            if isinstance(sub_spec, str):
                                sub_version = sub_spec
                            else:
                                sub_version = sub_spec.get("version")
                            sub_dep = Dependency(
                                name=sub_name,
                                version=sub_version,
                                depth=dep.depth + 1,
                                is_transitive=True,
                                source_file=str(lock_path),
                                required_by=[dep.full_name],
                            )
                            dep.add_child(sub_dep)

    def parse(self, project_path: Path) -> DependencyTree:
        config_files = self.get_config_files(project_path)
        pkg_path = project_path / "package.json"
        lock_path = project_path / "package-lock.json"

        root: Optional[Dependency] = None
        direct_deps: List[Dependency] = []
        all_deps: List[Dependency] = []

        if pkg_path.exists():
            root, direct_deps, _ = self._parse_package_json(pkg_path)
            all_deps.append(root)
            all_deps.extend(direct_deps)
            for dep in direct_deps:
                root.add_child(dep)

        if lock_path.exists() and root:
            self._parse_package_lock(lock_path, root, direct_deps)

        tree = DependencyTree(
            language=LanguageType.NPM,
            root=root,
            dependencies=all_deps,
            source_files=[str(f) for f in config_files],
        )

        return tree
