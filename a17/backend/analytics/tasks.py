from datetime import date, timedelta
from celery import shared_task
from django.utils import timezone
from .analytics_service import AnalyticsService
from .export_service import ExportService
from .models import Report


@shared_task(name='analytics.tasks.generate_daily_report')
def generate_daily_report():
    today = timezone.now().date()
    yesterday = today - timedelta(days=1)
    
    analytics = AnalyticsService()
    analytics.calculate_daily_stats(yesterday)
    
    for report_type in ['overview', 'user', 'product']:
        report = Report.objects.create(
            report_type=report_type,
            start_date=yesterday,
            end_date=yesterday,
            export_format='excel',
            status='processing',
        )
        
        try:
            export_service = ExportService()
            filename = export_service.generate_excel_report(report, yesterday, yesterday)
            report.status = 'completed'
            report.file_path = filename
            report.completed_at = timezone.now()
            report.save()
        except Exception as e:
            report.status = 'failed'
            report.error_message = str(e)
            report.save()
    
    return {'date': yesterday.strftime('%Y-%m-%d')}


@shared_task
def calculate_historical_stats(start_date, end_date):
    analytics = AnalyticsService()
    current = start_date
    while current <= end_date:
        analytics.calculate_daily_stats(current)
        current += timedelta(days=1)
    
    return {'start': start_date.strftime('%Y-%m-%d'), 'end': end_date.strftime('%Y-%m-%d')}
