from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.variant import Variant, VariantType
from ..models.annotation import Annotation
from ..schemas.variant import VariantResponse, VariantListResponse

router = APIRouter(prefix="/api/variants", tags=["variants"])


@router.get("", response_model=VariantListResponse)
def list_variants(
    page: int = 1,
    page_size: int = 50,
    task_id: Optional[str] = None,
    chromosome: Optional[str] = None,
    min_quality: Optional[float] = None,
    min_read_depth: Optional[int] = None,
    min_allele_frequency: Optional[float] = None,
    max_allele_frequency: Optional[float] = None,
    variant_type: Optional[VariantType] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Variant)

    if task_id:
        query = query.filter(Variant.task_id == task_id)
    if chromosome:
        query = query.filter(Variant.chromosome == chromosome)
    if min_quality is not None:
        query = query.filter(Variant.quality >= min_quality)
    if min_read_depth is not None:
        query = query.filter(Variant.read_depth >= min_read_depth)
    if min_allele_frequency is not None:
        query = query.filter(Variant.allele_frequency >= min_allele_frequency)
    if max_allele_frequency is not None:
        query = query.filter(Variant.allele_frequency <= max_allele_frequency)
    if variant_type:
        query = query.filter(Variant.variant_type == variant_type)

    total = query.count()

    variants = query.order_by(
        Variant.chromosome,
        Variant.position,
    ).offset((page - 1) * page_size).limit(page_size).all()

    return VariantListResponse(
        items=[VariantResponse.model_validate(v) for v in variants],
        total=total,
        page=page,
        page_size=page_size,
        filters={
            "task_id": task_id,
            "chromosome": chromosome,
            "min_quality": min_quality,
            "min_read_depth": min_read_depth,
            "min_allele_frequency": min_allele_frequency,
            "max_allele_frequency": max_allele_frequency,
            "variant_type": variant_type,
        },
    )


@router.get("/{variant_id}")
def get_variant(variant_id: str, db: Session = Depends(get_db)):
    variant = db.query(Variant).filter(Variant.variant_id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    annotation = db.query(Annotation).filter(
        Annotation.variant_id == variant_id
    ).first()

    result = {
        "variant": VariantResponse.model_validate(variant).model_dump(),
    }

    if annotation:
        result["annotation"] = {
            "dbsnp_rs_id": annotation.dbsnp_rs_id,
            "gene": annotation.gene,
            "transcript": annotation.transcript,
            "consequence": annotation.consequence,
            "clinvar_variation_id": annotation.clinvar_variation_id,
            "clinvar_clinical_significance": annotation.clinvar_clinical_significance,
            "clinvar_conditions": annotation.clinvar_conditions,
            "clinvar_review_status": annotation.clinvar_review_status,
            "sift_prediction": annotation.sift_prediction,
            "sift_score": annotation.sift_score,
            "polyphen_prediction": annotation.polyphen_prediction,
            "polyphen_score": annotation.polyphen_score,
            "allele_frequency_1kg": annotation.allele_frequency_1kg,
            "allele_frequency_gnomad": annotation.allele_frequency_gnomad,
            "allele_frequency_exac": annotation.allele_frequency_exac,
            "gnomad_af": annotation.gnomad_af,
            "gnomad_af_afr": annotation.gnomad_af_afr,
            "gnomad_af_amr": annotation.gnomad_af_amr,
            "gnomad_af_asj": annotation.gnomad_af_asj,
            "gnomad_af_eas": annotation.gnomad_af_eas,
            "gnomad_af_fin": annotation.gnomad_af_fin,
            "gnomad_af_nfe": annotation.gnomad_af_nfe,
            "gnomad_af_oth": annotation.gnomad_af_oth,
            "gnomad_af_sas": annotation.gnomad_af_sas,
            "gnomad_hom_count": annotation.gnomad_hom_count,
            "gnomad_het_count": annotation.gnomad_het_count,
            "exac_af": annotation.exac_af,
            "exac_af_afr": annotation.exac_af_afr,
            "exac_af_amr": annotation.exac_af_amr,
            "exac_af_eas": annotation.exac_af_eas,
            "exac_af_fin": annotation.exac_af_fin,
            "exac_af_nfe": annotation.exac_af_nfe,
            "exac_af_sas": annotation.exac_af_sas,
            "thousandg_af": annotation.thousandg_af,
            "thousandg_af_afr": annotation.thousandg_af_afr,
            "thousandg_af_amr": annotation.thousandg_af_amr,
            "thousandg_af_eas": annotation.thousandg_af_eas,
            "thousandg_af_eur": annotation.thousandg_af_eur,
            "thousandg_af_sas": annotation.thousandg_af_sas,
            "additional_annotations": annotation.additional_annotations,
        }
    else:
        from ..services.annotation_service import get_annotation_service
        anno_service = get_annotation_service(db)
        new_annotation = anno_service.annotate_variant(variant)
        result["annotation"] = {
            "dbsnp_rs_id": new_annotation.dbsnp_rs_id,
            "gene": new_annotation.gene,
            "transcript": new_annotation.transcript,
            "consequence": new_annotation.consequence,
            "clinvar_variation_id": new_annotation.clinvar_variation_id,
            "clinvar_clinical_significance": new_annotation.clinvar_clinical_significance,
            "clinvar_conditions": new_annotation.clinvar_conditions,
            "clinvar_review_status": new_annotation.clinvar_review_status,
            "sift_prediction": new_annotation.sift_prediction,
            "sift_score": new_annotation.sift_score,
            "polyphen_prediction": new_annotation.polyphen_prediction,
            "polyphen_score": new_annotation.polyphen_score,
            "allele_frequency_1kg": new_annotation.allele_frequency_1kg,
            "allele_frequency_gnomad": new_annotation.allele_frequency_gnomad,
            "allele_frequency_exac": new_annotation.allele_frequency_exac,
            "gnomad_af": new_annotation.gnomad_af,
            "gnomad_af_afr": new_annotation.gnomad_af_afr,
            "gnomad_af_amr": new_annotation.gnomad_af_amr,
            "gnomad_af_asj": new_annotation.gnomad_af_asj,
            "gnomad_af_eas": new_annotation.gnomad_af_eas,
            "gnomad_af_fin": new_annotation.gnomad_af_fin,
            "gnomad_af_nfe": new_annotation.gnomad_af_nfe,
            "gnomad_af_oth": new_annotation.gnomad_af_oth,
            "gnomad_af_sas": new_annotation.gnomad_af_sas,
            "gnomad_hom_count": new_annotation.gnomad_hom_count,
            "gnomad_het_count": new_annotation.gnomad_het_count,
            "exac_af": new_annotation.exac_af,
            "exac_af_afr": new_annotation.exac_af_afr,
            "exac_af_amr": new_annotation.exac_af_amr,
            "exac_af_eas": new_annotation.exac_af_eas,
            "exac_af_fin": new_annotation.exac_af_fin,
            "exac_af_nfe": new_annotation.exac_af_nfe,
            "exac_af_sas": new_annotation.exac_af_sas,
            "thousandg_af": new_annotation.thousandg_af,
            "thousandg_af_afr": new_annotation.thousandg_af_afr,
            "thousandg_af_amr": new_annotation.thousandg_af_amr,
            "thousandg_af_eas": new_annotation.thousandg_af_eas,
            "thousandg_af_eur": new_annotation.thousandg_af_eur,
            "thousandg_af_sas": new_annotation.thousandg_af_sas,
        }

    return result


@router.get("/{variant_id}/annotation")
def get_variant_annotation(variant_id: str, db: Session = Depends(get_db)):
    variant = db.query(Variant).filter(Variant.variant_id == variant_id).first()
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found")

    from ..services.annotation_service import get_annotation_service
    anno_service = get_annotation_service(db)

    annotation = anno_service.annotate_variant(variant)

    return {
        "variant_id": variant_id,
        "dbsnp_rs_id": annotation.dbsnp_rs_id,
        "gene": annotation.gene,
        "transcript": annotation.transcript,
        "consequence": annotation.consequence,
        "clinvar_variation_id": annotation.clinvar_variation_id,
        "clinvar_clinical_significance": annotation.clinvar_clinical_significance,
        "clinvar_conditions": annotation.clinvar_conditions,
        "clinvar_review_status": annotation.clinvar_review_status,
        "sift_prediction": annotation.sift_prediction,
        "sift_score": annotation.sift_score,
        "polyphen_prediction": annotation.polyphen_prediction,
        "polyphen_score": annotation.polyphen_score,
        "allele_frequency_1kg": annotation.allele_frequency_1kg,
        "allele_frequency_gnomad": annotation.allele_frequency_gnomad,
        "allele_frequency_exac": annotation.allele_frequency_exac,
        "additional_annotations": annotation.additional_annotations,
    }
