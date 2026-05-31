from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any


class LanguageType(str, Enum):
    MAVEN = "maven"
    NPM = "npm"
    PIP = "pip"
    UNKNOWN = "unknown"


class ConflictType(str, Enum):
    VERSION_CONFLICT = "version_conflict"
    REDUNDANT_DEPENDENCY = "redundant_dependency"
    TRANSITIVE_ISSUE = "transitive_issue"
    UNRESOLVED = "unresolved"


@dataclass
class Dependency:
    name: str
    version: Optional[str] = None
    scope: Optional[str] = None
    group_id: Optional[str] = None
    parent: Optional["Dependency"] = None
    children: List["Dependency"] = field(default_factory=list)
    depth: int = 0
    is_transitive: bool = False
    source_file: Optional[str] = None
    required_by: List[str] = field(default_factory=list)
    original_spec: Optional[str] = None

    @property
    def full_name(self) -> str:
        if self.group_id and self.name:
            return f"{self.group_id}:{self.name}"
        return self.name

    def add_child(self, child: "Dependency") -> None:
        child.parent = self
        child.depth = self.depth + 1
        self.children.append(child)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "version": self.version,
            "scope": self.scope,
            "group_id": self.group_id,
            "full_name": self.full_name,
            "depth": self.depth,
            "is_transitive": self.is_transitive,
            "source_file": self.source_file,
            "required_by": self.required_by,
            "original_spec": self.original_spec,
            "children": [child.to_dict() for child in self.children],
        }


@dataclass
class DependencyTree:
    language: LanguageType
    root: Optional[Dependency] = None
    dependencies: List[Dependency] = field(default_factory=list)
    source_files: List[str] = field(default_factory=list)

    def add_dependency(self, dep: Dependency) -> None:
        self.dependencies.append(dep)

    def traverse(self) -> List[Dependency]:
        result = []

        def _traverse(node: Dependency) -> None:
            result.append(node)
            for child in node.children:
                _traverse(child)

        if self.root:
            _traverse(self.root)
        return result

    def flatten(self) -> List[Dependency]:
        return self.traverse()

    def get_all_versions(self, dep_name: str) -> List[Dependency]:
        return [d for d in self.flatten() if d.full_name == dep_name]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "language": self.language.value,
            "source_files": self.source_files,
            "root": self.root.to_dict() if self.root else None,
            "total_dependencies": len(self.flatten()),
        }


@dataclass
class Conflict:
    type: ConflictType
    package_name: str
    description: str
    severity: str = "medium"
    affected_versions: List[str] = field(default_factory=list)
    affected_packages: List[Dependency] = field(default_factory=list)
    paths: List[List[Dependency]] = field(default_factory=list)
    suggestion: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "package_name": self.package_name,
            "description": self.description,
            "severity": self.severity,
            "affected_versions": self.affected_versions,
            "affected_packages": [
                {
                    "name": dep.full_name,
                    "version": dep.version,
                    "depth": dep.depth,
                    "is_transitive": dep.is_transitive,
                }
                for dep in self.affected_packages
            ],
            "paths": [
                [
                    {"name": d.full_name, "version": d.version}
                    for d in path
                ]
                for path in self.paths
            ],
            "suggestion": self.suggestion,
        }


@dataclass
class AnalysisResult:
    tree: DependencyTree
    conflicts: List[Conflict] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tree": self.tree.to_dict(),
            "conflicts": [c.to_dict() for c in self.conflicts],
            "summary": {
                "total_conflicts": len(self.conflicts),
                "by_type": self._count_by_type(),
                "by_severity": self._count_by_severity(),
                **self.summary,
            },
        }

    def _count_by_type(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for c in self.conflicts:
            t = c.type.value
            counts[t] = counts.get(t, 0) + 1
        return counts

    def _count_by_severity(self) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for c in self.conflicts:
            s = c.severity
            counts[s] = counts.get(s, 0) + 1
        return counts
