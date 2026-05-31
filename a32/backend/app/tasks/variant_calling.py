import uuid
import random
from datetime import datetime
from typing import List

from ..celery_app import celery_app
from ..database import SessionLocal
from ..models.task import AnalysisTask, TaskStatus
from ..models.variant import Variant, VariantType
from ..models.sample import Sample


MIN_READ_DEPTH = 10
MIN_QUALITY = 30.0
MIN_ALLELE_FREQUENCY = 0.05


def _determine_variant_type(ref: str, alt: str) -> VariantType:
    if len(ref) == len(alt) == 1:
        return VariantType.SNP
    elif len(ref) < len(alt):
        return VariantType.INS
    elif len(ref) > len(alt):
        return VariantType.DEL
    else:
        return VariantType.MNP


def _filter_variants(variants: List[Variant]) -> List[Variant]:
    filtered = []
    for variant in variants:
        read_depth = variant.read_depth or 0
        quality = variant.quality or 0
        allele_frequency = variant.allele_frequency or 0

        if read_depth < MIN_READ_DEPTH:
            variant.filter_status = "LowDepth"
        elif quality < MIN_QUALITY:
            variant.filter_status = "LowQual"
        elif allele_frequency < MIN_ALLELE_FREQUENCY:
            variant.filter_status = "LowAF"
        else:
            variant.filter_status = "PASS"
            filtered.append(variant)

    return filtered


def _generate_mock_variants(task: AnalysisTask, sample: Sample, num_variants: int = 50) -> List[Variant]:
    variants = []

    chromosomes = [f"chr{i}" for i in range(1, 23)] + ["chrX", "chrY"]
    genes = {
        "chr1": ["BRCA1", 1000000, 2000000],
        "chr13": ["BRCA2", 32000000, 33000000],
        "chr17": ["TP53", 41000000, 42000000],
        "chr5": ["APC", 112000000, 113000000],
        "chr7": ["CFTR", 117000000, 118000000],
    }

    variants.append(
        Variant(
            variant_id=f"var_{uuid.uuid4().hex}",
            task_id=task.task_id,
            chromosome="chr1",
            position=1234567,
            ref_allele="A",
            alt_allele="T",
            variant_type=VariantType.SNP,
            quality=99.9,
            filter_status="PASS",
            read_depth=58,
            alt_depth=29,
            allele_frequency=0.5,
            genotype="0/1",
        )
    )

    variants.append(
        Variant(
            variant_id=f"var_{uuid.uuid4().hex}",
            task_id=task.task_id,
            chromosome="chr13",
            position=32914058,
            ref_allele="G",
            alt_allele="A",
            variant_type=VariantType.SNP,
            quality=95.5,
            filter_status="PASS",
            read_depth=42,
            alt_depth=21,
            allele_frequency=0.5,
            genotype="0/1",
        )
    )

    variants.append(
        Variant(
            variant_id=f"var_{uuid.uuid4().hex}",
            task_id=task.task_id,
            chromosome="chr17",
            position=41244944,
            ref_allele="G",
            alt_allele="A",
            variant_type=VariantType.SNP,
            quality=88.3,
            filter_status="PASS",
            read_depth=65,
            alt_depth=32,
            allele_frequency=0.49,
            genotype="0/1",
        )
    )

    remaining = num_variants - len(variants)
    for i in range(remaining):
        chrom = random.choice(chromosomes)

        if chrom in genes:
            _, gene_start, gene_end = genes[chrom]
            pos = random.randint(gene_start, gene_end)
        else:
            pos = random.randint(1000000, 100000000)

        ref = random.choice(["A", "C", "G", "T"])
        alt = random.choice([b for b in ["A", "C", "G", "T"] if b != ref])

        variant_type = _determine_variant_type(ref, alt)
        quality = round(random.uniform(20.0, 100.0), 1)
        read_depth = random.randint(10, 100)
        alt_depth = random.randint(1, read_depth)
        allele_frequency = round(alt_depth / read_depth, 2)

        variants.append(
            Variant(
                variant_id=f"var_{uuid.uuid4().hex}",
                task_id=task.task_id,
                chromosome=chrom,
                position=pos,
                ref_allele=ref,
                alt_allele=alt,
                variant_type=variant_type,
                quality=quality,
                filter_status=None,
                read_depth=read_depth,
                alt_depth=alt_depth,
                allele_frequency=allele_frequency,
                genotype="0/1" if allele_frequency < 0.9 else "1/1",
            )
        )

    return variants


@celery_app.task(bind=True, name="run_variant_calling")
def run_variant_calling(self, task_id: str):
    db = SessionLocal()

    try:
        task = db.query(AnalysisTask).filter(
            AnalysisTask.task_id == task_id
        ).first()

        if not task:
            raise ValueError(f"Task {task_id} not found")

        sample = db.query(Sample).filter(
            Sample.sample_id == task.sample_id
        ).first()

        if not sample:
            raise ValueError(f"Sample {task.sample_id} not found")

        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        db.commit()

        self.update_state(state="PROGRESS", meta={"stage": "quality_control", "progress": 10})

        import time
        time.sleep(0.5)

        self.update_state(state="PROGRESS", meta={"stage": "variant_calling", "progress": 40})

        raw_variants = _generate_mock_variants(task, sample)

        self.update_state(state="PROGRESS", meta={"stage": "variant_filtering", "progress": 60})

        pass_variants = _filter_variants(raw_variants)

        self.update_state(state="PROGRESS", meta={"stage": "saving_results", "progress": 80})

        for variant in raw_variants:
            db.add(variant)

        task.status = TaskStatus.SUCCESS
        task.completed_at = datetime.utcnow()
        task.result_summary = {
            "total_variants": len(raw_variants),
            "pass_variants": len(pass_variants),
            "filtered_out": len(raw_variants) - len(pass_variants),
            "snp_count": sum(1 for v in pass_variants if v.variant_type == VariantType.SNP),
            "indel_count": sum(1 for v in pass_variants if v.variant_type in [VariantType.INS, VariantType.DEL]),
            "filters": {
                "min_read_depth": MIN_READ_DEPTH,
                "min_quality": MIN_QUALITY,
                "min_allele_frequency": MIN_ALLELE_FREQUENCY,
            },
        }

        db.commit()

        return {
            "task_id": task_id,
            "status": "success",
            "total_variants": len(raw_variants),
            "pass_variants": len(pass_variants),
        }

    except Exception as e:
        task = db.query(AnalysisTask).filter(
            AnalysisTask.task_id == task_id
        ).first()

        if task:
            task.status = TaskStatus.FAILED
            task.error_message = str(e)
            task.completed_at = datetime.utcnow()
            db.commit()

        raise

    finally:
        db.close()
