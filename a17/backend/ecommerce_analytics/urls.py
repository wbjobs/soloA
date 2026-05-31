from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/collect/', include('data_collection.urls')),
    path('api/analytics/', include('analytics.urls')),
    path('api/dashboard/', include('dashboard.urls')),
]
