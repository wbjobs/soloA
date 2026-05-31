from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.models import (
    Experiment,
    ExperimentBranch,
    ExperimentVersion,
    ExperimentMerge,
)


def _version_to_dict(version: ExperimentVersion) -> Dict[str, Any]:
    return {
        "id": version.id,
        "version_number": version.version_number,
        "commit_message": version.commit_message,
        "created_by": version.created_by,
        "title": version.title,
        "researcher": version.researcher,
        "experiment_date": version.experiment_date.isoformat() if version.experiment_date else None,
        "status": version.status,
        "temperature": version.temperature,
        "pressure": version.pressure,
        "solvent": version.solvent,
        "catalyst": version.catalyst,
        "reaction_time": version.reaction_time,
        "yield_percent": version.yield_percent,
        "notes": version.notes,
        "reaction_conditions": version.reaction_conditions,
        "results": version.results,
        "parent_version_id": version.parent_version_id,
        "created_at": version.created_at.isoformat(),
    }


def create_initial_branch(
    db: Session,
    experiment: Experiment,
    created_by: str = "system",
) -> ExperimentBranch:
    branch = ExperimentBranch(
        name="main",
        experiment_id=experiment.id,
        parent_branch_id=None,
        base_version_id=None,
        created_by=created_by,
        description="Main branch for this experiment",
    )
    db.add(branch)
    db.flush()

    exp_date = datetime.now()
    if isinstance(experiment.experiment_date, str):
        try:
            exp_date = datetime.fromisoformat(experiment.experiment_date)
        except Exception:
            pass
    elif hasattr(experiment.experiment_date, "isoformat"):
        exp_date = experiment.experiment_date

    version = ExperimentVersion(
        branch_id=branch.id,
        version_number=1,
        commit_message="Initial version",
        created_by=created_by,
        title=experiment.title,
        researcher=experiment.researcher,
        experiment_date=exp_date,
        status=experiment.status,
        temperature=experiment.temperature,
        pressure=experiment.pressure,
        solvent=experiment.solvent,
        catalyst=experiment.catalyst,
        reaction_time=experiment.reaction_time,
        yield_percent=experiment.yield_percent,
        notes=experiment.notes,
        reaction_conditions=experiment.reaction_conditions,
        results=experiment.results,
        parent_version_id=None,
    )
    db.add(version)
    db.commit()
    db.refresh(branch)

    return branch


def get_or_create_main_branch(
    db: Session,
    experiment_id: int,
    created_by: str = "system",
) -> ExperimentBranch:
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise ValueError(f"Experiment {experiment_id} not found")

    branch = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == "main",
    ).first()

    if not branch:
        branch = create_initial_branch(db, experiment, created_by)

    return branch


def create_branch(
    db: Session,
    experiment_id: int,
    branch_name: str,
    source_branch_name: str = "main",
    created_by: str = "user",
    description: Optional[str] = None,
) -> Dict[str, Any]:
    experiment = db.query(Experiment).filter(Experiment.id == experiment_id).first()
    if not experiment:
        raise ValueError(f"Experiment {experiment_id} not found")

    existing = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == branch_name,
    ).first()

    if existing:
        raise ValueError(f"Branch '{branch_name}' already exists")

    source_branch = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == source_branch_name,
    ).first()

    if not source_branch:
        raise ValueError(f"Source branch '{source_branch_name}' not found")

    latest_version = db.query(ExperimentVersion).filter(
        ExperimentVersion.branch_id == source_branch.id,
    ).order_by(desc(ExperimentVersion.version_number)).first()

    if not latest_version:
        raise ValueError("Source branch has no versions")

    new_branch = ExperimentBranch(
        name=branch_name,
        experiment_id=experiment_id,
        parent_branch_id=source_branch.id,
        base_version_id=latest_version.id,
        created_by=created_by,
        description=description or f"Branch created from {source_branch_name} at v{latest_version.version_number}",
    )
    db.add(new_branch)
    db.flush()

    new_version = ExperimentVersion(
        branch_id=new_branch.id,
        version_number=1,
        commit_message=f"Branch created from {source_branch_name}",
        created_by=created_by,
        title=latest_version.title,
        researcher=latest_version.researcher,
        experiment_date=latest_version.experiment_date,
        status=latest_version.status,
        temperature=latest_version.temperature,
        pressure=latest_version.pressure,
        solvent=latest_version.solvent,
        catalyst=latest_version.catalyst,
        reaction_time=latest_version.reaction_time,
        yield_percent=latest_version.yield_percent,
        notes=latest_version.notes,
        reaction_conditions=latest_version.reaction_conditions,
        results=latest_version.results,
        parent_version_id=latest_version.id,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_branch)

    return {
        "branch": {
            "id": new_branch.id,
            "name": new_branch.name,
            "parent_branch_name": source_branch_name,
            "base_version": latest_version.version_number,
            "created_by": new_branch.created_by,
            "description": new_branch.description,
            "created_at": new_branch.created_at.isoformat(),
        },
        "first_version": _version_to_dict(new_version),
    }


def create_version(
    db: Session,
    experiment_id: int,
    branch_name: str,
    commit_message: str,
    created_by: str,
    updates: Dict[str, Any],
) -> Dict[str, Any]:
    branch = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == branch_name,
    ).first()

    if not branch:
        raise ValueError(f"Branch '{branch_name}' not found")

    latest_version = db.query(ExperimentVersion).filter(
        ExperimentVersion.branch_id == branch.id,
    ).order_by(desc(ExperimentVersion.version_number)).first()

    if not latest_version:
        raise ValueError("Branch has no versions")

    new_version_number = latest_version.version_number + 1

    version_data = {
        "title": updates.get("title", latest_version.title),
        "researcher": updates.get("researcher", latest_version.researcher),
        "experiment_date": updates.get("experiment_date", latest_version.experiment_date),
        "status": updates.get("status", latest_version.status),
        "temperature": updates.get("temperature", latest_version.temperature),
        "pressure": updates.get("pressure", latest_version.pressure),
        "solvent": updates.get("solvent", latest_version.solvent),
        "catalyst": updates.get("catalyst", latest_version.catalyst),
        "reaction_time": updates.get("reaction_time", latest_version.reaction_time),
        "yield_percent": updates.get("yield_percent", latest_version.yield_percent),
        "notes": updates.get("notes", latest_version.notes),
        "reaction_conditions": updates.get("reaction_conditions", latest_version.reaction_conditions),
        "results": updates.get("results", latest_version.results),
    }

    if isinstance(version_data["experiment_date"], str):
        version_data["experiment_date"] = datetime.fromisoformat(version_data["experiment_date"])

    new_version = ExperimentVersion(
        branch_id=branch.id,
        version_number=new_version_number,
        commit_message=commit_message,
        created_by=created_by,
        parent_version_id=latest_version.id,
        **version_data,
    )
    db.add(new_version)
    db.commit()
    db.refresh(new_version)

    old_dict = _version_to_dict(latest_version)
    new_dict = _version_to_dict(new_version)

    changes = {}
    ignore_fields = {"id", "version_number", "commit_message", "created_by", "parent_version_id", "created_at"}

    for key in old_dict:
        if key in ignore_fields:
            continue
        if old_dict[key] != new_dict[key]:
            changes[key] = {
                "old": old_dict[key],
                "new": new_dict[key],
            }

    return {
        "version": _version_to_dict(new_version),
        "changes": changes,
        "branch_name": branch_name,
    }


def list_branches(db: Session, experiment_id: int) -> List[Dict[str, Any]]:
    branches = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
    ).order_by(ExperimentBranch.created_at).all()

    result = []
    for branch in branches:
        versions = db.query(ExperimentVersion).filter(
            ExperimentVersion.branch_id == branch.id,
        ).order_by(ExperimentVersion.version_number).all()

        parent_branch = None
        if branch.parent_branch_id:
            pb = db.query(ExperimentBranch).filter(ExperimentBranch.id == branch.parent_branch_id).first()
            parent_branch = pb.name if pb else None

        result.append({
            "id": branch.id,
            "name": branch.name,
            "parent_branch": parent_branch,
            "created_by": branch.created_by,
            "description": branch.description,
            "created_at": branch.created_at.isoformat(),
            "updated_at": branch.updated_at.isoformat(),
            "version_count": len(versions),
            "latest_version": _version_to_dict(versions[-1]) if versions else None,
        })

    return result


def list_versions(db: Session, experiment_id: int, branch_name: str) -> List[Dict[str, Any]]:
    branch = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == branch_name,
    ).first()

    if not branch:
        raise ValueError(f"Branch '{branch_name}' not found")

    versions = db.query(ExperimentVersion).filter(
        ExperimentVersion.branch_id == branch.id,
    ).order_by(ExperimentVersion.version_number).all()

    return [_version_to_dict(v) for v in versions]


def compare_versions(
    db: Session,
    version1_id: int,
    version2_id: int,
) -> Dict[str, Any]:
    v1 = db.query(ExperimentVersion).filter(ExperimentVersion.id == version1_id).first()
    v2 = db.query(ExperimentVersion).filter(ExperimentVersion.id == version2_id).first()

    if not v1 or not v2:
        raise ValueError("One or both versions not found")

    dict1 = _version_to_dict(v1)
    dict2 = _version_to_dict(v2)

    differences = {}
    ignore_fields = {"id", "version_number", "commit_message", "created_by", "parent_version_id", "created_at"}

    all_keys = set(dict1.keys()) | set(dict2.keys())

    for key in all_keys:
        if key in ignore_fields:
            continue
        val1 = dict1.get(key)
        val2 = dict2.get(key)
        if val1 != val2:
            differences[key] = {
                "version1": val1,
                "version2": val2,
            }

    return {
        "version1": _version_to_dict(v1),
        "version2": _version_to_dict(v2),
        "differences": differences,
        "has_conflicts": len(differences) > 0,
        "conflict_count": len(differences),
    }


def detect_conflicts(
    source_version: ExperimentVersion,
    target_version: ExperimentVersion,
    base_version: Optional[ExperimentVersion] = None,
) -> List[Dict[str, Any]]:
    conflicts = []
    ignore_fields = {"id", "version_number", "commit_message", "created_by", "parent_version_id", "created_at", "experiment_date"}

    source_dict = _version_to_dict(source_version)
    target_dict = _version_to_dict(target_version)
    base_dict = _version_to_dict(base_version) if base_version else {}

    for key in source_dict:
        if key in ignore_fields:
            continue

        source_val = source_dict.get(key)
        target_val = target_dict.get(key)
        base_val = base_dict.get(key)

        if source_val != target_val:
            conflict_type = "modified_both"
            if base_val is not None:
                if source_val == base_val and target_val != base_val:
                    conflict_type = "modified_target_only"
                elif target_val == base_val and source_val != base_val:
                    conflict_type = "modified_source_only"

            conflicts.append({
                "field": key,
                "source_value": source_val,
                "target_value": target_val,
                "base_value": base_val,
                "type": conflict_type,
            })

    return conflicts


def create_merge_request(
    db: Session,
    experiment_id: int,
    source_branch_name: str,
    target_branch_name: str,
    created_by: str,
) -> Dict[str, Any]:
    source_branch = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == source_branch_name,
    ).first()

    target_branch = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
        ExperimentBranch.name == target_branch_name,
    ).first()

    if not source_branch or not target_branch:
        raise ValueError("One or both branches not found")

    source_version = db.query(ExperimentVersion).filter(
        ExperimentVersion.branch_id == source_branch.id,
    ).order_by(desc(ExperimentVersion.version_number)).first()

    target_version = db.query(ExperimentVersion).filter(
        ExperimentVersion.branch_id == target_branch.id,
    ).order_by(desc(ExperimentVersion.version_number)).first()

    if not source_version or not target_version:
        raise ValueError("One or both branches have no versions")

    base_version = None
    if source_branch.parent_branch_id == target_branch.id and source_branch.base_version_id:
        base_version = db.query(ExperimentVersion).filter(
            ExperimentVersion.id == source_branch.base_version_id,
        ).first()

    conflicts = detect_conflicts(source_version, target_version, base_version)

    merge = ExperimentMerge(
        source_branch_id=source_branch.id,
        target_branch_id=target_branch.id,
        source_version_id=source_version.id,
        target_version_id=target_version.id,
        merge_status="pending" if conflicts else "ready",
        conflicts=conflicts,
        resolved_conflicts=[],
        created_by=created_by,
    )
    db.add(merge)
    db.commit()
    db.refresh(merge)

    return {
        "merge_id": merge.id,
        "source_branch": source_branch_name,
        "target_branch": target_branch_name,
        "status": merge.merge_status,
        "conflicts": conflicts,
        "has_conflicts": len(conflicts) > 0,
        "created_at": merge.created_at.isoformat(),
    }


def resolve_merge_conflict(
    db: Session,
    merge_id: int,
    field: str,
    resolution: str,
    resolved_by: str,
) -> Dict[str, Any]:
    merge = db.query(ExperimentMerge).filter(ExperimentMerge.id == merge_id).first()

    if not merge:
        raise ValueError("Merge request not found")

    if merge.merge_status == "merged":
        raise ValueError("Merge already completed")

    conflicts = merge.conflicts or []
    resolved = merge.resolved_conflicts or []

    conflict_to_resolve = None
    for c in conflicts:
        if c["field"] == field:
            conflict_to_resolve = c
            break

    if not conflict_to_resolve:
        raise ValueError(f"No conflict for field: {field}")

    resolved_value = conflict_to_resolve["source_value"] if resolution == "source" else conflict_to_resolve["target_value"]

    resolved.append({
        "field": field,
        "resolution": resolution,
        "resolved_value": resolved_value,
        "resolved_by": resolved_by,
        "resolved_at": datetime.now().isoformat(),
    })

    merge.resolved_conflicts = resolved

    remaining_conflicts = [c for c in conflicts if c["field"] not in [r["field"] for r in resolved]]

    if not remaining_conflicts:
        merge.merge_status = "ready"

    db.commit()
    db.refresh(merge)

    return {
        "merge_id": merge.id,
        "status": merge.merge_status,
        "resolved": resolved,
        "remaining_conflicts": remaining_conflicts,
    }


def execute_merge(
    db: Session,
    merge_id: int,
    commit_message: str,
    merged_by: str,
) -> Dict[str, Any]:
    merge = db.query(ExperimentMerge).filter(ExperimentMerge.id == merge_id).first()

    if not merge:
        raise ValueError("Merge request not found")

    if merge.merge_status != "ready":
        raise ValueError(f"Merge not ready. Current status: {merge.merge_status}")

    source_branch = db.query(ExperimentBranch).filter(ExperimentBranch.id == merge.source_branch_id).first()
    target_branch = db.query(ExperimentBranch).filter(ExperimentBranch.id == merge.target_branch_id).first()
    source_version = db.query(ExperimentVersion).filter(ExperimentVersion.id == merge.source_version_id).first()
    target_version = db.query(ExperimentVersion).filter(ExperimentVersion.id == merge.target_version_id).first()

    if not all([source_branch, target_branch, source_version, target_version]):
        raise ValueError("Missing branch or version data")

    latest_target_version = db.query(ExperimentVersion).filter(
        ExperimentVersion.branch_id == target_branch.id,
    ).order_by(desc(ExperimentVersion.version_number)).first()

    new_version_number = (latest_target_version.version_number if latest_target_version else 0) + 1

    merge_dict = _version_to_dict(target_version)
    source_dict = _version_to_dict(source_version)
    resolved = merge.resolved_conflicts or []

    for r in resolved:
        merge_dict[r["field"]] = r["resolved_value"]

    for field in source_dict:
        if field not in merge_dict or merge_dict[field] is None:
            if source_dict[field] is not None:
                merge_dict[field] = source_dict[field]

    ignore_fields = {"id", "version_number", "commit_message", "created_by", "parent_version_id", "created_at", "experiment_date"}

    update_dict = {}
    for key in merge_dict:
        if key not in ignore_fields:
            update_dict[key] = merge_dict[key]

    exp_date = datetime.now()
    if "experiment_date" in merge_dict and merge_dict["experiment_date"]:
        try:
            exp_date = datetime.fromisoformat(merge_dict["experiment_date"])
        except Exception:
            pass

    new_version = ExperimentVersion(
        branch_id=target_branch.id,
        version_number=new_version_number,
        commit_message=commit_message or f"Merge from {source_branch.name}",
        created_by=merged_by,
        experiment_date=exp_date,
        parent_version_id=target_version.id,
        **{k: v for k, v in update_dict.items() if k in [
            "title", "researcher", "status", "temperature", "pressure",
            "solvent", "catalyst", "reaction_time", "yield_percent",
            "notes", "reaction_conditions", "results"
        ]},
    )

    db.add(new_version)

    merge.merge_status = "merged"
    merge.resolved_by = merged_by
    merge.resolved_at = datetime.now()

    db.commit()
    db.refresh(new_version)
    db.refresh(merge)

    return {
        "status": "merged",
        "new_version": _version_to_dict(new_version),
        "target_branch": target_branch.name,
        "source_branch": source_branch.name,
        "resolved_conflicts": merge.resolved_conflicts,
        "merged_at": merge.resolved_at.isoformat() if merge.resolved_at else None,
    }


def list_merges(db: Session, experiment_id: int) -> List[Dict[str, Any]]:
    branches = db.query(ExperimentBranch).filter(
        ExperimentBranch.experiment_id == experiment_id,
    ).all()

    branch_ids = [b.id for b in branches]

    merges = db.query(ExperimentMerge).filter(
        ExperimentMerge.source_branch_id.in_(branch_ids) |
        ExperimentMerge.target_branch_id.in_(branch_ids),
    ).order_by(desc(ExperimentMerge.created_at)).all()

    result = []
    for merge in merges:
        source_branch = db.query(ExperimentBranch).filter(ExperimentBranch.id == merge.source_branch_id).first()
        target_branch = db.query(ExperimentBranch).filter(ExperimentBranch.id == merge.target_branch_id).first()

        result.append({
            "id": merge.id,
            "source_branch": source_branch.name if source_branch else None,
            "target_branch": target_branch.name if target_branch else None,
            "status": merge.merge_status,
            "conflict_count": len(merge.conflicts or []),
            "resolved_count": len(merge.resolved_conflicts or []),
            "created_by": merge.created_by,
            "resolved_by": merge.resolved_by,
            "created_at": merge.created_at.isoformat(),
            "resolved_at": merge.resolved_at.isoformat() if merge.resolved_at else None,
        })

    return result
