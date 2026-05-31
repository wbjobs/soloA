import json
from typing import Optional
from io import StringIO

from .models import AnalysisResult
from .visualizers import Visualizer


class OutputFormatter:
    """
    输出格式处理器
    """

    def __init__(self):
        self.visualizer = Visualizer()

    def format_text(self, result: AnalysisResult) -> str:
        output = StringIO()

        output.write("=" * 60 + "\n")
        output.write("依赖冲突分析报告\n")
        output.write("=" * 60 + "\n\n")

        if result.tree.source_files:
            output.write("项目配置文件:\n")
            for f in result.tree.source_files:
                output.write(f"  - {f}\n")
            output.write("\n")

        output.write(f"项目类型: {result.tree.language.value}\n")
        output.write(f"依赖总数: {len(result.tree.flatten())}\n\n")

        if result.conflicts:
            output.write(self.visualizer.render_conflict_paths(result.conflicts))
        else:
            output.write("✅ 未发现依赖冲突！\n\n")

        output.write("\n" + "-" * 60 + "\n")
        output.write("依赖树:\n")
        output.write("-" * 60 + "\n")
        output.write(self.visualizer.render_text_tree(result.tree))

        return output.getvalue()

    def format_json(self, result: AnalysisResult) -> str:
        data = result.to_dict()
        data["mermaid"] = {
            "tree": self.visualizer.render_mermaid_tree(result.tree),
            "conflicts": self.visualizer.render_mermaid_conflicts(result.conflicts),
        }
        return json.dumps(data, indent=2, ensure_ascii=False)

    def format_html(self, result: AnalysisResult) -> str:
        tree_mermaid = self.visualizer.render_mermaid_tree(result.tree)
        conflict_mermaid = self.visualizer.render_mermaid_conflicts(result.conflicts)
        summary = result.summary

        severity_colors = {
            "high": "#dc3545",
            "medium": "#ffc107",
            "low": "#28a745",
        }

        conflict_html_parts = []
        for i, conflict in enumerate(result.conflicts, 1):
            color = severity_colors.get(conflict.severity, "#6c757d")
            paths_html = ""
            if conflict.paths:
                paths_html_parts = []
                for path in conflict.paths:
                    path_str = " → ".join(
                        f"<strong>{d.full_name}</strong>@{d.version}"
                        if d.version else f"<strong>{d.full_name}</strong>"
                        for d in path
                    )
                    paths_html_parts.append(f"<li>{path_str}</li>")
                paths_html = (
                    "<p><strong>冲突路径:</strong></p><ul>"
                    + "".join(paths_html_parts)
                    + "</ul>"
                )

            versions_html = ""
            if conflict.affected_versions:
                versions_html = (
                    f"<p><strong>涉及版本:</strong> {', '.join(conflict.affected_versions)}</p>"
                )

            suggestion_html = ""
            if conflict.suggestion:
                suggestion_html = (
                    f"<p><strong>💡 建议:</strong> {conflict.suggestion}</p>"
                )

            conflict_html_parts.append(
                f"""
                <div class="conflict-card" style="border-left: 4px solid {color}; margin-bottom: 1rem; padding: 1rem; background: #f8f9fa; border-radius: 0 4px 4px 0;">
                    <h3 style="margin-top: 0;">{i}. [{conflict.type.value.upper()}] {conflict.package_name}
                        <span style="font-size: 0.8em; color: {color};">[{conflict.severity}]</span>
                    </h3>
                    <p>{conflict.description}</p>
                    {versions_html}
                    {paths_html}
                    {suggestion_html}
                </div>
                """
            )

        conflicts_html = (
            "".join(conflict_html_parts)
            if result.conflicts
            else '<div style="padding: 2rem; text-align: center; background: #d4edda; color: #155724; border-radius: 4px;"><h3>✅ 未发现依赖冲突！</h3></div>'
        )

        by_type_html = ""
        if summary.get("by_type"):
            items = []
            for t, count in summary["by_type"].items():
                items.append(f"<li><strong>{t}</strong>: {count}</li>")
            by_type_html = "<p><strong>按类型统计:</strong></p><ul>" + "".join(items) + "</ul>"

        by_severity_html = ""
        if summary.get("by_severity"):
            items = []
            for s, count in summary["by_severity"].items():
                color = severity_colors.get(s, "#6c757d")
                items.append(
                    f'<li><span style="color: {color};">●</span> <strong>{s}</strong>: {count}</li>'
                )
            by_severity_html = (
                "<p><strong>按严重程度统计:</strong></p><ul>" + "".join(items) + "</ul>"
            )

        source_files_html = ""
        if result.tree.source_files:
            items = [f"<li>{f}</li>" for f in result.tree.source_files]
            source_files_html = (
                "<p><strong>配置文件:</strong></p><ul>" + "".join(items) + "</ul>"
            )

        return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>依赖冲突分析报告</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        mermaid.initialize({{ startOnLoad: true, theme: 'default' }});
    </script>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 1200px; margin: 0 auto; padding: 2rem; line-height: 1.6; }}
        h1 {{ color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 0.5rem; }}
        h2 {{ color: #34495e; margin-top: 2rem; }}
        .summary-box {{ background: #ecf0f1; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; }}
        .mermaid {{ background: #fff; padding: 1rem; border-radius: 8px; border: 1px solid #ddd; overflow-x: auto; margin: 1rem 0; }}
    </style>
</head>
<body>
    <h1>📊 依赖冲突分析报告</h1>

    <div class="summary-box">
        <p><strong>项目类型:</strong> {result.tree.language.value}</p>
        <p><strong>依赖总数:</strong> {len(result.tree.flatten())}</p>
        <p><strong>冲突总数:</strong> {summary.get('total_conflicts', 0)}</p>
        {by_type_html}
        {by_severity_html}
        {source_files_html}
    </div>

    <h2>⚠️ 冲突详情</h2>
    {conflicts_html}

    <h2>🌳 依赖树</h2>
    <div class="mermaid">
    {tree_mermaid}
    </div>

    <h2>🔗 冲突关系图</h2>
    <div class="mermaid">
    {conflict_mermaid}
    </div>
</body>
</html>
"""
