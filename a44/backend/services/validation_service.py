import numpy as np
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import json
import tempfile
from datetime import datetime

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.charts.piecharts import Pie
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


class ValidationService:
    def __init__(self):
        self.cache = {}

    def calculate_l2_error(
        self,
        computed: np.ndarray,
        reference: np.ndarray,
        weights: Optional[np.ndarray] = None
    ) -> Dict:
        if len(computed) != len(reference):
            min_len = min(len(computed), len(reference))
            computed = computed[:min_len]
            reference = reference[:min_len]

        if weights is None:
            weights = np.ones_like(computed)

        if computed.ndim > 1:
            computed = np.linalg.norm(computed, axis=1)
        if reference.ndim > 1:
            reference = np.linalg.norm(reference, axis=1)

        error = computed - reference
        squared_error = error ** 2 * weights

        l2_norm = np.sqrt(np.sum(squared_error))
        l2_norm_ref = np.sqrt(np.sum(reference ** 2 * weights))

        relative_error = l2_norm / (l2_norm_ref + 1e-10)

        return {
            "absolute_l2": float(l2_norm),
            "relative_l2": float(relative_error),
            "rmse": float(np.sqrt(np.mean(squared_error))),
            "mae": float(np.mean(np.abs(error))),
            "max_error": float(np.max(np.abs(error))),
            "min_error": float(np.min(np.abs(error))),
            "percentage_error": float(relative_error * 100)
        }

    def calculate_l_inf_error(
        self,
        computed: np.ndarray,
        reference: np.ndarray
    ) -> Dict:
        if computed.ndim > 1:
            computed = np.linalg.norm(computed, axis=1)
        if reference.ndim > 1:
            reference = np.linalg.norm(reference, axis=1)

        error = np.abs(computed - reference)

        return {
            "max_absolute_error": float(np.max(error)),
            "mean_absolute_error": float(np.mean(error)),
            "rms_error": float(np.sqrt(np.mean(error ** 2))),
            "error_percentile_95": float(np.percentile(error, 95)),
            "error_percentile_99": float(np.percentile(error, 99))
        }

    def calculate_correlation(
        self,
        computed: np.ndarray,
        reference: np.ndarray
    ) -> Dict:
        if computed.ndim > 1:
            computed = np.linalg.norm(computed, axis=1)
        if reference.ndim > 1:
            reference = np.linalg.norm(reference, axis=1)

        correlation = np.corrcoef(computed, reference)[0, 1]

        n = len(computed)
        ss_res = np.sum((computed - reference) ** 2)
        ss_tot = np.sum((reference - np.mean(reference)) ** 2)
        r_squared = 1 - (ss_res / (ss_tot + 1e-10))

        return {
            "pearson_correlation": float(correlation),
            "r_squared": float(r_squared),
            "n_points": n
        }

    def validate_field(
        self,
        field_name: str,
        computed: np.ndarray,
        reference: np.ndarray,
        tolerance: float = 0.05
    ) -> Dict:
        l2_errors = self.calculate_l2_error(computed, reference)
        linf_errors = self.calculate_l_inf_error(computed, reference)
        correlation = self.calculate_correlation(computed, reference)

        passed = l2_errors['relative_l2'] < tolerance

        return {
            "field_name": field_name,
            "passed": passed,
            "tolerance": tolerance,
            "l2_errors": l2_errors,
            "l_inf_errors": linf_errors,
            "correlation": correlation,
            "error_points": {
                "high_error_mask": (np.abs(computed - reference) > tolerance).tolist(),
                "n_high_error": int(np.sum(np.abs(computed - reference) > tolerance))
            }
        }

    def validate_case(
        self,
        computed_fields: Dict[str, np.ndarray],
        reference_fields: Dict[str, np.ndarray],
        tolerances: Optional[Dict[str, float]] = None
    ) -> Dict:
        if tolerances is None:
            tolerances = {
                'U': 0.05,
                'p': 0.05,
                'k': 0.1,
                'epsilon': 0.1
            }

        results = {}
        all_passed = True
        total_error = 0.0

        for field_name in computed_fields.keys():
            if field_name in reference_fields:
                tolerance = tolerances.get(field_name, 0.05)
                field_validation = self.validate_field(
                    field_name,
                    computed_fields[field_name],
                    reference_fields[field_name],
                    tolerance
                )
                results[field_name] = field_validation
                all_passed = all_passed and field_validation['passed']
                total_error += field_validation['l2_errors']['relative_l2']

        overall_score = max(0, 100 - total_error * 100)

        return {
            "overall": {
                "passed": all_passed,
                "score": float(overall_score),
                "mean_error": float(total_error / max(1, len(results))),
                "n_fields_validated": len(results)
            },
            "fields": results,
            "timestamp": datetime.utcnow().isoformat()
        }

    def load_reference_solution(
        self,
        reference_data: Dict
    ) -> Dict[str, np.ndarray]:
        fields = {}
        for field_name, field_data in reference_data.items():
            if isinstance(field_data, list):
                fields[field_name] = np.array(field_data)
            elif isinstance(field_data, dict) and 'data' in field_data:
                fields[field_name] = np.array(field_data['data'])

        return fields

    def generate_validation_report(
        self,
        case_id: str,
        case_name: str,
        validation_results: Dict,
        metadata: Optional[Dict] = None,
        output_path: Optional[str] = None
    ) -> Optional[str]:
        if not HAS_REPORTLAB:
            return None

        if output_path is None:
            output_path = Path(tempfile.gettempdir()) / f"validation_report_{case_id}.pdf"
        else:
            output_path = Path(output_path)

        output_path.parent.mkdir(parents=True, exist_ok=True)

        doc = SimpleDocTemplate(
            str(output_path),
            pagesize=A4,
            rightMargin=72,
            leftMargin=72,
            topMargin=72,
            bottomMargin=72
        )

        styles = getSampleStyleSheet()
        story = []

        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1976d2'),
            spaceAfter=30
        )

        story.append(Paragraph("CFD Validation Report", title_style))
        story.append(Paragraph(f"Case: {case_name}", styles['Heading2']))
        story.append(Paragraph(f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}", styles['BodyText']))
        story.append(Spacer(1, 20))

        overall = validation_results.get('overall', {})
        overall_data = [
            ['Overall Score', f"{overall.get('score', 0):.1f}/100"],
            ['Status', 'PASS' if overall.get('passed', False) else 'FAIL'],
            ['Mean Relative Error', f"{overall.get('mean_error', 0)*100:.2f}%"],
            ['Fields Validated', str(overall.get('n_fields_validated', 0))]
        ]

        overall_table = Table(overall_data, colWidths=[2*inch, 2*inch])
        overall_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#e3f2fd')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('GRID', (0, 0), (-1, -1), 1, colors.gray)
        ]))
        story.append(overall_table)
        story.append(Spacer(1, 30))

        story.append(Paragraph("Field Validation Details", styles['Heading2']))
        story.append(Spacer(1, 10))

        field_results = validation_results.get('fields', {})
        if field_results:
            field_table_data = [
                ['Field', 'L2 Rel. Error', 'R²', 'Correlation', 'Status']
            ]

            for field_name, result in field_results.items():
                field_table_data.append([
                    field_name,
                    f"{result['l2_errors']['relative_l2']*100:.2f}%",
                    f"{result['correlation']['r_squared']:.4f}",
                    f"{result['correlation']['pearson_correlation']:.4f}",
                    'PASS' if result['passed'] else 'FAIL'
                ])

            field_table = Table(field_table_data, colWidths=[1*inch, 1.2*inch, 0.8*inch, 1*inch, 0.8*inch])
            field_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('GRID', (0, 0), (-1, -1), 1, colors.gray)
            ]))
            story.append(field_table)

        story.append(Spacer(1, 30))
        story.append(Paragraph("Error Analysis", styles['Heading2']))
        story.append(Spacer(1, 10))

        for field_name, result in field_results.items():
            story.append(Paragraph(f"<b>{field_name}</b>", styles['Heading3']))
            
            error_data = [
                ['Metric', 'Value'],
                ['RMSE', f"{result['l2_errors']['rmse']:.6e}"],
                ['MAE', f"{result['l2_errors']['mae']:.6e}"],
                ['Max Error', f"{result['l_inf_errors']['max_absolute_error']:.6e}"],
                ['95th Percentile', f"{result['l_inf_errors']['error_percentile_95']:.6e}"],
                ['High Error Points', f"{result['error_points']['n_high_error']}"]
            ]

            detail_table = Table(error_data, colWidths=[2*inch, 3*inch])
            detail_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f5f5f5')),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, colors.lightgray)
            ]))
            story.append(detail_table)
            story.append(Spacer(1, 10))

        if metadata:
            story.append(Spacer(1, 30))
            story.append(Paragraph("Case Metadata", styles['Heading2']))
            story.append(Spacer(1, 10))

            meta_data = [['Parameter', 'Value']]
            for key, value in metadata.items():
                meta_data.append([str(key), str(value)])

            meta_table = Table(meta_data, colWidths=[2*inch, 3*inch])
            meta_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#424242')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, colors.lightgray)
            ]))
            story.append(meta_table)

        story.append(Spacer(1, 50))
        story.append(Paragraph(
            "Generated by CFD Platform Validation Module",
            styles['Italic']
        ))

        doc.build(story)

        return str(output_path)

    def create_validation_summary(
        self,
        validation_results: Dict
    ) -> Dict:
        overall = validation_results.get('overall', {})
        fields = validation_results.get('fields', {})

        summary = {
            "overall_score": overall.get('score', 0),
            "passed": overall.get('passed', False),
            "fields": []
        }

        for field_name, result in fields.items():
            summary["fields"].append({
                "name": field_name,
                "passed": result['passed'],
                "relative_error": result['l2_errors']['relative_l2'],
                "r_squared": result['correlation']['r_squared'],
                "n_high_error_points": result['error_points']['n_high_error']
            })

        return summary


validation_service = ValidationService()
