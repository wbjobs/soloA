from django.db import models


class UserProfile(models.Model):
    user_id = models.CharField(max_length=64, unique=True, db_index=True)
    first_visit_time = models.DateTimeField(null=True, blank=True)
    last_visit_time = models.DateTimeField(null=True, blank=True)
    total_visits = models.IntegerField(default=0)
    total_orders = models.IntegerField(default=0)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    segment = models.CharField(max_length=32, default='new')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_profiles'


class Product(models.Model):
    product_id = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=128)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'products'


class CleanedBehaviorLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    user_id = models.CharField(max_length=64, db_index=True)
    session_id = models.CharField(max_length=64)
    event_type = models.CharField(max_length=32)
    product_id = models.CharField(max_length=64, null=True, blank=True)
    page_url = models.CharField(max_length=512, null=True, blank=True)
    timestamp = models.DateTimeField(db_index=True)
    duration = models.IntegerField(default=0)
    device_type = models.CharField(max_length=32, null=True, blank=True)
    ip_address = models.CharField(max_length=64, null=True, blank=True)
    order_id = models.CharField(max_length=64, null=True, blank=True)
    order_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    is_valid = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'cleaned_behavior_logs'
        indexes = [
            models.Index(fields=['user_id', 'timestamp']),
            models.Index(fields=['event_type', 'timestamp']),
        ]


class DailyStats(models.Model):
    date = models.DateField(unique=True, db_index=True)
    pv = models.IntegerField(default=0)
    uv = models.IntegerField(default=0)
    new_users = models.IntegerField(default=0)
    active_users = models.IntegerField(default=0)
    orders = models.IntegerField(default=0)
    order_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cart_adds = models.IntegerField(default=0)
    product_clicks = models.IntegerField(default=0)
    bounce_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    avg_session_duration = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_stats'
