import math
import hashlib
from datetime import datetime, timedelta
from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from django.db.models import Sum, Count, Avg
from data_collection.models import CleanedBehaviorLog
from .models import (
    ABTestExperiment, ABTestVariant, ABTestResult, ABTestAssignment,
    EXPERIMENT_STATUS_CHOICES
)


class ABTestService:
    def __init__(self):
        pass

    def create_experiment(self, name, description, experiment_key,
                          variants_config, primary_metric='conversion_rate',
                          secondary_metrics=None, traffic_percentage=100,
                          target_users='all'):
        if ABTestExperiment.objects.filter(experiment_key=experiment_key).exists():
            raise ValueError(f"实验Key {experiment_key} 已存在")
        
        with transaction.atomic():
            experiment = ABTestExperiment.objects.create(
                name=name,
                description=description,
                experiment_key=experiment_key,
                status='draft',
                primary_metric=primary_metric,
                secondary_metrics=secondary_metrics or [],
                target_users=target_users,
                traffic_percentage=traffic_percentage,
            )
            
            for variant_config in variants_config:
                ABTestVariant.objects.create(
                    experiment=experiment,
                    name=variant_config['name'],
                    variant_key=variant_config['variant_key'],
                    is_control=variant_config.get('is_control', False),
                    traffic_weight=variant_config.get('traffic_weight', 1),
                    config=variant_config.get('config'),
                )
        
        return experiment

    def start_experiment(self, experiment_id):
        experiment = ABTestExperiment.objects.get(id=experiment_id)
        
        if experiment.status not in ['draft', 'paused']:
            raise ValueError(f"实验状态 {experiment.status} 无法启动")
        
        experiment.status = 'running'
        experiment.start_date = timezone.now()
        experiment.save()
        
        return experiment

    def pause_experiment(self, experiment_id):
        experiment = ABTestExperiment.objects.get(id=experiment_id)
        
        if experiment.status != 'running':
            raise ValueError(f"实验状态 {experiment.status} 无法暂停")
        
        experiment.status = 'paused'
        experiment.save()
        
        return experiment

    def end_experiment(self, experiment_id):
        experiment = ABTestExperiment.objects.get(id=experiment_id)
        
        experiment.status = 'completed'
        experiment.end_date = timezone.now()
        experiment.save()
        
        return experiment

    def assign_variant(self, experiment_key, user_id):
        try:
            experiment = ABTestExperiment.objects.get(
                experiment_key=experiment_key,
                status='running'
            )
        except ABTestExperiment.DoesNotExist:
            return None
        
        try:
            assignment = ABTestAssignment.objects.get(
                experiment=experiment,
                user_id=user_id
            )
            return assignment.variant
        except ABTestAssignment.DoesNotExist:
            pass
        
        if experiment.traffic_percentage < 100:
            hash_val = self._hash_user(experiment_key, user_id)
            if hash_val % 100 >= experiment.traffic_percentage:
                return None
        
        variants = list(experiment.variants.all())
        if not variants:
            return None
        
        total_weight = sum(v.traffic_weight for v in variants)
        hash_val = self._hash_user(experiment_key + ':variant', user_id)
        selection = hash_val % total_weight
        
        current = 0
        selected_variant = None
        for variant in variants:
            current += variant.traffic_weight
            if selection < current:
                selected_variant = variant
                break
        
        if selected_variant is None:
            selected_variant = variants[0]
        
        ABTestAssignment.objects.create(
            experiment=experiment,
            variant=selected_variant,
            user_id=user_id,
        )
        
        return selected_variant

    def _hash_user(self, salt, user_id):
        hash_str = f"{salt}:{user_id}"
        return int(hashlib.md5(hash_str.encode()).hexdigest(), 16)

    def record_event(self, experiment_key, user_id, event_type,
                     revenue=None, timestamp=None):
        try:
            experiment = ABTestExperiment.objects.get(
                experiment_key=experiment_key
            )
        except ABTestExperiment.DoesNotExist:
            return False
        
        try:
            assignment = ABTestAssignment.objects.get(
                experiment=experiment,
                user_id=user_id
            )
        except ABTestAssignment.DoesNotExist:
            return False
        
        if timestamp is None:
            timestamp = timezone.now()
        
        result_date = timestamp.date()
        
        result, _ = ABTestResult.objects.get_or_create(
            experiment=experiment,
            variant=assignment.variant,
            date=result_date,
        )
        
        if event_type == 'impression':
            result.impressions += 1
        elif event_type == 'click':
            result.clicks += 1
        elif event_type == 'conversion':
            result.conversions += 1
            if revenue:
                result.revenue += Decimal(str(revenue))
        
        result.save()
        
        self._update_variant_stats(assignment.variant)
        
        return True

    def _update_variant_stats(self, variant):
        results = ABTestResult.objects.filter(variant=variant)
        agg = results.aggregate(
            total_impressions=Sum('impressions'),
            total_clicks=Sum('clicks'),
            total_conversions=Sum('conversions'),
            total_revenue=Sum('revenue'),
        )
        
        variant.sample_size = agg['total_impressions'] or 0
        variant.conversions = agg['total_conversions'] or 0
        variant.revenue = agg['total_revenue'] or 0
        
        if variant.sample_size > 0:
            variant.avg_order_value = (
                variant.revenue / variant.conversions
                if variant.conversions > 0 else 0
            )
        
        variant.save()

    def get_experiment_results(self, experiment_id, start_date=None, end_date=None):
        experiment = ABTestExperiment.objects.get(id=experiment_id)
        
        if start_date is None and experiment.start_date:
            start_date = experiment.start_date.date()
        if end_date is None:
            end_date = timezone.now().date()
        
        results = ABTestResult.objects.filter(
            experiment=experiment,
            date__gte=start_date,
            date__lte=end_date
        ).select_related('variant')
        
        variant_stats = {}
        for variant in experiment.variants.all():
            variant_stats[variant.id] = {
                'variant_id': variant.id,
                'variant_name': variant.name,
                'variant_key': variant.variant_key,
                'is_control': variant.is_control,
                'impressions': 0,
                'clicks': 0,
                'conversions': 0,
                'revenue': 0.0,
                'daily_data': [],
            }
        
        daily_by_variant = {}
        for result in results:
            vid = result.variant.id
            if vid not in daily_by_variant:
                daily_by_variant[vid] = {}
            
            date_str = result.date.strftime('%Y-%m-%d')
            if date_str not in daily_by_variant[vid]:
                daily_by_variant[vid][date_str] = {
                    'date': date_str,
                    'impressions': 0,
                    'clicks': 0,
                    'conversions': 0,
                    'revenue': 0,
                }
            
            daily = daily_by_variant[vid][date_str]
            daily['impressions'] += result.impressions
            daily['clicks'] += result.clicks
            daily['conversions'] += result.conversions
            daily['revenue'] += float(result.revenue or 0)
        
        for vid, stats in variant_stats.items():
            if vid in daily_by_variant:
                daily_list = sorted(daily_by_variant[vid].values(), key=lambda x: x['date'])
                stats['daily_data'] = daily_list
                
                for daily in daily_list:
                    stats['impressions'] += daily['impressions']
                    stats['clicks'] += daily['clicks']
                    stats['conversions'] += daily['conversions']
                    stats['revenue'] += daily['revenue']
        
        control_variant = None
        variants_list = []
        for vs in variant_stats.values():
            if vs['is_control']:
                control_variant = vs
            else:
                variants_list.append(vs)
        
        if control_variant is None:
            control_variant = variants_list[0] if variants_list else None
        
        analysis = self._calculate_statistical_analysis(control_variant, variants_list)
        
        return {
            'experiment': {
                'id': experiment.id,
                'name': experiment.name,
                'experiment_key': experiment.experiment_key,
                'status': experiment.status,
                'primary_metric': experiment.primary_metric,
                'start_date': experiment.start_date.isoformat() if experiment.start_date else None,
                'end_date': experiment.end_date.isoformat() if experiment.end_date else None,
            },
            'control_variant': control_variant,
            'test_variants': variants_list,
            'analysis': analysis,
        }

    def _calculate_statistical_analysis(self, control, test_variants):
        if control is None:
            return {'significance': [], 'summary': '无对照组数据'}
        
        control_conv_rate = (
            control['conversions'] / control['impressions'] * 100
            if control['impressions'] > 0 else 0
        )
        control_rev_per_user = (
            control['revenue'] / control['impressions']
            if control['impressions'] > 0 else 0
        )
        
        significance_results = []
        
        for test in test_variants:
            test_conv_rate = (
                test['conversions'] / test['impressions'] * 100
                if test['impressions'] > 0 else 0
            )
            test_rev_per_user = (
                test['revenue'] / test['impressions']
                if test['impressions'] > 0 else 0
            )
            
            conv_lift = (
                (test_conv_rate - control_conv_rate) / control_conv_rate * 100
                if control_conv_rate > 0 else 0
            )
            rev_lift = (
                (test_rev_per_user - control_rev_per_user) / control_rev_per_user * 100
                if control_rev_per_user > 0 else 0
            )
            
            p_value = self._calculate_p_value(
                control['impressions'], control['conversions'],
                test['impressions'], test['conversions']
            )
            
            confidence = self._calculate_confidence_interval(
                test['conversions'], test['impressions']
            )
            
            significance_results.append({
                'variant_name': test['variant_name'],
                'variant_key': test['variant_key'],
                
                'control_conversion_rate': round(control_conv_rate, 4),
                'test_conversion_rate': round(test_conv_rate, 4),
                'conversion_lift': round(conv_lift, 2),
                
                'control_revenue_per_user': round(control_rev_per_user, 4),
                'test_revenue_per_user': round(test_rev_per_user, 4),
                'revenue_lift': round(rev_lift, 2),
                
                'p_value': round(p_value, 4),
                'is_significant': p_value < 0.05,
                'confidence_level': '95%',
                'confidence_interval': confidence,
                
                'recommendation': self._get_recommendation(p_value, conv_lift),
            })
        
        return {
            'results': significance_results,
            'summary': self._generate_summary(significance_results),
        }

    def _calculate_p_value(self, n1, c1, n2, c2):
        if n1 == 0 or n2 == 0:
            return 1.0
        
        p1 = c1 / n1
        p2 = c2 / n2
        
        p_pooled = (c1 + c2) / (n1 + n2)
        
        if p_pooled == 0 or p_pooled == 1:
            return 1.0
        
        se = math.sqrt(p_pooled * (1 - p_pooled) * (1/n1 + 1/n2))
        if se == 0:
            return 1.0
        
        z = (p2 - p1) / se
        
        p_value = 2 * (1 - self._normal_cdf(abs(z)))
        
        return max(0.0001, min(0.9999, p_value))

    def _normal_cdf(self, x):
        a1 = 0.254829592
        a2 = -0.284496736
        a3 = 1.421413741
        a4 = -1.453152027
        a5 = 1.061405429
        p = 0.3275911
        
        sign = 1 if x >= 0 else -1
        x = abs(x) / math.sqrt(2.0)
        
        t = 1.0 / (1.0 + p * x)
        y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * math.exp(-x * x)
        
        return 0.5 * (1.0 + sign * y)

    def _calculate_confidence_interval(self, conversions, impressions):
        if impressions == 0:
            return [0, 0]
        
        p = conversions / impressions
        se = math.sqrt(p * (1 - p) / impressions)
        
        margin = 1.96 * se
        
        lower = max(0, p - margin)
        upper = min(1, p + margin)
        
        return [round(lower * 100, 2), round(upper * 100, 2)]

    def _get_recommendation(self, p_value, lift):
        if p_value < 0.05:
            if lift > 0:
                return 'winner'
            else:
                return 'loser'
        elif p_value < 0.1:
            if lift > 0:
                return 'potential_winner'
            else:
                return 'potential_loser'
        else:
            return 'inconclusive'

    def _generate_summary(self, results):
        if not results:
            return '暂无测试数据'
        
        winners = [r for r in results if r['recommendation'] == 'winner']
        losers = [r for r in results if r['recommendation'] == 'loser']
        
        if winners:
            winner_names = ', '.join([r['variant_name'] for r in winners])
            return f"版本 {winner_names} 在统计上显著胜出"
        
        if losers:
            loser_names = ', '.join([r['variant_name'] for r in losers])
            return f"版本 {loser_names} 在统计上显著劣于对照组"
        
        inconclusive = [r for r in results if r['recommendation'] == 'inconclusive']
        if inconclusive:
            return "尚无足够数据判断，建议继续实验或增加样本量"
        
        return '实验进行中，请等待更多数据'

    def get_all_experiments(self, status=None):
        queryset = ABTestExperiment.objects.all().prefetch_related('variants')
        if status:
            queryset = queryset.filter(status=status)
        return queryset

    def delete_experiment(self, experiment_id):
        experiment = ABTestExperiment.objects.get(id=experiment_id)
        if experiment.status == 'running':
            raise ValueError("运行中的实验无法删除，请先暂停")
        experiment.delete()
        return True

    def generate_mock_data(self, experiment_id, days=30):
        experiment = ABTestExperiment.objects.get(id=experiment_id)
        variants = list(experiment.variants.all())
        
        if len(variants) < 2:
            raise ValueError("实验至少需要2个版本")
        
        today = timezone.now().date()
        
        for day_offset in range(days):
            test_date = today - timedelta(days=day_offset)
            
            for variant in variants:
                base_impressions = 1000 + hash(f"{variant.id}:{day_offset}") % 500
                
                base_conv_rate = 0.05
                if variant.is_control:
                    conv_rate = base_conv_rate
                else:
                    conv_rate = base_conv_rate * (1 + (hash(str(variant.id)) % 20 - 10) / 100)
                
                impressions = base_impressions
                clicks = int(base_impressions * 0.3)
                conversions = int(base_impressions * conv_rate)
                revenue = conversions * (50 + hash(f"{variant.id}:revenue:{day_offset}") % 100)
                
                ABTestResult.objects.update_or_create(
                    experiment=experiment,
                    variant=variant,
                    date=test_date,
                    defaults={
                        'impressions': impressions,
                        'clicks': clicks,
                        'conversions': conversions,
                        'revenue': Decimal(str(revenue)),
                    }
                )
        
        for variant in variants:
            self._update_variant_stats(variant)
        
        return {'generated': days * len(variants)}
