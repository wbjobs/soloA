from typing import List, Dict, Set, Optional, Tuple
from packaging.version import Version, InvalidVersion
from packaging.specifiers import SpecifierSet, InvalidSpecifier

from ..models import (
    Dependency,
    DependencyTree,
    Conflict,
    ConflictType,
    AnalysisResult,
)


class ConflictDetector:
    """
    依赖冲突检测器
    """

    def detect(self, tree: DependencyTree) -> AnalysisResult:
        conflicts: List[Conflict] = []

        all_deps = tree.flatten()
        if not all_deps:
            return AnalysisResult(tree=tree, conflicts=conflicts)

        conflicts.extend(self._detect_version_conflicts(tree))
        conflicts.extend(self._detect_redundant_dependencies(tree))
        conflicts.extend(self._detect_transitive_issues(tree))

        return AnalysisResult(
            tree=tree,
            conflicts=conflicts,
        )

    def _detect_version_conflicts(self, tree: DependencyTree) -> List[Conflict]:
        conflicts: List[Conflict] = []
        all_deps = tree.flatten()

        dep_map: Dict[str, List[Dependency]] = {}
        for dep in all_deps:
            if dep.parent is None:
                continue
            key = dep.full_name
            dep_map.setdefault(key, []).append(dep)

        for name, deps in dep_map.items():
            versions = set()
            valid_deps = []
            for dep in deps:
                if dep.version:
                    versions.add(dep.version)
                    valid_deps.append(dep)

            if len(versions) > 1:
                paths = []
                for dep in valid_deps:
                    path = self._get_path_to_root(dep)
                    if path:
                        paths.append(path)

                conflict = Conflict(
                    type=ConflictType.VERSION_CONFLICT,
                    package_name=name,
                    description=f"包 {name} 存在多个版本: {', '.join(sorted(versions))}",
                    severity=self._calculate_severity(versions),
                    affected_versions=sorted(versions),
                    affected_packages=valid_deps,
                    paths=paths,
                )
                conflicts.append(conflict)

        return conflicts

    def _detect_redundant_dependencies(self, tree: DependencyTree) -> List[Conflict]:
        conflicts: List[Conflict] = []
        all_deps = tree.flatten()

        direct_deps = [
            d for d in all_deps if not d.is_transitive and d.parent is not None
        ]
        transitive_deps = [
            d for d in all_deps if d.is_transitive
        ]

        for direct in direct_deps:
            for transitive in transitive_deps:
                if direct.full_name == transitive.full_name:
                    if direct.version and transitive.version:
                        if self._versions_match(direct.version, transitive.version):
                            paths = [self._get_path_to_root(transitive)]

                            conflict = Conflict(
                                type=ConflictType.REDUNDANT_DEPENDENCY,
                                package_name=direct.full_name,
                                description=(
                                    f"包 {direct.full_name} 已显式声明为直接依赖，"
                                    f"同时也作为传递依赖存在，可能存在冗余"
                                ),
                                severity="low",
                                affected_versions=[direct.version, transitive.version],
                                affected_packages=[direct, transitive],
                                paths=paths,
                                suggestion="考虑移除直接依赖声明，依赖传递依赖即可",
                            )
                            conflicts.append(conflict)

        return conflicts

    def _detect_transitive_issues(self, tree: DependencyTree) -> List[Conflict]:
        conflicts: List[Conflict] = []
        all_deps = tree.flatten()

        for dep in all_deps:
            if dep.is_transitive and dep.depth > 2:
                if dep.version is None:
                    paths = [self._get_path_to_root(dep)]

                    conflict = Conflict(
                        type=ConflictType.TRANSITIVE_ISSUE,
                        package_name=dep.full_name,
                        description=(
                            f"深度传递依赖 {dep.full_name} (深度: {dep.depth}) "
                            f"无法解析版本，可能存在依赖解析问题"
                        ),
                        severity="medium",
                        affected_packages=[dep],
                        paths=paths,
                        suggestion="考虑显式声明该依赖或更新上游依赖",
                    )
                    conflicts.append(conflict)

        return conflicts

    def _get_path_to_root(self, dep: Dependency) -> List[Dependency]:
        path = []
        current = dep
        while current is not None:
            path.insert(0, current)
            current = current.parent
        return path

    def _versions_match(self, v1: str, v2: str) -> bool:
        try:
            return Version(v1) == Version(v2)
        except (InvalidVersion, TypeError):
            return v1 == v2

    def _calculate_severity(self, versions: Set[str]) -> str:
        if len(versions) >= 3:
            return "high"

        try:
            parsed_versions = [Version(v) for v in versions]
            major_versions = set(v.major for v in parsed_versions)
            if len(major_versions) > 1:
                return "high"

            minor_versions = set(v.minor for v in parsed_versions)
            if len(minor_versions) > 1:
                return "medium"

            return "low"
        except (InvalidVersion, TypeError):
            return "medium"
