import json
import re
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple
import xml.etree.ElementTree as ET
from defusedxml.ElementTree import parse as defused_parse

from ..models import Dependency, DependencyTree, LanguageType
from .base import BaseParser


class MavenParser(BaseParser):
    """
    Maven 项目依赖解析器
    """

    def __init__(self):
        self.properties: Dict[str, str] = {}

    @property
    def language(self) -> str:
        return LanguageType.MAVEN.value

    def can_parse(self, project_path: Path) -> bool:
        return (project_path / "pom.xml").exists()

    def get_config_files(self, project_path: Path) -> List[Path]:
        files = []
        pom_path = project_path / "pom.xml"
        if pom_path.exists():
            files.append(pom_path)
        return files

    def _extract_properties(self, root: ET.Element) -> Dict[str, str]:
        properties: Dict[str, str] = {}
        ns = {"m": "http://maven.apache.org/POM/4.0.0"}

        properties_elem = root.find("m:properties", ns)
        if properties_elem is not None:
            for child in properties_elem:
                tag = child.tag.replace(
                    "{http://maven.apache.org/POM/4.0.0}", ""
                )
                if child.text:
                    properties[tag] = child.text
        return properties

    def _resolve_property(self, value: str) -> str:
        if not value:
            return value
        pattern = r"\$\{([^}]+)\}"
        match = re.search(pattern, value)
        while match:
            prop_name = match.group(1)
            prop_value = self.properties.get(prop_name, match.group(0))
            value = value.replace(match.group(0), prop_value)
            match = re.search(pattern, value)
        return value

    def _parse_dependency_elem(
        self, dep_elem: ET.Element, depth: int = 0, is_transitive: bool = False
    ) -> Optional[Dependency]:
        ns = {"m": "http://maven.apache.org/POM/4.0.0"}

        group_id_elem = dep_elem.find("m:groupId", ns)
        artifact_id_elem = dep_elem.find("m:artifactId", ns)

        if group_id_elem is None or artifact_id_elem is None:
            return None

        group_id = group_id_elem.text or ""
        artifact_id = artifact_id_elem.text or ""

        version_elem = dep_elem.find("m:version", ns)
        version = version_elem.text if version_elem is not None else None
        if version:
            version = self._resolve_property(version)

        scope_elem = dep_elem.find("m:scope", ns)
        scope = scope_elem.text if scope_elem is not None else "compile"

        original_spec = f"{group_id}:{artifact_id}:{version}" if version else f"{group_id}:{artifact_id}"

        return Dependency(
            name=artifact_id,
            version=version,
            scope=scope,
            group_id=group_id,
            depth=depth,
            is_transitive=is_transitive,
            original_spec=original_spec,
        )

    def _build_tree_from_text(
        self, tree_text: str
    ) -> Tuple[Optional[Dependency], List[Dependency]]:
        lines = [line for line in tree_text.strip().split("\n") if line.strip()]
        if not lines:
            return None, []

        all_deps: List[Dependency] = []
        stack: List[Tuple[int, Dependency]] = []
        root: Optional[Dependency] = None

        for line in lines:
            stripped = line.lstrip()
            indent = len(line) - len(stripped)
            level = indent // 3

            match = re.match(r"^[\\|\+\-\s]*([^:]+):([^:]+)(?::([^:]+))?(?::([^:]+))?(?::([^:]+))?$", stripped)
            if not match:
                continue

            group_id = match.group(1)
            artifact_id = match.group(2)
            packaging = match.group(3)
            version = match.group(4)
            scope = match.group(5) or "compile"

            is_transitive = level > 0
            dep = Dependency(
                name=artifact_id,
                version=version,
                scope=scope,
                group_id=group_id,
                depth=level,
                is_transitive=is_transitive,
            )

            all_deps.append(dep)

            while stack and stack[-1][0] >= level:
                stack.pop()

            if stack:
                parent = stack[-1][1]
                parent.add_child(dep)
            else:
                root = dep

            stack.append((level, dep))

        return root, all_deps

    def parse(self, project_path: Path) -> DependencyTree:
        self.properties = {}
        pom_path = project_path / "pom.xml"
        config_files = self.get_config_files(project_path)

        root_dep: Optional[Dependency] = None
        all_deps: List[Dependency] = []

        direct_deps: List[Dependency] = []
        if pom_path.exists():
            try:
                tree = defused_parse(str(pom_path))
                root_elem = tree.getroot()
                self.properties = self._extract_properties(root_elem)
                ns = {"m": "http://maven.apache.org/POM/4.0.0"}

                group_id_elem = root_elem.find("m:groupId", ns)
                artifact_id_elem = root_elem.find("m:artifactId", ns)
                version_elem = root_elem.find("m:version", ns)

                if group_id_elem is not None and artifact_id_elem is not None:
                    root_dep = Dependency(
                        name=artifact_id_elem.text or "",
                        version=version_elem.text if version_elem is not None else None,
                        group_id=group_id_elem.text,
                        depth=0,
                        is_transitive=False,
                    )
                    all_deps.append(root_dep)

                dependencies_elem = root_elem.find("m:dependencies", ns)
                if dependencies_elem is not None:
                    for dep_elem in dependencies_elem.findall("m:dependency", ns):
                        dep = self._parse_dependency_elem(dep_elem, depth=1, is_transitive=False)
                        if dep:
                            dep.source_file = str(pom_path)
                            direct_deps.append(dep)

            except Exception as e:
                pass

        tree = DependencyTree(
            language=LanguageType.MAVEN,
            root=root_dep,
            dependencies=all_deps,
            source_files=[str(f) for f in config_files],
        )

        if root_dep and direct_deps:
            for dep in direct_deps:
                root_dep.add_child(dep)
                all_deps.append(dep)

        return tree
