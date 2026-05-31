import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'ecommerce_analytics.settings')
app = Celery('ecommerce_analytics')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

app.conf.beat_schedule = {
    'clean-logs-hourly': {
        'task': 'data_collection.tasks.clean_raw_logs',
        'schedule': crontab(minute=0),
    },
    'generate-daily-report': {
        'task': 'analytics.tasks.generate_daily_report',
        'schedule': crontab(hour=1, minute=0),
    },
}
