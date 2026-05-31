from datetime import datetime, timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.http import FileResponse
from django.utils import timezone
from .analytics_service import AnalyticsService
from .export_service import ExportService
from .models import Report


class OverviewStatsView(APIView):
    def get(self, request):
        end_date = request.query_params.get('end_date') or timezone.now().date()
        start_date = request.query_params.get('start_date') or (end_date - timedelta(days=7))
        
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        analytics = AnalyticsService()
        stats = analytics.get_overview_stats(start_date, end_date)
        trend = analytics.get_daily_trend(start_date, end_date)
        
        return Response({
            'success': True,
            'data': {
                'stats': stats,
                'trend': trend,
                'start_date': start_date.strftime('%Y-%m-%d'),
                'end_date': end_date.strftime('%Y-%m-%d'),
            }
        })


class ConversionFunnelView(APIView):
    def get(self, request):
        end_date = request.query_params.get('end_date') or timezone.now().date()
        start_date = request.query_params.get('start_date') or (end_date - timedelta(days=30))
        
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        analytics = AnalyticsService()
        funnel = analytics.get_conversion_funnel(start_date, end_date)
        segments = analytics.get_user_segment_distribution()
        repeat = analytics.get_repeat_purchase_rate(start_date, end_date)
        
        return Response({
            'success': True,
            'data': {
                'funnel': funnel,
                'segments': segments,
                'repeat_purchase': repeat,
            }
        })


class ProductPerformanceView(APIView):
    def get(self, request):
        end_date = request.query_params.get('end_date') or timezone.now().date()
        start_date = request.query_params.get('start_date') or (end_date - timedelta(days=30))
        limit = int(request.query_params.get('limit', 10))
        
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        analytics = AnalyticsService()
        products = analytics.get_product_performance(start_date, end_date, limit)
        heatmap = analytics.get_heatmap_data(start_date, end_date)
        
        return Response({
            'success': True,
            'data': {
                'products': products,
                'heatmap': heatmap,
            }
        })


class RetentionView(APIView):
    def get(self, request):
        end_date = request.query_params.get('end_date') or timezone.now().date()
        start_date = request.query_params.get('start_date') or (end_date - timedelta(days=30))
        
        if isinstance(start_date, str):
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if isinstance(end_date, str):
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        analytics = AnalyticsService()
        retention = analytics.calculate_retention(start_date, end_date)
        
        return Response({
            'success': True,
            'data': {
                'retention': retention,
            }
        })


class ExportReportView(APIView):
    def post(self, request):
        data = request.data
        report_type = data.get('report_type')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        export_format = data.get('format', 'pdf')
        
        if not all([report_type, start_date, end_date]):
            return Response(
                {'success': False, 'error': 'Missing required parameters'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        report = Report.objects.create(
            report_type=report_type,
            start_date=start_date,
            end_date=end_date,
            export_format=export_format,
            status='processing',
        )
        
        try:
            export_service = ExportService()
            
            if export_format == 'pdf':
                filename = export_service.generate_pdf_report(report, start_date, end_date)
            else:
                filename = export_service.generate_excel_report(report, start_date, end_date)
            
            report.status = 'completed'
            report.file_path = filename
            report.completed_at = timezone.now()
            report.save()
            
            return Response({
                'success': True,
                'data': {
                    'report_id': report.id,
                    'filename': filename,
                    'download_url': f'/api/analytics/download/{report.id}/',
                }
            })
        except Exception as e:
            report.status = 'failed'
            report.error_message = str(e)
            report.save()
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class DownloadReportView(APIView):
    def get(self, request, report_id):
        try:
            report = Report.objects.get(id=report_id)
            if not report.file_path:
                return Response(
                    {'success': False, 'error': 'Report file not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            from django.conf import settings
            import os
            filepath = os.path.join(settings.EXPORT_DIR, report.file_path)
            
            if not os.path.exists(filepath):
                return Response(
                    {'success': False, 'error': 'Report file not found'},
                    status=status.HTTP_404_NOT_FOUND
                )
            
            content_type = 'application/pdf' if report.export_format == 'pdf' else \
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            
            return FileResponse(
                open(filepath, 'rb'),
                as_attachment=True,
                filename=report.file_path,
                content_type=content_type
            )
        except Report.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Report not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class ReportListView(APIView):
    def get(self, request):
        reports = Report.objects.all()[:50]
        data = [{
            'id': r.id,
            'report_type': r.report_type,
            'start_date': r.start_date.strftime('%Y-%m-%d'),
            'end_date': r.end_date.strftime('%Y-%m-%d'),
            'format': r.export_format,
            'status': r.status,
            'created_at': r.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            'download_url': f'/api/analytics/download/{r.id}/' if r.file_path else None,
        } for r in reports]
        
        return Response({
            'success': True,
            'data': data,
        })
