from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Sum, Avg, Min, Max, Q
from data_collection.models import UserProfile, CleanedBehaviorLog
from .models import (
    UserTag, UserTagValue, UserSegment, UserSegmentMember,
    TAG_CATEGORY_CHOICES, TAG_TYPE_CHOICES
)


DEFAULT_TAGS_CONFIG = [
    {
        'tag_code': 'user_lifecycle',
        'tag_name': '用户生命周期阶段',
        'tag_category': 'behavior',
        'tag_type': 'categorical',
        'description': '基于活跃度和购买行为划分的用户生命周期阶段',
        'tag_values': ['新用户', '活跃用户', '忠实用户', 'VIP用户', '流失用户', '流失访客'],
    },
    {
        'tag_code': 'purchase_frequency',
        'tag_name': '购买频次',
        'tag_category': 'consumption',
        'tag_type': 'categorical',
        'description': '用户下单频率标签',
        'tag_values': ['首次购买', '低频购买', '中频购买', '高频购买'],
    },
    {
        'tag_code': 'consumption_level',
        'tag_name': '消费层级',
        'tag_category': 'consumption',
        'tag_type': 'categorical',
        'description': '基于消费金额划分的用户层级',
        'tag_values': ['低消费', '中低消费', '中高消费', '高消费', 'VIP消费'],
    },
    {
        'tag_code': 'activity_level',
        'tag_name': '活跃程度',
        'tag_category': 'behavior',
        'tag_type': 'categorical',
        'description': '用户最近访问活跃程度',
        'tag_values': ['非常活跃', '活跃', '一般', '不活跃', '沉睡'],
    },
    {
        'tag_code': 'device_preference',
        'tag_name': '设备偏好',
        'tag_category': 'device',
        'tag_type': 'categorical',
        'description': '用户常用设备类型',
        'tag_values': ['移动端优先', 'PC端优先', '多设备均衡', '平板优先'],
    },
    {
        'tag_code': 'cart_abandoner',
        'tag_name': '购物车放弃者',
        'tag_category': 'behavior',
        'tag_type': 'boolean',
        'description': '是否有加购但未购买行为',
        'tag_values': ['是', '否'],
    },
    {
        'tag_code': 'price_sensitive',
        'tag_name': '价格敏感度',
        'tag_category': 'consumption',
        'tag_type': 'categorical',
        'description': '用户对商品价格的敏感程度',
        'tag_values': ['价格敏感', '一般敏感', '价格不敏感'],
    },
    {
        'tag_code': 'category_preference',
        'tag_name': '品类偏好',
        'tag_category': 'interest',
        'tag_type': 'categorical',
        'description': '用户最常浏览/购买的商品品类',
        'tag_values': [],
    },
    {
        'tag_code': 'visit_time_preference',
        'tag_name': '访问时段偏好',
        'tag_category': 'behavior',
        'tag_type': 'categorical',
        'description': '用户最喜欢访问的时间段',
        'tag_values': ['凌晨', '上午', '中午', '下午', '晚间', '深夜'],
    },
    {
        'tag_code': 'weekday_preference',
        'tag_name': '星期偏好',
        'tag_category': 'behavior',
        'tag_type': 'categorical',
        'description': '用户更活跃的星期',
        'tag_values': ['工作日活跃', '周末活跃', '每日均衡'],
    },
]


class UserProfileService:
    def __init__(self):
        pass

    def initialize_default_tags(self):
        created_count = 0
        for tag_config in DEFAULT_TAGS_CONFIG:
            tag, created = UserTag.objects.get_or_create(
                tag_code=tag_config['tag_code'],
                defaults={
                    'tag_name': tag_config['tag_name'],
                    'tag_category': tag_config['tag_category'],
                    'tag_type': tag_config['tag_type'],
                    'description': tag_config.get('description'),
                    'tag_values': tag_config.get('tag_values', []),
                    'tag_source': 'auto',
                    'is_active': True,
                }
            )
            if created:
                created_count += 1
        
        return {'created': created_count, 'total': len(DEFAULT_TAGS_CONFIG)}

    def get_all_tags(self, category=None, active_only=True):
        queryset = UserTag.objects.all()
        if category:
            queryset = queryset.filter(tag_category=category)
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset

    def get_tags_by_category(self):
        categories = dict(TAG_CATEGORY_CHOICES)
        result = {}
        for code, name in categories.items():
            tags = UserTag.objects.filter(tag_category=code, is_active=True)
            if tags.exists():
                result[code] = {
                    'name': name,
                    'tags': list(tags.values('tag_code', 'tag_name', 'tag_type', 'description'))
                }
        return result

    def calculate_user_tags(self, user_profile, start_date=None, end_date=None):
        if end_date is None:
            end_date = timezone.now().date()
        if start_date is None:
            start_date = end_date - timedelta(days=90)
        
        tags = {}
        
        logs = CleanedBehaviorLog.objects.filter(
            user_id=user_profile.user_id,
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            is_valid=True
        )
        
        purchase_logs = logs.filter(event_type='purchase')
        click_logs = logs.filter(event_type='click')
        cart_logs = logs.filter(event_type='add_to_cart')
        view_logs = logs.filter(event_type='view')
        
        now = timezone.now()
        last_visit_days = (now - user_profile.last_visit_time).days if user_profile.last_visit_time else 999
        
        tags['user_lifecycle'] = self._calculate_lifecycle_stage(user_profile, last_visit_days)
        tags['purchase_frequency'] = self._calculate_purchase_frequency(user_profile)
        tags['consumption_level'] = self._calculate_consumption_level(user_profile)
        tags['activity_level'] = self._calculate_activity_level(user_profile, last_visit_days)
        tags['device_preference'] = self._calculate_device_preference(logs)
        tags['cart_abandoner'] = self._calculate_cart_abandoner(cart_logs, purchase_logs)
        tags['price_sensitive'] = self._calculate_price_sensitivity(purchase_logs)
        tags['category_preference'] = self._calculate_category_preference(logs)
        tags['visit_time_preference'] = self._calculate_time_preference(logs)
        tags['weekday_preference'] = self._calculate_weekday_preference(logs)
        
        return tags

    def _calculate_lifecycle_stage(self, user_profile, last_visit_days):
        if user_profile.total_orders == 0 and last_visit_days > 30:
            return '流失访客'
        elif user_profile.total_orders == 0:
            return '新用户'
        elif user_profile.total_orders >= 10 and last_visit_days < 7:
            return 'VIP用户'
        elif user_profile.total_orders >= 3:
            return '忠实用户'
        elif last_visit_days < 30:
            return '活跃用户'
        else:
            return '流失用户'

    def _calculate_purchase_frequency(self, user_profile):
        total_orders = user_profile.total_orders
        if total_orders == 0:
            return '首次购买'
        elif total_orders <= 2:
            return '低频购买'
        elif total_orders <= 5:
            return '中频购买'
        else:
            return '高频购买'

    def _calculate_consumption_level(self, user_profile):
        total_spent = float(user_profile.total_spent or 0)
        if total_spent == 0:
            return '低消费'
        elif total_spent < 500:
            return '中低消费'
        elif total_spent < 2000:
            return '中高消费'
        elif total_spent < 10000:
            return '高消费'
        else:
            return 'VIP消费'

    def _calculate_activity_level(self, user_profile, last_visit_days):
        total_visits = user_profile.total_visits
        if total_visits >= 50 and last_visit_days < 3:
            return '非常活跃'
        elif total_visits >= 20 and last_visit_days < 7:
            return '活跃'
        elif total_visits >= 5 and last_visit_days < 14:
            return '一般'
        elif last_visit_days < 30:
            return '不活跃'
        else:
            return '沉睡'

    def _calculate_device_preference(self, logs):
        device_stats = defaultdict(int)
        for log in logs:
            device = log.device_type or 'unknown'
            device_stats[device] += 1
        
        if not device_stats:
            return '多设备均衡'
        
        total = sum(device_stats.values())
        mobile = device_stats.get('mobile', 0)
        desktop = device_stats.get('desktop', 0)
        tablet = device_stats.get('tablet', 0)
        
        mobile_pct = mobile / total if total > 0 else 0
        desktop_pct = desktop / total if total > 0 else 0
        tablet_pct = tablet / total if total > 0 else 0
        
        if mobile_pct >= 0.7:
            return '移动端优先'
        elif desktop_pct >= 0.7:
            return 'PC端优先'
        elif tablet_pct >= 0.5:
            return '平板优先'
        else:
            return '多设备均衡'

    def _calculate_cart_abandoner(self, cart_logs, purchase_logs):
        cart_count = cart_logs.count()
        purchase_count = purchase_logs.count()
        
        if cart_count > purchase_count * 2:
            return '是'
        return '否'

    def _calculate_price_sensitivity(self, purchase_logs):
        if purchase_logs.count() == 0:
            return '一般敏感'
        
        amounts = [float(l.order_amount or 0) for l in purchase_logs if l.order_amount]
        if len(amounts) < 2:
            return '一般敏感'
        
        avg_amount = sum(amounts) / len(amounts)
        
        if avg_amount < 100:
            return '价格敏感'
        elif avg_amount < 500:
            return '一般敏感'
        else:
            return '价格不敏感'

    def _calculate_category_preference(self, logs):
        category_stats = defaultdict(int)
        for log in logs:
            if log.product_id:
                try:
                    category = f'分类_{(int(log.product_id.split("_")[-1]) % 5) + 1}'
                    category_stats[category] += 1
                except (ValueError, IndexError):
                    pass
        
        if not category_stats:
            return '未定义'
        
        return max(category_stats.keys(), key=lambda k: category_stats[k])

    def _calculate_time_preference(self, logs):
        hour_stats = defaultdict(int)
        for log in logs:
            hour = log.timestamp.hour
            hour_stats[hour] += 1
        
        if not hour_stats:
            return '晚间'
        
        periods = {
            '凌晨': (0, 6),
            '上午': (6, 12),
            '中午': (12, 14),
            '下午': (14, 18),
            '晚间': (18, 22),
            '深夜': (22, 24),
        }
        
        period_stats = defaultdict(int)
        for hour, count in hour_stats.items():
            for period, (start, end) in periods.items():
                if start <= hour < end:
                    period_stats[period] += count
                    break
        
        return max(period_stats.keys(), key=lambda k: period_stats[k])

    def _calculate_weekday_preference(self, logs):
        weekday_stats = defaultdict(int)
        for log in logs:
            weekday = log.timestamp.weekday()
            weekday_stats[weekday] += 1
        
        if not weekday_stats:
            return '每日均衡'
        
        weekday_total = sum(weekday_stats.get(i, 0) for i in range(5))
        weekend_total = sum(weekday_stats.get(i, 0) for i in range(5, 7))
        
        if weekday_total == 0 and weekend_total == 0:
            return '每日均衡'
        
        total = weekday_total + weekend_total
        weekday_pct = weekday_total / total if total > 0 else 0
        
        if weekday_pct >= 0.7:
            return '工作日活跃'
        elif weekday_pct <= 0.3:
            return '周末活跃'
        else:
            return '每日均衡'

    @transaction.atomic
    def update_user_tags(self, user_profile, tags):
        created_count = 0
        updated_count = 0
        
        for tag_code, tag_value in tags.items():
            try:
                tag = UserTag.objects.get(tag_code=tag_code, is_active=True)
            except UserTag.DoesNotExist:
                continue
            
            tag_value_obj, created = UserTagValue.objects.update_or_create(
                user_profile=user_profile,
                tag=tag,
                defaults={
                    'value': str(tag_value),
                    'score': 100.0,
                }
            )
            
            if created:
                created_count += 1
            else:
                updated_count += 1
        
        return {'created': created_count, 'updated': updated_count}

    def batch_update_user_tags(self, user_ids=None, start_date=None, end_date=None):
        if user_ids is None:
            profiles = UserProfile.objects.all()
        else:
            profiles = UserProfile.objects.filter(user_id__in=user_ids)
        
        total = profiles.count()
        processed = 0
        
        for profile in profiles:
            tags = self.calculate_user_tags(profile, start_date, end_date)
            self.update_user_tags(profile, tags)
            processed += 1
        
        return {'total': total, 'processed': processed}

    def get_user_profile_detail(self, user_id):
        try:
            profile = UserProfile.objects.get(user_id=user_id)
        except UserProfile.DoesNotExist:
            return None
        
        tag_values = UserTagValue.objects.filter(user_profile=profile).select_related('tag')
        tags_by_category = defaultdict(list)
        
        for tv in tag_values:
            tags_by_category[tv.tag.tag_category].append({
                'tag_code': tv.tag.tag_code,
                'tag_name': tv.tag.tag_name,
                'value': tv.value,
                'score': float(tv.score),
                'updated_at': tv.updated_at.isoformat() if tv.updated_at else None,
            })
        
        recent_logs = CleanedBehaviorLog.objects.filter(
            user_id=user_id,
            is_valid=True
        ).order_by('-timestamp')[:20]
        
        recent_activities = [{
            'event_type': l.event_type,
            'product_id': l.product_id,
            'page_url': l.page_url,
            'timestamp': l.timestamp.isoformat(),
            'device_type': l.device_type,
        } for l in recent_logs]
        
        return {
            'user_id': profile.user_id,
            'first_visit_time': profile.first_visit_time.isoformat() if profile.first_visit_time else None,
            'last_visit_time': profile.last_visit_time.isoformat() if profile.last_visit_time else None,
            'total_visits': profile.total_visits,
            'total_orders': profile.total_orders,
            'total_spent': float(profile.total_spent),
            'segment': profile.segment,
            'tags': dict(tags_by_category),
            'recent_activities': recent_activities,
        }

    def search_users_by_tags(self, tag_conditions, limit=100):
        queryset = UserProfile.objects.all()
        
        for condition in tag_conditions:
            tag_code = condition.get('tag_code')
            tag_value = condition.get('value')
            operator = condition.get('operator', 'equals')
            
            try:
                tag = UserTag.objects.get(tag_code=tag_code)
            except UserTag.DoesNotExist:
                continue
            
            tag_value_ids = UserTagValue.objects.filter(
                tag=tag,
                value=tag_value
            ).values_list('user_profile_id', flat=True)
            
            if operator == 'equals':
                queryset = queryset.filter(id__in=tag_value_ids)
            elif operator == 'not_equals':
                queryset = queryset.exclude(id__in=tag_value_ids)
        
        return queryset[:limit]

    def get_tag_distribution(self, tag_code):
        try:
            tag = UserTag.objects.get(tag_code=tag_code)
        except UserTag.DoesNotExist:
            return []
        
        values = UserTagValue.objects.filter(tag=tag).values('value').annotate(
            count=Count('id')
        ).order_by('-count')
        
        total = sum(v['count'] for v in values)
        
        return [{
            'value': v['value'],
            'count': v['count'],
            'percentage': round(v['count'] / total * 100, 2) if total > 0 else 0,
        } for v in values]

    def create_user_segment(self, name, description, conditions, is_dynamic=True):
        segment = UserSegment.objects.create(
            name=name,
            description=description,
            conditions=conditions,
            is_dynamic=is_dynamic,
            is_active=True,
        )
        
        self.refresh_segment_members(segment)
        return segment

    def refresh_segment_members(self, segment):
        conditions = segment.conditions or {}
        tag_conditions = conditions.get('tag_conditions', [])
        
        users = self.search_users_by_tags(tag_conditions, limit=None)
        user_ids = list(users.values_list('id', flat=True))
        
        UserSegmentMember.objects.filter(segment=segment).delete()
        
        members = [
            UserSegmentMember(segment=segment, user_profile_id=uid)
            for uid in user_ids
        ]
        
        UserSegmentMember.objects.bulk_create(members, batch_size=1000)
        segment.user_count = len(user_ids)
        segment.save()
        
        return segment.user_count

    def get_segment_overview(self, segment_id):
        try:
            segment = UserSegment.objects.get(id=segment_id)
        except UserSegment.DoesNotExist:
            return None
        
        members = UserSegmentMember.objects.filter(segment=segment).select_related('user_profile')
        profile_ids = [m.user_profile_id for m in members]
        
        profiles = UserProfile.objects.filter(id__in=profile_ids)
        
        stats = profiles.aggregate(
            total_visits=Sum('total_visits'),
            total_orders=Sum('total_orders'),
            total_spent=Sum('total_spent'),
            avg_visits=Avg('total_visits'),
            avg_orders=Avg('total_orders'),
            avg_spent=Avg('total_spent'),
        )
        
        return {
            'segment': {
                'id': segment.id,
                'name': segment.name,
                'description': segment.description,
                'user_count': segment.user_count,
                'is_dynamic': segment.is_dynamic,
                'conditions': segment.conditions,
            },
            'statistics': {
                'total_visits': stats['total_visits'] or 0,
                'total_orders': stats['total_orders'] or 0,
                'total_spent': float(stats['total_spent'] or 0),
                'avg_visits': float(stats['avg_visits'] or 0),
                'avg_orders': float(stats['avg_orders'] or 0),
                'avg_spent': float(stats['avg_spent'] or 0),
            }
        }
