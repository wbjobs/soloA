from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from ..models.variant import Variant
from ..models.annotation import Annotation


class AnnotationService:
    def __init__(self, db: Session):
        self.db = db

    def annotate_variant(
        self,
        variant: Variant,
    ) -> Annotation:
        existing_annotation = self.db.query(Annotation).filter(
            Annotation.variant_id == variant.variant_id
        ).first()

        if existing_annotation:
            return existing_annotation

        mock_annotations = self._get_mock_annotations(variant)

        annotation = Annotation(
            variant_id=variant.variant_id,
            dbsnp_rs_id=mock_annotations.get("dbsnp_rs_id"),
            gene=mock_annotations.get("gene"),
            transcript=mock_annotations.get("transcript"),
            consequence=mock_annotations.get("consequence"),
            clinvar_variation_id=mock_annotations.get("clinvar_variation_id"),
            clinvar_clinical_significance=mock_annotations.get("clinvar_clinical_significance"),
            clinvar_conditions=mock_annotations.get("clinvar_conditions"),
            clinvar_review_status=mock_annotations.get("clinvar_review_status"),
            sift_prediction=mock_annotations.get("sift_prediction"),
            sift_score=mock_annotations.get("sift_score"),
            polyphen_prediction=mock_annotations.get("polyphen_prediction"),
            polyphen_score=mock_annotations.get("polyphen_score"),
            allele_frequency_1kg=mock_annotations.get("allele_frequency_1kg"),
            allele_frequency_gnomad=mock_annotations.get("allele_frequency_gnomad"),
            allele_frequency_exac=mock_annotations.get("allele_frequency_exac"),
            gnomad_af=mock_annotations.get("gnomad_af"),
            gnomad_af_afr=mock_annotations.get("gnomad_af_afr"),
            gnomad_af_amr=mock_annotations.get("gnomad_af_amr"),
            gnomad_af_asj=mock_annotations.get("gnomad_af_asj"),
            gnomad_af_eas=mock_annotations.get("gnomad_af_eas"),
            gnomad_af_fin=mock_annotations.get("gnomad_af_fin"),
            gnomad_af_nfe=mock_annotations.get("gnomad_af_nfe"),
            gnomad_af_oth=mock_annotations.get("gnomad_af_oth"),
            gnomad_af_sas=mock_annotations.get("gnomad_af_sas"),
            gnomad_hom_count=mock_annotations.get("gnomad_hom_count"),
            gnomad_het_count=mock_annotations.get("gnomad_het_count"),
            exac_af=mock_annotations.get("exac_af"),
            exac_af_afr=mock_annotations.get("exac_af_afr"),
            exac_af_amr=mock_annotations.get("exac_af_amr"),
            exac_af_eas=mock_annotations.get("exac_af_eas"),
            exac_af_fin=mock_annotations.get("exac_af_fin"),
            exac_af_nfe=mock_annotations.get("exac_af_nfe"),
            exac_af_sas=mock_annotations.get("exac_af_sas"),
            thousandg_af=mock_annotations.get("thousandg_af"),
            thousandg_af_afr=mock_annotations.get("thousandg_af_afr"),
            thousandg_af_amr=mock_annotations.get("thousandg_af_amr"),
            thousandg_af_eas=mock_annotations.get("thousandg_af_eas"),
            thousandg_af_eur=mock_annotations.get("thousandg_af_eur"),
            thousandg_af_sas=mock_annotations.get("thousandg_af_sas"),
            additional_annotations={},
        )

        self.db.add(annotation)
        self.db.commit()
        self.db.refresh(annotation)

        return annotation

    def _get_mock_annotations(self, variant: Variant) -> Dict[str, Any]:
        variant_key = f"{variant.chromosome}:{variant.position}:{variant.ref_allele}:{variant.alt_allele}"

        mock_db = {
            "chr1:1234567:A:T": {
                "dbsnp_rs_id": "rs1234567",
                "gene": "BRCA1",
                "transcript": "ENST00000357654",
                "consequence": "missense_variant",
                "clinvar_variation_id": "VCV000123456",
                "clinvar_clinical_significance": "Pathogenic",
                "clinvar_conditions": "Breast cancer, Ovarian cancer",
                "clinvar_review_status": "reviewed_by_expert_panel",
                "sift_prediction": "deleterious",
                "sift_score": "0.01",
                "polyphen_prediction": "probably_damaging",
                "polyphen_score": "0.98",
                "allele_frequency_1kg": "0.001",
                "allele_frequency_gnomad": "0.0005",
                "allele_frequency_exac": "0.0003",
                "gnomad_af": 0.0005,
                "gnomad_af_afr": 0.0001,
                "gnomad_af_amr": 0.0003,
                "gnomad_af_asj": 0.0012,
                "gnomad_af_eas": 0.0002,
                "gnomad_af_fin": 0.0004,
                "gnomad_af_nfe": 0.0006,
                "gnomad_af_oth": 0.0003,
                "gnomad_af_sas": 0.0002,
                "gnomad_hom_count": 0,
                "gnomad_het_count": 156,
                "exac_af": 0.0003,
                "exac_af_afr": 0.0001,
                "exac_af_amr": 0.0002,
                "exac_af_eas": 0.0001,
                "exac_af_fin": 0.0002,
                "exac_af_nfe": 0.0004,
                "exac_af_sas": 0.0002,
                "thousandg_af": 0.001,
                "thousandg_af_afr": 0.0005,
                "thousandg_af_amr": 0.0008,
                "thousandg_af_eas": 0.0003,
                "thousandg_af_eur": 0.0015,
                "thousandg_af_sas": 0.0007,
            },
            "chr13:32914058:G:A": {
                "dbsnp_rs_id": "rs80357906",
                "gene": "BRCA2",
                "transcript": "ENST00000544455",
                "consequence": "frameshift_variant",
                "clinvar_variation_id": "VCV000000001",
                "clinvar_clinical_significance": "Pathogenic",
                "clinvar_conditions": "Hereditary breast ovarian cancer syndrome",
                "clinvar_review_status": "practice_guideline",
                "sift_prediction": "deleterious",
                "sift_score": "0.00",
                "polyphen_prediction": "probably_damaging",
                "polyphen_score": "1.0",
                "allele_frequency_1kg": "0.0001",
                "allele_frequency_gnomad": "0.00008",
                "allele_frequency_exac": "0.00005",
                "gnomad_af": 0.00008,
                "gnomad_af_afr": 0.00002,
                "gnomad_af_amr": 0.00005,
                "gnomad_af_asj": 0.0002,
                "gnomad_af_eas": 0.00001,
                "gnomad_af_fin": 0.00003,
                "gnomad_af_nfe": 0.0001,
                "gnomad_af_oth": 0.00004,
                "gnomad_af_sas": 0.00002,
                "gnomad_hom_count": 0,
                "gnomad_het_count": 24,
                "exac_af": 0.00005,
                "exac_af_afr": 0.00001,
                "exac_af_amr": 0.00003,
                "exac_af_eas": 0.00001,
                "exac_af_fin": 0.00002,
                "exac_af_nfe": 0.00006,
                "exac_af_sas": 0.00002,
                "thousandg_af": 0.0001,
                "thousandg_af_afr": 0.00002,
                "thousandg_af_amr": 0.00005,
                "thousandg_af_eas": 0.00001,
                "thousandg_af_eur": 0.00015,
                "thousandg_af_sas": 0.00003,
            },
            "chr17:41244944:G:A": {
                "dbsnp_rs_id": "rs334",
                "gene": "HBB",
                "transcript": "ENST00000335295",
                "consequence": "missense_variant",
                "clinvar_variation_id": "VCV000000002",
                "clinvar_clinical_significance": "Benign/Likely benign",
                "clinvar_conditions": "Hemoglobinopathy",
                "clinvar_review_status": "criteria_provided,_multiple_submitters,_no_conflicts",
                "sift_prediction": "tolerated",
                "sift_score": "0.35",
                "polyphen_prediction": "benign",
                "polyphen_score": "0.1",
                "allele_frequency_1kg": "0.05",
                "allele_frequency_gnomad": "0.045",
                "allele_frequency_exac": "0.048",
                "gnomad_af": 0.045,
                "gnomad_af_afr": 0.152,
                "gnomad_af_amr": 0.042,
                "gnomad_af_asj": 0.005,
                "gnomad_af_eas": 0.002,
                "gnomad_af_fin": 0.008,
                "gnomad_af_nfe": 0.012,
                "gnomad_af_oth": 0.025,
                "gnomad_af_sas": 0.018,
                "gnomad_hom_count": 2340,
                "gnomad_het_count": 14200,
                "exac_af": 0.048,
                "exac_af_afr": 0.145,
                "exac_af_amr": 0.045,
                "exac_af_eas": 0.003,
                "exac_af_fin": 0.009,
                "exac_af_nfe": 0.014,
                "exac_af_sas": 0.022,
                "thousandg_af": 0.05,
                "thousandg_af_afr": 0.158,
                "thousandg_af_amr": 0.048,
                "thousandg_af_eas": 0.002,
                "thousandg_af_eur": 0.015,
                "thousandg_af_sas": 0.025,
            },
        }

        if variant_key in mock_db:
            return mock_db[variant_key]

        import random

        base_af = round(random.uniform(0.0001, 0.01), 6)

        return {
            "dbsnp_rs_id": None,
            "gene": self._predict_gene(variant),
            "transcript": None,
            "consequence": self._predict_consequence(variant),
            "clinvar_variation_id": None,
            "clinvar_clinical_significance": "Uncertain significance",
            "clinvar_conditions": None,
            "clinvar_review_status": None,
            "sift_prediction": None,
            "sift_score": None,
            "polyphen_prediction": None,
            "polyphen_score": None,
            "allele_frequency_1kg": str(base_af),
            "allele_frequency_gnomad": str(round(base_af * 0.8, 6)),
            "allele_frequency_exac": str(round(base_af * 0.7, 6)),
            "gnomad_af": round(base_af * 0.8, 6),
            "gnomad_af_afr": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_af_amr": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_af_asj": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_af_eas": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_af_fin": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_af_nfe": round(base_af * random.uniform(0.8, 1.5), 6),
            "gnomad_af_oth": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_af_sas": round(base_af * random.uniform(0.5, 2), 6),
            "gnomad_hom_count": random.randint(0, 5),
            "gnomad_het_count": random.randint(1, 200),
            "exac_af": round(base_af * 0.7, 6),
            "exac_af_afr": round(base_af * random.uniform(0.5, 2), 6),
            "exac_af_amr": round(base_af * random.uniform(0.5, 2), 6),
            "exac_af_eas": round(base_af * random.uniform(0.5, 2), 6),
            "exac_af_fin": round(base_af * random.uniform(0.5, 2), 6),
            "exac_af_nfe": round(base_af * random.uniform(0.8, 1.5), 6),
            "exac_af_sas": round(base_af * random.uniform(0.5, 2), 6),
            "thousandg_af": base_af,
            "thousandg_af_afr": round(base_af * random.uniform(0.5, 2), 6),
            "thousandg_af_amr": round(base_af * random.uniform(0.5, 2), 6),
            "thousandg_af_eas": round(base_af * random.uniform(0.5, 2), 6),
            "thousandg_af_eur": round(base_af * random.uniform(0.8, 1.5), 6),
            "thousandg_af_sas": round(base_af * random.uniform(0.5, 2), 6),
        }

    def _predict_gene(self, variant: Variant) -> Optional[str]:
        gene_map = {
            "chr1": ["BRCA1", "MUTYH"],
            "chr2": ["MSH2", "MSH6"],
            "chr3": ["VHL", "MLH1"],
            "chr5": ["APC"],
            "chr7": ["CFTR"],
            "chr9": ["CDKN2A"],
            "chr10": ["PTEN"],
            "chr11": ["ATM", "MEN1"],
            "chr13": ["BRCA2", "RB1"],
            "chr16": ["TSC2", "E-cadherin"],
            "chr17": ["TP53", "BRCA1", "NF1"],
            "chr19": ["LDLR"],
            "chr22": ["NF2"],
            "chrX": ["F8", "DMD"],
        }

        genes = gene_map.get(variant.chromosome, [])
        return genes[0] if genes else None

    def _predict_consequence(self, variant: Variant) -> str:
        from ..models.variant import VariantType

        if variant.variant_type == VariantType.INS:
            if len(variant.alt_allele) % 3 == 0:
                return "inframe_insertion"
            else:
                return "frameshift_variant"
        elif variant.variant_type == VariantType.DEL:
            if len(variant.ref_allele) % 3 == 0:
                return "inframe_deletion"
            else:
                return "frameshift_variant"
        elif variant.variant_type == VariantType.SNP:
            return "missense_variant"
        else:
            return "protein_altering_variant"

    def get_annotations_for_variant(self, variant_id: str) -> Optional[Annotation]:
        return self.db.query(Annotation).filter(
            Annotation.variant_id == variant_id
        ).first()

    def get_annotations_for_task(self, task_id: str) -> List[Annotation]:
        return self.db.query(Annotation).join(Variant).filter(
            Variant.task_id == task_id
        ).all()


def get_annotation_service(db: Session) -> AnnotationService:
    return AnnotationService(db)
