from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from django.db.models import Count, Sum, Avg, Q, F
from data_collection.models import CleanedBehaviorLog, DailyStats, UserProfile
from .models import (
    CustomReport, ReportWidget, ReportTemplate,
    DIMENSION_CHOICES, METRIC_CHOICES, CHART_TYPE_CHOICES
)


class CustomReportService:
    def __init__(self):
        self.dimensions_map = dict(DIMENSION_CHOICES)
        self.metrics_map = dict(METRIC_CHOICES)

    def get_available_dimensions(self):
        return [
            {'code': code, 'name': name}
            for code, name in DIMENSION_CHOICES
        ]

    def get_available_metrics(self):
        return [
            {'code': code, 'name': name}
            for code, name in METRIC_CHOICES
        ]

    def get_available_chart_types(self):
        return [
            {'code': code, 'name': name}
            for code, name in CHART_TYPE_CHOICES
        ]

    def create_report(self, name, dimensions, metrics, chart_type='line',
                      description=None, filters=None, start_date=None,
                      end_date=None, date_range_type='last_7_days'):
        report = CustomReport.objects.create(
            name=name,
            description=description,
            dimensions=dimensions,
            metrics=metrics,
            chart_type=chart_type,
            filters=filters or {},
            start_date=start_date,
            end_date=end_date,
            date_range_type=date_range_type,
        )
        return report

    def update_report(self, report_id, **kwargs):
        report = CustomReport.objects.get(id=report_id)
        for key, value in kwargs.items():
            if hasattr(report, key):
                setattr(report, key, value)
        report.save()
        return report

    def delete_report(self, report_id):
        CustomReport.objects.get(id=report_id).delete()

    def list_reports(self, created_by=None, is_public=False):
        queryset = CustomReport.objects.all()
        if is_public:
            queryset = queryset.filter(is_public=True)
        if created_by:
            queryset = queryset.filter(created_by=created_by)
        return queryset

    def get_report_detail(self, report_id):
        report = CustomReport.objects.get(id=report_id)
        return {
            'id': report.id,
            'name': report.name,
            'description': report.description,
            'dimensions': report.dimensions,
            'metrics': report.metrics,
            'chart_type': report.chart_type,
            'chart_config': report.chart_config,
            'filters': report.filters,
            'start_date': report.start_date.isoformat() if report.start_date else None,
            'end_date': report.end_date.isoformat() if report.end_date else None,
            'date_range_type': report.date_range_type,
            'is_public': report.is_public,
            'is_favorite': report.is_favorite,
            'created_at': report.created_at.isoformat(),
            'updated_at': report.updated_at.isoformat(),
        }

    def _resolve_date_range(self, date_range_type, start_date, end_date):
        today = timezone.now().date()
        
        if date_range_type == 'today':
            return today, today
        elif date_range_type == 'yesterday':
            yesterday = today - timedelta(days=1)
            return yesterday, yesterday
        elif date_range_type == 'last_7_days':
            return today - timedelta(days=7), today
        elif date_range_type == 'last_30_days':
            return today - timedelta(days=30), today
        elif date_range_type == 'this_week':
            monday = today - timedelta(days=today.weekday())
            return monday, today
        elif date_range_type == 'this_month':
            first = today.replace(day=1)
            return first, today
        elif start_date and end_date:
            return start_date, end_date
        else:
            return today - timedelta(days=7), today

    def execute_report(self, report_id):
        report = CustomReport.objects.get(id=report_id)
        
        start_date, end_date = self._resolve_date_range(
            report.date_range_type,
            report.start_date,
            report.end_date
        )
        
        data = self.execute_query(
            dimensions=report.dimensions,
            metrics=report.metrics,
            filters=report.filters,
            start_date=start_date,
            end_date=end_date
        )
        
        return {
            'report': self.get_report_detail(report_id),
            'data': data,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
        }

    def execute_query(self, dimensions, metrics, filters=None, start_date=None, end_date=None):
        if not metrics:
            return {'headers': [], 'rows': [], 'chart_data': None}
        
        if start_date is None:
            start_date = timezone.now().date() - timedelta(days=7)
        if end_date is None:
            end_date = timezone.now().date()
        
        logs = CleanedBehaviorLog.objects.filter(
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            is_valid=True
        )
        
        if filters:
            if filters.get('device_type'):
                logs = logs.filter(device_type__in=filters['device_type'])
            if filters.get('event_type'):
                logs = logs.filter(event_type__in=filters['event_type'])
            if filters.get('min_orders'):
                pass
        
        agg_data = self._aggregate_by_dimensions(logs, dimensions, metrics)
        
        headers = []
        for dim in dimensions:
            headers.append(self.dimensions_map.get(dim, dim))
        for metric in metrics:
            headers.append(self.metrics_map.get(metric, metric))
        
        rows = []
        for agg in agg_data:
            row = []
            for dim in dimensions:
                row.append(agg.get(dim, ''))
            for metric in metrics:
                row.append(agg.get(f'metric_{metric}', 0))
            rows.append(row)
        
        chart_data = self._prepare_chart_data(agg_data, dimensions, metrics)
        
        return {
            'headers': headers,
            'rows': rows,
            'chart_data': chart_data,
            'dimensions': dimensions,
            'metrics': metrics,
        }

    def _aggregate_by_dimensions(self, queryset, dimensions, metrics):
        if not dimensions:
            return [self._calculate_metrics(queryset, metrics)]
        
        dimension_field_map = {
            'date': 'timestamp__date',
            'week': 'timestamp__week',
            'month': 'timestamp__month',
            'hour': 'timestamp__hour',
            'day_of_week': 'timestamp__week_day',
            'device_type': 'device_type',
            'event_type': 'event_type',
            'user_segment': 'user_id',
            'product_category': 'product_id',
        }
        
        group_fields = []
        for dim in dimensions:
            field = dimension_field_map.get(dim)
            if field:
                group_fields.append(field)
        
        if not group_fields:
            return [self._calculate_metrics(queryset, metrics)]
        
        result = []
        
        from django.db.models import Count, Sum
        
        logs = list(queryset.values(
            'timestamp', 'event_type', 'user_id', 'product_id',
            'device_type', 'duration', 'order_amount', 'session_id'
        ))
        
        grouped = {}
        
        for log in logs:
            key_parts = []
            
            for dim in dimensions:
                if dim == 'date':
                    key_parts.append(log['timestamp'].date().isoformat())
                elif dim == 'hour':
                    key_parts.append(str(log['timestamp'].hour))
                elif dim == 'day_of_week':
                    key_parts.append(str(log['timestamp'].weekday()))
                elif dim == 'device_type':
                    key_parts.append(log['device_type'] or 'unknown')
                elif dim == 'event_type':
                    key_parts.append(log['event_type'])
                elif dim == 'product_category':
                    pid = log['product_id'] or ''
                    try:
                        cat = f'分类_{(int(pid.split("_")[-1]) % 5) + 1}'
                    except:
                        cat = '分类_1'
                    key_parts.append(cat)
                else:
                    key_parts.append('')
            
            key = tuple(key_parts)
            
            if key not in grouped:
                grouped[key] = {
                    'views': 0, 'clicks': 0, 'add_to_carts': 0,
                    'purchases': 0, 'users': set(), 'sessions': set(),
                    'revenue': 0, 'durations': [],
                }
            
            g = grouped[key]
            
            if log['event_type'] == 'view':
                g['views'] += 1
            elif log['event_type'] == 'click':
                g['clicks'] += 1
            elif log['event_type'] == 'add_to_cart':
                g['add_to_carts'] += 1
            elif log['event_type'] == 'purchase':
                g['purchases'] += 1
                if log['order_amount']:
                    g['revenue'] += float(log['order_amount'])
            
            g['users'].add(log['user_id'])
            g['sessions'].add(log['session_id'])
            if log['duration']:
                g['durations'].append(log['duration'])
            
            for i, dim in enumerate(dimensions):
                g[dim] = key_parts[i]
        
        result = []
        for key, g in grouped.items():
            row = {}
            
            for i, dim in enumerate(dimensions):
                row[dim] = key[i]
            
            for metric in metrics:
                row[f'metric_{metric}'] = self._calculate_single_metric(g, metric)
            
            result.append(row)
        
        return result

    def _calculate_metrics(self, queryset, metrics):
        result = {}
        
        view_logs = queryset.filter(event_type='view')
        click_logs = queryset.filter(event_type='click')
        cart_logs = queryset.filter(event_type='add_to_cart')
        purchase_logs = queryset.filter(event_type='purchase')
        
        for metric in metrics:
            if metric == 'pv':
                result['metric_pv'] = view_logs.count()
            elif metric == 'uv':
                result['metric_uv'] = view_logs.values('user_id').distinct().count()
            elif metric == 'clicks':
                result['metric_clicks'] = click_logs.count()
            elif metric == 'click_rate':
                pv = view_logs.count()
                result['metric_click_rate'] = (
                    click_logs.count() / pv * 100 if pv > 0 else 0
                )
            elif metric == 'add_to_carts':
                result['metric_add_to_carts'] = cart_logs.count()
            elif metric == 'purchases':
                result['metric_purchases'] = purchase_logs.count()
            elif metric == 'revenue':
                total = purchase_logs.aggregate(total=Sum('order_amount'))['total'] or 0
                result['metric_revenue'] = float(total)
            elif metric == 'conversion_rate':
                uv = view_logs.values('user_id').distinct().count()
                purchases = purchase_logs.values('user_id').distinct().count()
                result['metric_conversion_rate'] = (
                    purchases / uv * 100 if uv > 0 else 0
                )
            elif metric == 'avg_order_value':
                purchases = purchase_logs.count()
                if purchases == 0:
                    result['metric_avg_order_value'] = 0
                else:
                    total = purchase_logs.aggregate(total=Sum('order_amount'))['total'] or 0
                    result['metric_avg_order_value'] = float(total) / purchases
            elif metric == 'avg_session_duration':
                durations = list(queryset.values_list('duration', flat=True))
                if durations:
                    result['metric_avg_session_duration'] = sum(durations) / len(durations)
                else:
                    result['metric_avg_session_duration'] = 0
            else:
                result[f'metric_{metric}'] = 0
        
        return result

    def _calculate_single_metric(self, g, metric):
        if metric == 'pv':
            return g['views']
        elif metric == 'uv':
            return len(g['users'])
        elif metric == 'clicks':
            return g['clicks']
        elif metric == 'click_rate':
            return g['clicks'] / g['views'] * 100 if g['views'] > 0 else 0
        elif metric == 'add_to_carts':
            return g['add_to_carts']
        elif metric == 'purchases':
            return g['purchases']
        elif metric == 'revenue':
            return round(g['revenue'], 2)
        elif metric == 'conversion_rate':
            return g['purchases'] / g['views'] * 100 if g['views'] > 0 else 0
        elif metric == 'avg_order_value':
            return g['revenue'] / g['purchases'] if g['purchases'] > 0 else 0
        elif metric == 'avg_session_duration':
            return sum(g['durations']) / len(g['durations']) if g['durations'] else 0
        else:
            return 0

    def _prepare_chart_data(self, agg_data, dimensions, metrics):
        if not dimensions or not metrics:
            return None
        
        categories = []
        series = {}
        
        for metric in metrics:
            series[metric] = []
        
        for row in agg_data:
            if dimensions:
                categories.append(row.get(dimensions[0], ''))
            for metric in metrics:
                series[metric].append(row.get(f'metric_{metric}', 0))
        
        return {
            'categories': categories,
            'series': [
                {'name': self.metrics_map.get(m, m), 'data': series[m]}
                for m in metrics
            ],
        }

    def create_template(self, name, config, category='general', is_default=False):
        template = ReportTemplate.objects.create(
            name=name,
            config=config,
            category=category,
            is_default=is_default,
        )
        return template

    def list_templates(self, category=None):
        queryset = ReportTemplate.objects.all()
        if category:
            queryset = queryset.filter(category=category)
        return queryset

    def create_report_from_template(self, template_id, name=None):
        template = ReportTemplate.objects.get(id=template_id)
        config = template.config
        
        return self.create_report(
            name=name or f'{template.name} (副本)',
            dimensions=config.get('dimensions', []),
            metrics=config.get('metrics', []),
            chart_type=config.get('chart_type', 'line'),
            description=config.get('description'),
            filters=config.get('filters', {}),
        )

    def add_widget(self, report_id, title, dimensions, metrics, chart_type,
                   layout_config=None, chart_config=None):
        report = CustomReport.objects.get(id=report_id)
        
        widget = ReportWidget.objects.create(
            report=report,
            title=title,
            dimensions=dimensions,
            metrics=metrics,
            chart_type=chart_type,
            layout_config=layout_config or {},
            chart_config=chart_config or {},
        )
        
        return widget

    def execute_widget(self, widget_id, start_date=None, end_date=None):
        widget = ReportWidget.objects.get(id=widget_id)
        
        return self.execute_query(
            dimensions=widget.dimensions,
            metrics=widget.metrics,
            start_date=start_date,
            end_date=end_date
        )
