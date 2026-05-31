from django.urls import path
from .views import CollectLogView, BatchCollectLogView

urlpatterns = [
    path('log/', CollectLogView.as_view(), name='collect_log'),
    path('batch/', BatchCollectLogView.as_view(), name='batch_collect_log'),
]
