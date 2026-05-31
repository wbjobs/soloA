from django.urls import path
from .views import DashboardOverviewView, HealthCheckView

urlpatterns = [
    path('overview/', DashboardOverviewView.as_view(), name='dashboard_overview'),
    path('health/', HealthCheckView.as_view(), name='health_check'),
]
