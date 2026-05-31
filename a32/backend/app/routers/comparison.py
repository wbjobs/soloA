import uuid
import random
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.sample import Sample
from ..models.sample_pair import SamplePair, SomaticVariant

router = APIRouter(prefix="/api/comparison", tags=["comparison"])


@router.post("/pairs")
def create_sample_pair(
    tumor_sample_id: str,
    normal_sample_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    db: Session = Depends(get_db),
):
    tumor_sample = db.query(Sample).filter(
        Sample.sample_id == tumor_sample_id
    ).first()

    normal_sample = db.query(Sample).filter(
        Sample.sample_id == normal_sample_id
    ).first()

    if not tumor_sample:
        raise HTTPException(status_code=404, detail=f"Tumor sample {tumor_sample_id} not found")

    if not normal_sample:
        raise HTTPException(status_code=404, detail=f"Normal sample {normal_sample_id} not found")

    pair = SamplePair(
        pair_id=f"pair_{uuid.uuid4().hex[:12]}",
        tumor_sample_id=tumor_sample_id,
        normal_sample_id=normal_sample_id,
        name=name or f"{tumor_sample.name} vs {normal_sample.name}",
        description=description,
    )

    db.add(pair)
    db.commit()
    db.refresh(pair)

    return pair


@router.get("/pairs")
def list_sample_pairs(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    total = db.query(SamplePair).count()
    pairs = db.query(SamplePair).order_by(
        SamplePair.created_at.desc()
    ).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": pairs,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/pairs/{pair_id}")
def get_sample_pair(pair_id: str, db: Session = Depends(get_db)):
    pair = db.query(SamplePair).filter(
        SamplePair.pair_id == pair_id
    ).first()

    if not pair:
        raise HTTPException(status_code=404, detail="Sample pair not found")

    tumor_sample = db.query(Sample).filter(
        Sample.sample_id == pair.tumor_sample_id
    ).first()

    normal_sample = db.query(Sample).filter(
        Sample.sample_id == pair.normal_sample_id
    ).first()

    return {
        "pair": pair,
        "tumor_sample": tumor_sample,
        "normal_sample": normal_sample,
    }


@router.get("/pairs/{pair_id}/somatic-variants")
def get_somatic_variants(
    pair_id: str,
    chromosome: Optional[str] = None,
    min_tumor_af: Optional[float] = None,
    max_normal_af: Optional[float] = None,
    min_quality: Optional[float] = None,
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
):
    pair = db.query(SamplePair).filter(
        SamplePair.pair_id == pair_id
    ).first()

    if not pair:
        raise HTTPException(status_code=404, detail="Sample pair not found")

    existing_variants = db.query(SomaticVariant).filter(
        SomaticVariant.pair_id == pair_id
    ).count()

    if existing_variants == 0:
        mock_somatic_variants = []
        chromosomes = [f"chr{i}" for i in range(1, 23)] + ["chrX"]
        genes = {
            "chr1": "EGFR",
            "chr7": "BRAF",
            "chr9": "CDKN2A",
            "chr10": "PTEN",
            "chr12": "KRAS",
            "chr13": "BRCA2",
            "chr17": "TP53",
        }

        for i in range(25):
            chrom = random.choice(chromosomes)
            pos = random.randint(1000000, 100000000)
            ref = random.choice(["A", "C", "G", "T"])
            alt = random.choice([b for b in ["A", "C", "G", "T"] if b != ref])

            tumor_af = round(random.uniform(0.05, 0.95), 4)
            normal_af = round(random.uniform(0, 0.02), 4)
            tumor_depth = random.randint(30, 150)
            normal_depth = random.randint(20, 100)
            tumor_alt_depth = int(tumor_depth * tumor_af)
            normal_alt_depth = int(normal_depth * normal_af)

            somatic_variant = SomaticVariant(
                somatic_id=f"somatic_{uuid.uuid4().hex}",
                pair_id=pair_id,
                chromosome=chrom,
                position=pos,
                ref_allele=ref,
                alt_allele=alt,
                variant_type="SNP" if len(ref) == len(alt) == 1 else ("INS" if len(alt) > len(ref) else "DEL"),
                tumor_af=tumor_af,
                normal_af=normal_af,
                tumor_depth=tumor_depth,
                normal_depth=normal_depth,
                tumor_alt_depth=tumor_alt_depth,
                normal_alt_depth=normal_alt_depth,
                quality=round(random.uniform(50.0, 200.0), 1),
                filter_status="PASS",
                somatic_status="somatic" if normal_af < 0.01 else "LOH",
                vaf_difference=round(tumor_af - normal_af, 4),
            )
            mock_somatic_variants.append(somatic_variant)
            db.add(somatic_variant)

        db.commit()

    query = db.query(SomaticVariant).filter(
        SomaticVariant.pair_id == pair_id
    )

    if chromosome:
        query = query.filter(SomaticVariant.chromosome == chromosome)
    if min_tumor_af is not None:
        query = query.filter(SomaticVariant.tumor_af >= min_tumor_af)
    if max_normal_af is not None:
        query = query.filter(SomaticVariant.normal_af <= max_normal_af)
    if min_quality is not None:
        query = query.filter(SomaticVariant.quality >= min_quality)

    total = query.count()
    variants = query.order_by(
        SomaticVariant.chromosome,
        SomaticVariant.position,
    ).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "items": variants,
        "total": total,
        "page": page,
        "page_size": page_size,
        "filters": {
            "chromosome": chromosome,
            "min_tumor_af": min_tumor_af,
            "max_normal_af": max_normal_af,
            "min_quality": min_quality,
        },
    }


@router.get("/pairs/{pair_id}/coverage-comparison")
def get_coverage_comparison(
    pair_id: str,
    chromosome: str,
    start: int,
    end: int,
    bin_size: Optional[int] = None,
    db: Session = Depends(get_db),
):
    pair = db.query(SamplePair).filter(
        SamplePair.pair_id == pair_id
    ).first()

    if not pair:
        raise HTTPException(status_code=404, detail="Sample pair not found")

    region_length = end - start
    if bin_size is None:
        import math
        bin_size = max(1, math.ceil(region_length / 500))

    num_bins = math.ceil(region_length / bin_size)

    tumor_coverage = []
    normal_coverage = []

    for i in range(num_bins):
        bin_start = start + i * bin_size

        base_tumor_cov = random.randint(30, 80)
        base_normal_cov = random.randint(25, 60)

        has_cnv = random.random() < 0.05
        if has_cnv:
            cnv_type = random.choice(["gain", "loss"])
            if cnv_type == "gain":
                base_tumor_cov = int(base_tumor_cov * random.uniform(1.5, 3.0))
            else:
                base_tumor_cov = int(base_tumor_cov * random.uniform(0.1, 0.5))

        tumor_coverage.append({
            "position": bin_start,
            "depth": base_tumor_cov + random.randint(-10, 10),
        })

        normal_coverage.append({
            "position": bin_start,
            "depth": base_normal_cov + random.randint(-8, 8),
        })

    return {
        "pair_id": pair_id,
        "chromosome": chromosome,
        "start": start,
        "end": end,
        "bin_size": bin_size,
        "tumor_coverage": tumor_coverage,
        "normal_coverage": normal_coverage,
        "stats": {
            "tumor_avg": sum(c["depth"] for c in tumor_coverage) / len(tumor_coverage),
            "normal_avg": sum(c["depth"] for c in normal_coverage) / len(normal_coverage),
            "tumor_max": max(c["depth"] for c in tumor_coverage),
            "normal_max": max(c["depth"] for c in normal_coverage),
        },
    }


@router.get("/pairs/{pair_id}/baf-plot")
def get_baf_plot(
    pair_id: str,
    chromosome: str,
    start: int,
    end: int,
    db: Session = Depends(get_db),
):
    pair = db.query(SamplePair).filter(
        SamplePair.pair_id == pair_id
    ).first()

    if not pair:
        raise HTTPException(status_code=404, detail="Sample pair not found")

    num_points = 200
    step = (end - start) // num_points

    tumor_bafs = []
    normal_bafs = []

    for i in range(num_points):
        pos = start + i * step

        normal_baf = random.uniform(0.4, 0.6)
        has_loh = random.random() < 0.08

        if has_loh:
            tumor_baf = random.choice([random.uniform(0, 0.1), random.uniform(0.9, 1.0)])
        else:
            tumor_baf = random.uniform(0.35, 0.65)

        tumor_bafs.append({
            "position": pos,
            "baf": round(tumor_baf, 4),
            "depth": random.randint(20, 100),
        })

        normal_bafs.append({
            "position": pos,
            "baf": round(normal_baf, 4),
            "depth": random.randint(15, 80),
        })

    return {
        "pair_id": pair_id,
        "chromosome": chromosome,
        "start": start,
        "end": end,
        "tumor_baf": tumor_bafs,
        "normal_baf": normal_bafs,
    }
