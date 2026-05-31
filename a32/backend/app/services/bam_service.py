import os
import math
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass

import pysam

from .storage_service import get_storage_service


@dataclass
class CoveragePoint:
    position: int
    depth: int


@dataclass
class Read:
    qname: str
    flag: int
    rname: str
    pos: int
    mapq: int
    cigar: str
    rnext: str
    pnext: int
    tlen: int
    seq: str
    qual: str
    is_reverse: bool
    is_secondary: bool
    is_duplicate: bool
    is_supplementary: bool


class BamService:
    def __init__(self):
        self.storage = get_storage_service()

    def _get_bam_file(self, bam_object_name: str, bai_object_name: Optional[str] = None) -> str:
        bam_path = self.storage.get_local_path(bam_object_name)

        if not os.path.exists(bam_path):
            self.storage.download_file(bam_object_name, bam_path)

        if bai_object_name:
            bai_path = bam_path + ".bai"
            if not os.path.exists(bai_path):
                self.storage.download_file(bai_object_name, bai_path)

        return bam_path

    def get_chromosome_lengths(self, bam_object_name: str) -> Dict[str, int]:
        bam_path = self._get_bam_file(bam_object_name)

        with pysam.AlignmentFile(bam_path, "rb") as bam:
            lengths = dict(zip(bam.references, bam.lengths))

        return lengths

    def _validate_and_adjust_region(
        self,
        bam,
        chromosome: str,
        start: int,
        end: int,
    ) -> Tuple[int, int]:
        chromosome_lengths = dict(zip(bam.references, bam.lengths))

        if chromosome not in chromosome_lengths:
            raise ValueError(f"Chromosome {chromosome} not found in BAM file")

        chrom_length = chromosome_lengths[chromosome]

        if start < 0:
            start = 0
        if end > chrom_length:
            end = chrom_length
        if start >= end:
            end = min(start + 1, chrom_length)

        return start, end

    def calculate_coverage(
        self,
        bam_object_name: str,
        chromosome: str,
        start: int,
        end: int,
        bai_object_name: Optional[str] = None,
        bin_size: Optional[int] = None,
    ) -> Tuple[List[CoveragePoint], Dict]:
        bam_path = self._get_bam_file(bam_object_name, bai_object_name)

        region_length = end - start
        if bin_size is None:
            bin_size = max(1, math.ceil(region_length / 1000))

        num_bins = math.ceil(region_length / bin_size)
        coverage = [0] * num_bins

        with pysam.AlignmentFile(bam_path, "rb") as bam:
            adjusted_start, adjusted_end = self._validate_and_adjust_region(
                bam, chromosome, start, end
            )

            if adjusted_start >= adjusted_end:
                return [], {
                    "chromosome": chromosome,
                    "start": start,
                    "end": end,
                    "region_length": 0,
                    "bin_size": bin_size,
                    "max_depth": 0,
                    "avg_depth": 0,
                    "min_depth": 0,
                }

            for pileupcolumn in bam.pileup(
                chromosome,
                adjusted_start,
                adjusted_end,
                stepper="all",
                min_base_quality=0,
                min_mapping_quality=0,
                truncate=True,
            ):
                pos = pileupcolumn.pos
                if start <= pos < end:
                    bin_idx = int((pos - start) / bin_size)
                    if 0 <= bin_idx < num_bins:
                        coverage[bin_idx] += pileupcolumn.n

        coverage_points = []
        for i, depth in enumerate(coverage):
            bin_start = start + i * bin_size
            coverage_points.append(CoveragePoint(position=bin_start, depth=depth))

        max_depth = max(coverage) if coverage else 0
        avg_depth = sum(coverage) / len(coverage) if coverage else 0

        stats = {
            "chromosome": chromosome,
            "start": start,
            "end": end,
            "region_length": region_length,
            "bin_size": bin_size,
            "max_depth": max_depth,
            "avg_depth": round(avg_depth, 2),
            "min_depth": min(coverage) if coverage else 0,
        }

        return coverage_points, stats

    def get_reads_in_region(
        self,
        bam_object_name: str,
        chromosome: str,
        start: int,
        end: int,
        bai_object_name: Optional[str] = None,
        limit: int = 100,
    ) -> List[Read]:
        bam_path = self._get_bam_file(bam_object_name, bai_object_name)

        reads = []
        with pysam.AlignmentFile(bam_path, "rb") as bam:
            adjusted_start, adjusted_end = self._validate_and_adjust_region(
                bam, chromosome, start, end
            )

            if adjusted_start >= adjusted_end:
                return []

            for i, read in enumerate(bam.fetch(chromosome, adjusted_start, adjusted_end)):
                if i >= limit:
                    break

                reads.append(
                    Read(
                        qname=read.query_name if read.query_name else "",
                        flag=read.flag,
                        rname=read.reference_name if read.reference_name else "",
                        pos=read.reference_start + 1 if read.reference_start is not None else 0,
                        mapq=read.mapping_quality if read.mapping_quality is not None else 0,
                        cigar=read.cigarstring if read.cigarstring else "",
                        rnext=read.next_reference_name if read.next_reference_name else "",
                        pnext=read.next_reference_start + 1 if read.next_reference_start is not None else 0,
                        tlen=read.template_length if read.template_length is not None else 0,
                        seq=read.query_sequence if read.query_sequence else "",
                        qual="".join([chr(q + 33) for q in (read.query_qualities if read.query_qualities else [])]),
                        is_reverse=read.is_reverse,
                        is_secondary=read.is_secondary,
                        is_duplicate=read.is_duplicate,
                        is_supplementary=read.is_supplementary,
                    )
                )

        return reads

    def get_mismatches_in_region(
        self,
        bam_object_name: str,
        chromosome: str,
        start: int,
        end: int,
        bai_object_name: Optional[str] = None,
    ) -> List[Dict]:
        bam_path = self._get_bam_file(bam_object_name, bai_object_name)

        mismatches = []
        with pysam.AlignmentFile(bam_path, "rb") as bam:
            adjusted_start, adjusted_end = self._validate_and_adjust_region(
                bam, chromosome, start, end
            )

            if adjusted_start >= adjusted_end:
                return []

            for read in bam.fetch(chromosome, adjusted_start, adjusted_end):
                if read.is_secondary or read.is_supplementary:
                    continue

                aligned_pairs = read.get_aligned_pairs(matches_only=False, with_seq=False)
                query_sequence = read.query_sequence
                if query_sequence is None:
                    continue

                for query_pos, ref_pos in aligned_pairs:
                    if ref_pos is None or query_pos is None:
                        continue

                    if start <= ref_pos < end:
                        ref_base = None
                        if bam.has_index() and bam.references:
                            try:
                                ref_base = bam.get_reference_sequence(
                                    read.reference_name, ref_pos, ref_pos + 1
                                )
                            except Exception:
                                pass
                        query_base = query_sequence[query_pos]

                        if ref_base and query_base.upper() != ref_base.upper():
                            mismatches.append({
                                "position": ref_pos,
                                "reference_base": ref_base.upper(),
                                "query_base": query_base.upper(),
                                "quality": read.query_qualities[query_pos] if read.query_qualities else None,
                                "read_name": read.query_name,
                            })

        return mismatches


def get_bam_service() -> BamService:
    return BamService()
