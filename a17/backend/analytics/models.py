from django.db import models
import json


class Report(models.Model):
    REPORT_TYPES = (
        ('overview', '概览报表'),
        ('user', '用户分析'),
        ('product', '商品分析'),
        ('custom', '自定义报表'),
    )
    EXPORT_FORMATS = (
        ('pdf', 'PDF'),
        ('excel', 'Excel'),
    )
    STATUS_CHOICES = (
        ('pending', '待处理'),
        ('processing', '处理中'),
        ('completed', '已完成'),
        ('failed', '失败'),
    )

    report_type = models.CharField(max_length=20, choices=REPORT_TYPES)
    start_date = models.DateField()
    end_date = models.DateField()
    export_format = models.CharField(max_length=10, choices=EXPORT_FORMATS)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    file_path = models.CharField(max_length=512, null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    custom_config = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'reports'
        ordering = ['-created_at']


class UserRetention(models.Model):
    date = models.DateField(db_index=True)
    cohort_date = models.DateField(db_index=True)
    cohort_size = models.IntegerField(default=0)
    day_0 = models.DecimalField(max_digits=5, decimal_places=2, default=100.0)
    day_1 = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    day_3 = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    day_7 = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    day_14 = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    day_30 = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        db_table = 'user_retention'
        unique_together = ('date', 'cohort_date')


class ConversionFunnel(models.Model):
    date = models.DateField(db_index=True)
    stage = models.CharField(max_length=50)
    users = models.IntegerField(default=0)
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    drop_off = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        db_table = 'conversion_funnel'


class ProductPerformance(models.Model):
    date = models.DateField(db_index=True)
    product_id = models.CharField(max_length=64, db_index=True)
    product_name = models.CharField(max_length=255, default='')
    category = models.CharField(max_length=128, default='')
    views = models.IntegerField(default=0)
    clicks = models.IntegerField(default=0)
    add_to_carts = models.IntegerField(default=0)
    purchases = models.IntegerField(default=0)
    revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    click_through_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    conversion_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    class Meta:
        db_table = 'product_performance'
        unique_together = ('date', 'product_id')


TAG_CATEGORY_CHOICES = (
    ('demographic', '人口属性'),
    ('behavior', '行为特征'),
    ('consumption', '消费属性'),
    ('interest', '兴趣偏好'),
    ('device', '设备属性'),
    ('custom', '自定义'),
)

TAG_TYPE_CHOICES = (
    ('boolean', '布尔型'),
    ('categorical', '分类型'),
    ('numerical', '数值型'),
    ('datetime', '日期型'),
)

TAG_SOURCE_CHOICES = (
    ('auto', '自动生成'),
    ('manual', '手动标记'),
    ('rule', '规则生成'),
)


class UserTag(models.Model):
    tag_code = models.CharField(max_length=64, unique=True, db_index=True)
    tag_name = models.CharField(max_length=128)
    tag_category = models.CharField(max_length=32, choices=TAG_CATEGORY_CHOICES, default='behavior')
    tag_type = models.CharField(max_length=20, choices=TAG_TYPE_CHOICES, default='categorical')
    tag_source = models.CharField(max_length=20, choices=TAG_SOURCE_CHOICES, default='auto')
    description = models.TextField(null=True, blank=True)
    tag_values = models.JSONField(null=True, blank=True)
    rule_config = models.JSONField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    priority = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_tags'
        ordering = ['tag_category', 'priority', '-created_at']

    def __str__(self):
        return f'{self.tag_name} ({self.tag_code})'


class UserTagValue(models.Model):
    user_profile = models.ForeignKey(
        'data_collection.UserProfile',
        on_delete=models.CASCADE,
        related_name='tag_values',
        db_column='user_profile_id'
    )
    tag = models.ForeignKey(UserTag, on_delete=models.CASCADE, related_name='user_values')
    value = models.CharField(max_length=512)
    score = models.DecimalField(max_digits=5, decimal_places=2, default=100.0)
    calculated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_tag_values'
        unique_together = ('user_profile', 'tag')
        indexes = [
            models.Index(fields=['tag', 'value']),
        ]


class UserSegment(models.Model):
    name = models.CharField(max_length=128)
    description = models.TextField(null=True, blank=True)
    conditions = models.JSONField(help_text='分群条件配置')
    user_count = models.IntegerField(default=0)
    is_dynamic = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_segments'

    def get_condition_display(self):
        conditions = self.conditions or {}
        return json.dumps(conditions, ensure_ascii=False, indent=2)


class UserSegmentMember(models.Model):
    segment = models.ForeignKey(UserSegment, on_delete=models.CASCADE, related_name='members')
    user_profile = models.ForeignKey(
        'data_collection.UserProfile',
        on_delete=models.CASCADE,
        db_column='user_profile_id'
    )
    added_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_segment_members'
        unique_together = ('segment', 'user_profile')


EXPERIMENT_STATUS_CHOICES = (
    ('draft', '草稿'),
    ('running', '运行中'),
    ('paused', '已暂停'),
    ('completed', '已结束'),
)


class ABTestExperiment(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    experiment_key = models.CharField(max_length=128, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=EXPERIMENT_STATUS_CHOICES, default='draft')
    
    start_date = models.DateTimeField(null=True, blank=True)
    end_date = models.DateTimeField(null=True, blank=True)
    
    primary_metric = models.CharField(max_length=64, default='conversion_rate')
    secondary_metrics = models.JSONField(default=list, blank=True)
    
    target_users = models.CharField(max_length=64, default='all')
    traffic_percentage = models.IntegerField(default=100)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ab_test_experiments'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ABTestVariant(models.Model):
    experiment = models.ForeignKey(ABTestExperiment, on_delete=models.CASCADE, related_name='variants')
    name = models.CharField(max_length=128)
    variant_key = models.CharField(max_length=64)
    is_control = models.BooleanField(default=False)
    traffic_weight = models.IntegerField(default=1)
    config = models.JSONField(null=True, blank=True)
    
    sample_size = models.IntegerField(default=0)
    conversions = models.IntegerField(default=0)
    revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    avg_order_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ab_test_variants'
        unique_together = ('experiment', 'variant_key')

    def __str__(self):
        return f'{self.experiment.name} - {self.name}'


class ABTestResult(models.Model):
    experiment = models.ForeignKey(ABTestExperiment, on_delete=models.CASCADE, related_name='results')
    variant = models.ForeignKey(ABTestVariant, on_delete=models.CASCADE, related_name='variant_results')
    date = models.DateField(db_index=True)
    
    impressions = models.IntegerField(default=0)
    clicks = models.IntegerField(default=0)
    conversions = models.IntegerField(default=0)
    revenue = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    
    click_rate = models.DecimalField(max_digits=7, decimal_places=4, default=0)
    conversion_rate = models.DecimalField(max_digits=7, decimal_places=4, default=0)
    
    statistical_significance = models.DecimalField(max_digits=5, decimal_places=4, null=True, blank=True)
    confidence_interval = models.JSONField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ab_test_results'
        unique_together = ('experiment', 'variant', 'date')
        indexes = [
            models.Index(fields=['experiment', 'date']),
        ]


class ABTestAssignment(models.Model):
    experiment = models.ForeignKey(ABTestExperiment, on_delete=models.CASCADE)
    variant = models.ForeignKey(ABTestVariant, on_delete=models.CASCADE)
    user_id = models.CharField(max_length=64, db_index=True)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ab_test_assignments'
        unique_together = ('experiment', 'user_id')


DIMENSION_CHOICES = (
    ('date', '日期'),
    ('week', '周'),
    ('month', '月'),
    ('user_segment', '用户分群'),
    ('device_type', '设备类型'),
    ('product_category', '商品分类'),
    ('event_type', '事件类型'),
    ('hour', '小时'),
    ('day_of_week', '星期几'),
)

METRIC_CHOICES = (
    ('pv', '浏览量(PV)'),
    ('uv', '访客数(UV)'),
    ('clicks', '点击量'),
    ('click_rate', '点击率'),
    ('add_to_carts', '加购数'),
    ('purchases', '订单数'),
    ('revenue', '收入'),
    ('conversion_rate', '转化率'),
    ('avg_order_value', '客单价'),
    ('avg_session_duration', '平均会话时长'),
    ('bounce_rate', '跳出率'),
    ('new_users', '新用户数'),
)

CHART_TYPE_CHOICES = (
    ('line', '折线图'),
    ('bar', '柱状图'),
    ('pie', '饼图'),
    ('table', '数据表格'),
    ('funnel', '漏斗图'),
    ('heatmap', '热力图'),
)


class CustomReport(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    
    dimensions = models.JSONField(default=list, help_text='维度配置列表')
    metrics = models.JSONField(default=list, help_text='指标配置列表')
    
    filters = models.JSONField(default=dict, blank=True, help_text='筛选条件')
    
    chart_type = models.CharField(max_length=20, choices=CHART_TYPE_CHOICES, default='line')
    chart_config = models.JSONField(default=dict, blank=True)
    
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    date_range_type = models.CharField(max_length=20, default='last_7_days')
    
    is_public = models.BooleanField(default=False)
    is_favorite = models.BooleanField(default=False)
    
    created_by = models.CharField(max_length=64, default='system')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'custom_reports'
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class ReportWidget(models.Model):
    report = models.ForeignKey(CustomReport, on_delete=models.CASCADE, related_name='widgets')
    
    title = models.CharField(max_length=128)
    
    dimensions = models.JSONField(default=list)
    metrics = models.JSONField(default=list)
    
    chart_type = models.CharField(max_length=20, choices=CHART_TYPE_CHOICES, default='line')
    chart_config = models.JSONField(default=dict, blank=True)
    
    layout_config = models.JSONField(default=dict, help_text='位置和尺寸配置')
    
    sort_order = models.IntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'report_widgets'
        ordering = ['sort_order']


class ReportTemplate(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    
    config = models.JSONField(default=dict, help_text='模板配置')
    
    category = models.CharField(max_length=32, default='general')
    is_default = models.BooleanField(default=False)
    
    thumbnail = models.CharField(max_length=512, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'report_templates'
