from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.structural_variant import StructuralVariant, SVType

router = APIRouter(prefix="/api/structural-variants", tags=["structural_variants"])


@router.get("")
def list_structural_variants(
    page: int = 1,
    page_size: int = 50,
    task_id: Optional[str] = None,
    chromosome: Optional[str] = None,
    sv_type: Optional[SVType] = None,
    min_quality: Optional[float] = None,
    min_read_depth: Optional[int] = None,
    min_allele_frequency: Optional[float] = None,
    db: Session = Depends(get_db),
):
    query = db.query(StructuralVariant)

    if task_id:
        query = query.filter(StructuralVariant.task_id == task_id)
    if chromosome:
        query = query.filter(StructuralVariant.chromosome_1 == chromosome)
    if sv_type:
        query = query.filter(StructuralVariant.sv_type == sv_type)
    if min_quality is not None:
        query = query.filter(StructuralVariant.quality >= min_quality)
    if min_read_depth is not None:
        query = query.filter(StructuralVariant.read_depth >= min_read_depth)
    if min_allele_frequency is not None:
        query = query.filter(StructuralVariant.allele_frequency >= min_allele_frequency)

    total = query.count()

    svs = query.order_by(
        StructuralVariant.chromosome_1,
        StructuralVariant.position_1,
    ).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": svs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "filters": {
            "task_id": task_id,
            "chromosome": chromosome,
            "sv_type": sv_type,
            "min_quality": min_quality,
            "min_read_depth": min_read_depth,
            "min_allele_frequency": min_allele_frequency,
        },
    }


@router.get("/{sv_id}")
def get_structural_variant(sv_id: str, db: Session = Depends(get_db)):
    sv = db.query(StructuralVariant).filter(
        StructuralVariant.sv_id == sv_id
    ).first()

    if not sv:
        raise HTTPException(status_code=404, detail="Structural variant not found")

    return sv


@router.get("/{sv_id}/supporting-reads")
def get_sv_supporting_reads(
    sv_id: str,
    db: Session = Depends(get_db),
):
    sv = db.query(StructuralVariant).filter(
        StructuralVariant.sv_id == sv_id
    ).first()

    if not sv:
        raise HTTPException(status_code=404, detail="Structural variant not found")

    import random

    mock_reads = []
    read_count = min(sv.supporting_reads or 10, 20)

    for i in range(read_count):
        is_split = i < (sv.split_reads or 0)
        is_discordant = i < (sv.discordant_pairs or 0) and not is_split

        read_length = random.randint(500, 20000) if sv.sv_type in [SVType.DELETION, SVType.DUPLICATION] else random.randint(100, 300)

        if sv.sv_type == SVType.TRANSLOCATION and sv.chromosome_2 and sv.position_2:
            pos1 = sv.position_1 + random.randint(-500, 500)
            pos2 = sv.position_2 + random.randint(-500, 500)
        else:
            pos1 = sv.position_1 + random.randint(-2000, 2000)
            pos2 = None

        mock_reads.append({
            "read_id": f"read_{sv_id}_{i}",
            "chromosome_1": sv.chromosome_1,
            "position_1": max(1, pos1),
            "chromosome_2": sv.chromosome_2,
            "position_2": pos2,
            "read_length": read_length,
            "mapq": random.randint(30, 60),
            "is_split": is_split,
            "is_discordant": is_discordant,
            "is_supplementary": is_split,
            "strand": random.choice(["+", "-"]),
            "cigar": f"{read_length}M" if not is_split else f"{random.randint(50, 100)}M...{random.randint(50, 100)}M",
        })

    return {
        "sv_id": sv_id,
        "total_supporting": sv.supporting_reads,
        "split_reads": sv.split_reads,
        "discordant_pairs": sv.discordant_pairs,
        "reads": mock_reads,
    }


@router.get("/task/{task_id}/breakpoints")
def get_sv_breakpoints_for_task(
    task_id: str,
    chromosome: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(StructuralVariant).filter(
        StructuralVariant.task_id == task_id
    )

    if chromosome:
        query = query.filter(StructuralVariant.chromosome_1 == chromosome)

    svs = query.all()

    breakpoints = []
    for sv in svs:
        breakpoints.append({
            "sv_id": sv.sv_id,
            "sv_type": sv.sv_type,
            "breakpoint_1": {
                "chromosome": sv.chromosome_1,
                "position": sv.position_1,
            },
            "breakpoint_2": {
                "chromosome": sv.chromosome_2,
                "position": sv.position_2,
            } if sv.chromosome_2 and sv.position_2 else None,
            "quality": sv.quality,
            "allele_frequency": sv.allele_frequency,
            "supporting_reads": sv.supporting_reads,
            "gene_1": sv.gene_1,
            "gene_2": sv.gene_2,
        })

    return {
        "task_id": task_id,
        "chromosome": chromosome,
        "breakpoints": breakpoints,
        "total": len(breakpoints),
    }
