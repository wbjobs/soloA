from typing import List, Dict, Set, Optional
from packaging.version import Version, InvalidVersion

from ..models import (
    Dependency,
    DependencyTree,
    Conflict,
    ConflictType,
    AnalysisResult,
    LanguageType,
)


class Recommender:
    """
    依赖冲突修复建议生成器
    """

    def generate_suggestions(self, result: AnalysisResult) -> None:
        """
        为所有冲突生成修复建议
        """
        for conflict in result.conflicts:
            if conflict.suggestion is None:
                conflict.suggestion = self._generate_suggestion(
                    conflict, result.tree
                )

    def _generate_suggestion(
        self, conflict: Conflict, tree: DependencyTree
    ) -> str:
        suggestions: List[str] = []

        if conflict.type == ConflictType.VERSION_CONFLICT:
            suggestions = self._suggest_version_conflict_fix(conflict, tree)
        elif conflict.type == ConflictType.REDUNDANT_DEPENDENCY:
            suggestions = self._suggest_redundant_fix(conflict)
        elif conflict.type == ConflictType.TRANSITIVE_ISSUE:
            suggestions = self._suggest_transitive_fix(conflict, tree)
        elif conflict.type == ConflictType.UNRESOLVED:
            suggestions = ["手动检查并解析该依赖"]

        return " ".join(suggestions)

    def _suggest_version_conflict_fix(
        self, conflict: Conflict, tree: DependencyTree
    ) -> List[str]:
        suggestions: List[str] = []

        if len(conflict.affected_versions) < 2:
            return suggestions

        try:
            versions = [Version(v) for v in conflict.affected_versions]
            sorted_versions = sorted(versions)
            latest = sorted_versions[-1]

            direct_uses = [
                p for p in conflict.affected_packages if not p.is_transitive
            ]

            if direct_uses:
                direct_versions = [
                    Version(p.version) for p in direct_uses if p.version
                ]
                if direct_versions:
                    max_direct = max(direct_versions)
                    if latest > max_direct:
                        suggestions.append(
                            f"建议将直接依赖升级到最新版本 {latest}。"
                        )
                    elif latest < max_direct:
                        suggestions.append(
                            f"建议将传递依赖排除，使用直接依赖版本 {max_direct}。"
                        )
                    else:
                        suggestions.append(
                            "建议使用 dependencyManagement (Maven) 或 resolutions (npm) 统一版本。"
                        )
            else:
                suggestions.append(
                    f"建议显式声明依赖 {conflict.package_name}，使用最高版本 {latest}。"
                )

            transitive_paths = []
            for path in conflict.paths:
                if len(path) >= 2:
                    intermediate = path[-2]
                    transitive_paths.append(
                        f"从 {intermediate.full_name} 排除冲突版本"
                    )
            if transitive_paths:
                suggestions.append("或 " + "；".join(set(transitive_paths)))

        except (InvalidVersion, TypeError, ValueError):
            suggestions.append(
                f"建议统一使用同一版本，或在 {tree.language.value} 中使用版本锁定机制。"
            )

        return suggestions

    def _suggest_redundant_fix(self, conflict: Conflict) -> List[str]:
        suggestions: List[str] = []

        if len(conflict.affected_packages) >= 2:
            direct = [p for p in conflict.affected_packages if not p.is_transitive]
            transitive = [p for p in conflict.affected_packages if p.is_transitive]

            if direct and transitive:
                suggestions.append(
                    f"可以移除直接依赖声明 {conflict.package_name}，"
                    f"依赖传递依赖即可。如果需要固定版本，可以保留但确保版本一致。"
                )

        return suggestions

    def _suggest_transitive_fix(
        self, conflict: Conflict, tree: DependencyTree
    ) -> List[str]:
        suggestions: List[str] = []

        if conflict.affected_packages:
            dep = conflict.affected_packages[0]

            suggestions.append(
                f"建议显式声明依赖 {dep.full_name} 并指定明确版本。"
            )

            if conflict.paths:
                for path in conflict.paths:
                    if len(path) >= 2:
                        parent = path[-2]
                        suggestions.append(
                            f"或检查上游依赖 {parent.full_name} 的版本是否可以更新。"
                        )
                        break

        return suggestions
