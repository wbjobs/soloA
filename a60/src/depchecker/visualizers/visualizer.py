from typing import List, Dict, Set, Optional, Tuple
from io import StringIO

from ..models import (
    Dependency,
    DependencyTree,
    Conflict,
    AnalysisResult,
)


class Visualizer:
    """
    依赖树和冲突可视化工具
    """

    def render_text_tree(self, tree: DependencyTree) -> str:
        """
        渲染 ASCII 文本树
        """
        if not tree.root:
            return "无依赖树"

        output = StringIO()
        output.write(f"依赖树 ({tree.language.value}):\n")
        output.write("=" * 60 + "\n\n")
        self._render_tree_node(tree.root, "", True, output)
        return output.getvalue()

    def _render_tree_node(
        self,
        node: Dependency,
        prefix: str,
        is_last: bool,
        output: StringIO,
    ) -> None:
        connector = "└── " if is_last else "├── "
        version_str = f"@{node.version}" if node.version else ""
        transitive_str = " [transitive]" if node.is_transitive else ""
        scope_str = f" [{node.scope}]" if node.scope else ""

        output.write(f"{prefix}{connector}{node.full_name}{version_str}{transitive_str}{scope_str}\n")

        children = node.children
        for i, child in enumerate(children):
            child_prefix = prefix + ("    " if is_last else "│   ")
            child_is_last = i == len(children) - 1
            self._render_tree_node(child, child_prefix, child_is_last, output)

    def render_mermaid_tree(self, tree: DependencyTree) -> str:
        """
        渲染 Mermaid 树形图
        """
        if not tree.root:
            return "graph TD;\n    N0[无依赖树];"

        lines = ["graph TD;"]
        node_map: Dict[int, str] = {}
        node_id = 0

        def add_node(dep: Dependency) -> int:
            nonlocal node_id
            nid = node_id
            label = f"{dep.full_name}"
            if dep.version:
                label += f"\\n@{dep.version}"
            if dep.is_transitive:
                label += "\\n(transitive)"
            node_map[nid] = label
            lines.append(f"    N{nid}[\"{label}\"];")
            node_id += 1
            return nid

        def traverse(node: Dependency, parent_id: Optional[int] = None) -> None:
            current_id = add_node(node)
            if parent_id is not None:
                lines.append(f"    N{parent_id} --> N{current_id};")
            for child in node.children:
                traverse(child, current_id)

        traverse(tree.root)
        lines.append("")
        return "\n".join(lines)

    def render_conflict_paths(self, conflicts: List[Conflict]) -> str:
        """
        渲染冲突路径文本
        """
        if not conflicts:
            return "未发现依赖冲突。\n"

        output = StringIO()
        output.write("依赖冲突分析报告\n")
        output.write("=" * 60 + "\n\n")

        for i, conflict in enumerate(conflicts, 1):
            severity_icon = {
                "high": "🔴",
                "medium": "🟡",
                "low": "🟢",
            }.get(conflict.severity, "⚪")

            output.write(f"{i}. [{conflict.type.value.upper()}] {severity_icon} {conflict.package_name}\n")
            output.write(f"   严重程度: {conflict.severity}\n")
            output.write(f"   描述: {conflict.description}\n")

            if conflict.affected_versions:
                output.write(f"   涉及版本: {', '.join(conflict.affected_versions)}\n")

            if conflict.paths:
                output.write("   冲突路径:\n")
                for path_idx, path in enumerate(conflict.paths, 1):
                    path_str = " → ".join(
                        f"{d.full_name}@{d.version}" if d.version else d.full_name
                        for d in path
                    )
                    output.write(f"      {path_idx}. {path_str}\n")

            if conflict.suggestion:
                output.write(f"   建议: {conflict.suggestion}\n")

            output.write("\n")

        return output.getvalue()

    def render_mermaid_conflicts(self, conflicts: List[Conflict]) -> str:
        """
        渲染 Mermaid 冲突图
        """
        if not conflicts:
            return "graph TD;\n    N0[无冲突];"

        lines = ["graph TD;"]
        node_map: Dict[str, str] = {}
        node_counter = 0

        def get_node_id(name: str) -> str:
            nonlocal node_counter
            if name not in node_map:
                node_map[name] = f"N{node_counter}"
                safe_label = name.replace('"', '\\"')
                lines.append(f'    {node_map[name]}["{safe_label}"];')
                node_counter += 1
            return node_map[name]

        for conflict in conflicts:
            conflict_id = f"conflict_{node_counter}"
            node_counter += 1
            color_map = {"high": "#ffcccc", "medium": "#ffffcc", "low": "#ccffcc"}
            color = color_map.get(conflict.severity, "#eeeeee")
            lines.append(
                f'    {conflict_id}(/"{conflict.type.value.upper()}\\n{conflict.package_name}\\nseverity: {conflict.severity}"/):::conflict;'
            )
            lines.append(f"    style {conflict_id} fill:{color},stroke:#333,stroke-width:2px;")

            for pkg in conflict.affected_packages:
                pkg_id = get_node_id(f"{pkg.full_name}@{pkg.version}")
                lines.append(f"    {conflict_id} --> {pkg_id};")

        lines.append("    classDef conflict fill:#fff,stroke:#333,stroke-width:2px;")
        lines.append("")
        return "\n".join(lines)
