import sys
from pathlib import Path
from typing import Optional

import click

from .analyzer import Analyzer
from .formatter import OutputFormatter
from .parsers import get_parser_for_project


@click.group()
@click.version_option(package_name="depchecker")
def main():
    """
    depchecker - 跨平台依赖冲突分析工具

    支持分析 Maven、npm、pip 项目的依赖冲突。
    """
    pass


@main.command()
@click.argument(
    "project_path",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    default=Path("."),
)
@click.option(
    "--format",
    "-f",
    "output_format",
    type=click.Choice(["text", "json", "html"]),
    default="text",
    help="输出格式: text, json, html",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(writable=True, path_type=Path),
    default=None,
    help="输出文件路径 (默认输出到标准输出)",
)
@click.option(
    "--show-tree/--no-show-tree",
    default=True,
    help="是否显示依赖树",
)
def analyze(
    project_path: Path,
    output_format: str,
    output: Optional[Path],
    show_tree: bool,
):
    """
    分析项目依赖冲突。

    PROJECT_PATH: 项目根目录路径 (默认为当前目录)
    """
    project_path = project_path.resolve()

    parser = get_parser_for_project(project_path)
    if parser is None:
        click.echo(
            click.style(
                f"[ERROR] 无法识别项目类型: {project_path}",
                fg="red",
                bold=True,
            )
        )
        click.echo(
            "请确保项目包含以下任一配置文件:"
        )
        click.echo("  - Maven: pom.xml")
        click.echo("  - npm: package.json")
        click.echo("  - pip: requirements.txt / pyproject.toml / Pipfile")
        sys.exit(1)

    click.echo(
        click.style(
            f"[INFO] 正在分析 {parser.language} 项目: {project_path}",
            fg="cyan",
            bold=True,
        )
    )

    analyzer = Analyzer()
    result = analyzer.analyze(project_path)

    if result is None:
        click.echo(
            click.style(
                "[ERROR] 无法解析项目依赖",
                fg="red",
                bold=True,
            )
        )
        sys.exit(1)

    formatter = OutputFormatter()

    if output_format == "text":
        content = formatter.format_text(result)
    elif output_format == "json":
        content = formatter.format_json(result)
    elif output_format == "html":
        content = formatter.format_html(result)
    else:
        content = formatter.format_text(result)

    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
        click.echo(
            click.style(
                f"[OK] 报告已写入: {output}",
                fg="green",
                bold=True,
            )
        )
    else:
        click.echo(content)

    summary = result.summary
    total = summary.get("total_conflicts", 0)

    if total > 0:
        click.echo()
        click.echo(
            click.style(
                f"[WARNING] 发现 {total} 个潜在问题",
                fg="yellow",
                bold=True,
            )
        )
        sys.exit(1)
    else:
        click.echo()
        click.echo(
            click.style(
                "[OK] 未发现依赖冲突！",
                fg="green",
                bold=True,
            )
        )
        sys.exit(0)


@main.command("detect")
@click.argument(
    "project_path",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    default=Path("."),
)
@click.option(
    "--output",
    "-o",
    type=click.Path(writable=True, path_type=Path),
    default=None,
    help="输出文件路径",
)
def detect_command(
    project_path: Path,
    output: Optional[Path],
):
    """
    检测项目依赖冲突 (仅输出冲突摘要)。
    """
    from .analyzer import Analyzer
    from .formatter import OutputFormatter

    project_path = project_path.resolve()
    parser = get_parser_for_project(project_path)

    if parser is None:
        click.echo(
            click.style(f"[ERROR] 无法识别项目类型: {project_path}", fg="red", bold=True)
        )
        sys.exit(1)

    analyzer = Analyzer()
    result = analyzer.analyze(project_path)

    if result is None:
        click.echo(
            click.style("[ERROR] 无法解析项目依赖", fg="red", bold=True)
        )
        sys.exit(1)

    output_content = []
    output_content.append(f"项目类型: {parser.language}")
    output_content.append(f"依赖总数: {len(result.tree.flatten())}")
    output_content.append(f"冲突总数: {result.summary.get('total_conflicts', 0)}")

    if result.conflicts:
        output_content.append("\n冲突列表:")
        for i, c in enumerate(result.conflicts, 1):
            output_content.append(
                f"  {i}. [{c.severity.upper()}] {c.type.value}: {c.package_name}"
            )
            output_content.append(f"     {c.description}")
            if c.suggestion:
                output_content.append(f"     建议: {c.suggestion}")

    content = "\n".join(output_content)

    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(content, encoding="utf-8")
    else:
        click.echo(content)

    sys.exit(1 if result.conflicts else 0)


if __name__ == "__main__":
    main()
