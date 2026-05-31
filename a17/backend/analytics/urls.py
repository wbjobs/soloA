from django.urls import path
from .views import (
    OverviewStatsView,
    ConversionFunnelView,
    ProductPerformanceView,
    RetentionView,
    ExportReportView,
    DownloadReportView,
    ReportListView,
)
from .advanced_views import (
    UserTagListView, UserTagDetailView,
    UserProfileDetailView, CalculateUserTagsView,
    BatchCalculateTagsView, UserSearchView,
    UserSegmentListView, UserSegmentDetailView,
    ABTestExperimentListView, ABTestExperimentDetailView,
    ABTestAssignmentView, ABTestGenerateMockView,
    CustomReportConfigView, CustomReportListView,
    CustomReportDetailView, CustomReportExecuteView,
    ReportTemplateListView, ApplyTemplateView,
)

urlpatterns = [
    path('overview/', OverviewStatsView.as_view(), name='overview_stats'),
    path('funnel/', ConversionFunnelView.as_view(), name='conversion_funnel'),
    path('products/', ProductPerformanceView.as_view(), name='product_performance'),
    path('retention/', RetentionView.as_view(), name='retention'),
    path('export/', ExportReportView.as_view(), name='export_report'),
    path('download/<int:report_id>/', DownloadReportView.as_view(), name='download_report'),
    path('reports/', ReportListView.as_view(), name='report_list'),
    
    path('tags/', UserTagListView.as_view(), name='user_tags'),
    path('tags/<str:tag_code>/', UserTagDetailView.as_view(), name='user_tag_detail'),
    path('tags/calculate/', CalculateUserTagsView.as_view(), name='calculate_tags'),
    path('tags/batch/', BatchCalculateTagsView.as_view(), name='batch_calculate_tags'),
    
    path('users/<str:user_id>/', UserProfileDetailView.as_view(), name='user_profile'),
    path('users/search/', UserSearchView.as_view(), name='user_search'),
    
    path('segments/', UserSegmentListView.as_view(), name='user_segments'),
    path('segments/<int:segment_id>/', UserSegmentDetailView.as_view(), name='user_segment_detail'),
    
    path('abtest/', ABTestExperimentListView.as_view(), name='abtest_experiments'),
    path('abtest/<int:experiment_id>/', ABTestExperimentDetailView.as_view(), name='abtest_experiment_detail'),
    path('abtest/assign/', ABTestAssignmentView.as_view(), name='abtest_assign'),
    path('abtest/<int:experiment_id>/mock/', ABTestGenerateMockView.as_view(), name='abtest_generate_mock'),
    
    path('custom/config/', CustomReportConfigView.as_view(), name='custom_report_config'),
    path('custom/', CustomReportListView.as_view(), name='custom_reports'),
    path('custom/<int:report_id>/', CustomReportDetailView.as_view(), name='custom_report_detail'),
    path('custom/execute/', CustomReportExecuteView.as_view(), name='custom_report_execute'),
    path('custom/<int:report_id>/execute/', CustomReportExecuteView.as_view(), name='custom_report_execute_by_id'),
    path('templates/', ReportTemplateListView.as_view(), name='report_templates'),
    path('templates/<int:template_id>/apply/', ApplyTemplateView.as_view(), name='apply_template'),
]
