from datetime import datetime, timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from analytics.analytics_service import AnalyticsService


class DashboardOverviewView(APIView):
    def get(self, request):
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=7)
        
        analytics = AnalyticsService()
        stats = analytics.get_overview_stats(start_date, end_date)
        trend = analytics.get_daily_trend(start_date, end_date)
        
        return Response({
            'success': True,
            'data': {
                'kpis': {
                    'pv': stats['pv'],
                    'uv': stats['uv'],
                    'orders': stats['purchases'],
                    'revenue': stats['total_revenue'],
                    'conversion_rate': stats['overall_conversion_rate'],
                    'avg_order_value': stats['avg_order_value'],
                },
                'trend': trend,
            }
        })


class HealthCheckView(APIView):
    def get(self, request):
        return Response({
            'status': 'healthy',
            'timestamp': timezone.now().isoformat(),
            'version': '1.0.0',
        })
