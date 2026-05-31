from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.sample import Sample
from ..services.bam_service import get_bam_service

router = APIRouter(prefix="/api/visualization", tags=["visualization"])


@router.get("/{sample_id}/chromosomes")
def get_chromosomes(sample_id: str, db: Session = Depends(get_db)):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if not sample.bam_object_name:
        raise HTTPException(status_code=400, detail="Sample has no BAM file")

    bam_service = get_bam_service()

    try:
        chromosome_lengths = bam_service.get_chromosome_lengths(sample.bam_object_name)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading BAM file: {str(e)}")

    return {
        "sample_id": sample_id,
        "chromosomes": chromosome_lengths,
    }


@router.get("/{sample_id}/coverage")
def get_coverage(
    sample_id: str,
    chromosome: str,
    start: int,
    end: int,
    bin_size: Optional[int] = None,
    db: Session = Depends(get_db),
):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if not sample.bam_object_name:
        raise HTTPException(status_code=400, detail="Sample has no BAM file")

    if start >= end:
        raise HTTPException(status_code=400, detail="Start must be less than end")

    bam_service = get_bam_service()

    try:
        coverage_points, stats = bam_service.calculate_coverage(
            bam_object_name=sample.bam_object_name,
            chromosome=chromosome,
            start=start,
            end=end,
            bai_object_name=sample.bai_object_name,
            bin_size=bin_size,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error calculating coverage: {str(e)}")

    return {
        "sample_id": sample_id,
        "chromosome": chromosome,
        "start": start,
        "end": end,
        "stats": stats,
        "coverage": [
            {"position": cp.position, "depth": cp.depth}
            for cp in coverage_points
        ],
    }


@router.get("/{sample_id}/reads")
def get_reads(
    sample_id: str,
    chromosome: str,
    start: int,
    end: int,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if not sample.bam_object_name:
        raise HTTPException(status_code=400, detail="Sample has no BAM file")

    if start >= end:
        raise HTTPException(status_code=400, detail="Start must be less than end")

    bam_service = get_bam_service()

    try:
        reads = bam_service.get_reads_in_region(
            bam_object_name=sample.bam_object_name,
            chromosome=chromosome,
            start=start,
            end=end,
            bai_object_name=sample.bai_object_name,
            limit=limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching reads: {str(e)}")

    return {
        "sample_id": sample_id,
        "chromosome": chromosome,
        "start": start,
        "end": end,
        "reads": [
            {
                "qname": r.qname,
                "pos": r.pos,
                "mapq": r.mapq,
                "cigar": r.cigar,
                "seq": r.seq,
                "is_reverse": r.is_reverse,
                "is_secondary": r.is_secondary,
            }
            for r in reads
        ],
        "total": len(reads),
    }
