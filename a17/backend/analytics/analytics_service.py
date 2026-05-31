import pandas as pd
from datetime import datetime, timedelta, date
from django.utils import timezone
from django.db.models import Count, Sum, Avg, Q
from decimal import Decimal
from data_collection.models import CleanedBehaviorLog, DailyStats, UserProfile
from data_collection.clickhouse_client import get_clickhouse_client
from .models import ConversionFunnel, UserRetention, ProductPerformance


class AnalyticsService:
    def __init__(self):
        self.ch_client = get_clickhouse_client()
        self._use_ch_aggregation = True

    def get_overview_stats(self, start_date, end_date):
        if self._use_ch_aggregation:
            try:
                return self._get_overview_stats_ch(start_date, end_date)
            except Exception:
                pass
        
        return self._get_overview_stats_mysql(start_date, end_date)

    def _get_overview_stats_ch(self, start_date, end_date):
        result = self.ch_client.get_funnel_stats(start_date, end_date)
        
        stats_map = {row[0]: row[1] for row in result}
        
        view_users = stats_map.get('view', 0)
        click_users = stats_map.get('click', 0)
        cart_users = stats_map.get('add_to_cart', 0)
        purchase_users = stats_map.get('purchase', 0)
        
        events_result = self.ch_client.execute_query("""
            SELECT
                event_type,
                count() AS event_count
            FROM user_behavior_events
            WHERE
                toDate(timestamp) >= %(start_date)s
                AND toDate(timestamp) <= %(end_date)s
                AND is_valid = 1
                AND event_type IN ('view', 'click', 'add_to_cart', 'purchase')
            GROUP BY event_type
        """, {'start_date': start_date, 'end_date': end_date})
        
        events_map = {row[0]: row[1] for row in events_result}
        
        pv = events_map.get('view', 0)
        uv = view_users
        clicks = events_map.get('click', 0)
        add_to_carts = events_map.get('add_to_cart', 0)
        purchases = events_map.get('purchase', 0)
        
        revenue_result = self.ch_client.execute_query("""
            SELECT COALESCE(sum(order_amount), 0)
            FROM user_behavior_events
            WHERE
                toDate(timestamp) >= %(start_date)s
                AND toDate(timestamp) <= %(end_date)s
                AND event_type = 'purchase'
                AND is_valid = 1
        """, {'start_date': start_date, 'end_date': end_date})
        
        total_revenue = float(revenue_result[0][0]) if revenue_result and revenue_result[0] else 0
        
        click_through_rate = (click_users / view_users * 100) if view_users > 0 else 0
        cart_conversion_rate = (cart_users / view_users * 100) if view_users > 0 else 0
        purchase_conversion_rate = (purchase_users / view_users * 100) if view_users > 0 else 0
        overall_conversion_rate = (purchase_users / uv * 100) if uv > 0 else 0
        
        avg_order_value = (total_revenue / purchases) if purchases > 0 else 0
        
        return {
            'pv': pv,
            'uv': uv,
            'clicks': clicks,
            'add_to_carts': add_to_carts,
            'purchases': purchases,
            'total_revenue': round(total_revenue, 2),
            'click_through_rate': round(click_through_rate, 2),
            'cart_conversion_rate': round(cart_conversion_rate, 2),
            'purchase_conversion_rate': round(purchase_conversion_rate, 2),
            'overall_conversion_rate': round(overall_conversion_rate, 2),
            'avg_order_value': round(avg_order_value, 2),
        }

    def _get_overview_stats_mysql(self, start_date, end_date):
        logs = CleanedBehaviorLog.objects.filter(
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            is_valid=True
        )

        pv = logs.filter(event_type='view').count()
        view_users = logs.filter(event_type='view').values('user_id').distinct().count()
        click_users = logs.filter(event_type='click').values('user_id').distinct().count()
        cart_users = logs.filter(event_type='add_to_cart').values('user_id').distinct().count()
        purchase_users = logs.filter(event_type='purchase').values('user_id').distinct().count()
        uv = view_users
        
        click_logs = logs.filter(event_type='click')
        add_to_cart_logs = logs.filter(event_type='add_to_cart')
        purchase_logs = logs.filter(event_type='purchase')
        
        clicks = click_logs.count()
        add_to_carts = add_to_cart_logs.count()
        purchases = purchase_logs.count()
        
        revenue_agg = purchase_logs.aggregate(total=Sum('order_amount'))
        total_revenue = float(revenue_agg['total'] or 0)
        
        click_through_rate = (click_users / view_users * 100) if view_users > 0 else 0
        cart_conversion_rate = (cart_users / view_users * 100) if view_users > 0 else 0
        purchase_conversion_rate = (purchase_users / view_users * 100) if view_users > 0 else 0
        overall_conversion_rate = (purchase_users / uv * 100) if uv > 0 else 0
        
        avg_order_value = (total_revenue / purchases) if purchases > 0 else 0
        
        return {
            'pv': pv,
            'uv': uv,
            'clicks': clicks,
            'add_to_carts': add_to_carts,
            'purchases': purchases,
            'total_revenue': round(total_revenue, 2),
            'click_through_rate': round(click_through_rate, 2),
            'cart_conversion_rate': round(cart_conversion_rate, 2),
            'purchase_conversion_rate': round(purchase_conversion_rate, 2),
            'overall_conversion_rate': round(overall_conversion_rate, 2),
            'avg_order_value': round(avg_order_value, 2),
        }

    def get_daily_trend(self, start_date, end_date):
        stats = DailyStats.objects.filter(
            date__gte=start_date,
            date__lte=end_date
        ).order_by('date')
        
        dates = []
        pv_data = []
        uv_data = []
        order_data = []
        revenue_data = []
        
        for stat in stats:
            dates.append(stat.date.strftime('%Y-%m-%d'))
            pv_data.append(stat.pv)
            uv_data.append(stat.uv)
            order_data.append(stat.orders)
            revenue_data.append(float(stat.order_amount))
        
        if not dates:
            if self._use_ch_aggregation:
                try:
                    return self._get_daily_trend_ch(start_date, end_date)
                except Exception:
                    pass
            
            logs = CleanedBehaviorLog.objects.filter(
                timestamp__date__gte=start_date,
                timestamp__date__lte=end_date,
                is_valid=True
            )
            
            df = pd.DataFrame(list(logs.values(
                'timestamp', 'event_type', 'user_id', 'order_amount'
            )))
            
            if not df.empty:
                df['date'] = pd.to_datetime(df['timestamp']).dt.date
                unique_dates = sorted(df['date'].unique())
                
                for d in unique_dates:
                    day_df = df[df['date'] == d]
                    dates.append(d.strftime('%Y-%m-%d'))
                    pv_data.append(len(day_df[day_df['event_type'] == 'view']))
                    uv_data.append(day_df['user_id'].nunique())
                    purchases = day_df[day_df['event_type'] == 'purchase']
                    order_data.append(len(purchases))
                    revenue_data.append(float(purchases['order_amount'].sum()))
        
        return {
            'dates': dates,
            'pv': pv_data,
            'uv': uv_data,
            'orders': order_data,
            'revenue': revenue_data,
        }

    def _get_daily_trend_ch(self, start_date, end_date):
        result = self.ch_client.execute_query("""
            SELECT
                toDate(timestamp) AS date,
                countIf(event_type = 'view') AS pv,
                uniqExactIf(user_id, event_type = 'view') AS uv,
                countIf(event_type = 'purchase') AS orders,
                sumIf(order_amount, event_type = 'purchase') AS revenue
            FROM user_behavior_events
            WHERE
                toDate(timestamp) >= %(start_date)s
                AND toDate(timestamp) <= %(end_date)s
                AND is_valid = 1
            GROUP BY date
            ORDER BY date
        """, {'start_date': start_date, 'end_date': end_date})
        
        dates = []
        pv_data = []
        uv_data = []
        order_data = []
        revenue_data = []
        
        for row in result:
            d, pv, uv, orders, revenue = row
            dates.append(d.strftime('%Y-%m-%d') if hasattr(d, 'strftime') else str(d))
            pv_data.append(pv)
            uv_data.append(uv)
            order_data.append(orders)
            revenue_data.append(float(revenue or 0))
        
        return {
            'dates': dates,
            'pv': pv_data,
            'uv': uv_data,
            'orders': order_data,
            'revenue': revenue_data,
        }

    def get_conversion_funnel(self, start_date, end_date):
        if self._use_ch_aggregation:
            try:
                return self._get_conversion_funnel_ch(start_date, end_date)
            except Exception:
                pass
        
        logs = CleanedBehaviorLog.objects.filter(
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            is_valid=True
        )
        
        view_users = logs.filter(event_type='view').values('user_id').distinct().count()
        click_users = logs.filter(event_type='click').values('user_id').distinct().count()
        cart_users = logs.filter(event_type='add_to_cart').values('user_id').distinct().count()
        purchase_users = logs.filter(event_type='purchase').values('user_id').distinct().count()
        
        stages = [
            {'name': '浏览', 'users': view_users},
            {'name': '点击', 'users': click_users},
            {'name': '加购', 'users': cart_users},
            {'name': '下单', 'users': purchase_users},
        ]
        
        for i, stage in enumerate(stages):
            if i == 0:
                stage['percentage'] = 100
                stage['drop_off'] = 0
            else:
                stage['percentage'] = (stage['users'] / view_users * 100) if view_users > 0 else 0
                prev_percentage = stages[i-1]['percentage']
                stage['drop_off'] = prev_percentage - stage['percentage']
        
        return stages

    def _get_conversion_funnel_ch(self, start_date, end_date):
        result = self.ch_client.get_funnel_stats(start_date, end_date)
        
        stats_map = {row[0]: row[1] for row in result}
        
        view_users = stats_map.get('view', 0)
        
        stages = [
            {'name': '浏览', 'users': view_users},
            {'name': '点击', 'users': stats_map.get('click', 0)},
            {'name': '加购', 'users': stats_map.get('add_to_cart', 0)},
            {'name': '下单', 'users': stats_map.get('purchase', 0)},
        ]
        
        for i, stage in enumerate(stages):
            if i == 0:
                stage['percentage'] = 100
                stage['drop_off'] = 0
            else:
                stage['percentage'] = (stage['users'] / view_users * 100) if view_users > 0 else 0
                prev_percentage = stages[i-1]['percentage']
                stage['drop_off'] = prev_percentage - stage['percentage']
        
        return stages

    def calculate_retention(self, start_date, end_date):
        if self._use_ch_aggregation:
            try:
                return self._calculate_retention_ch(start_date, end_date)
            except Exception:
                pass
        
        cohort_size = 10
        days = (end_date - start_date).days + 1
        cohorts = min(4, days // 7 + 1)
        
        result = []
        
        for cohort_idx in range(cohorts):
            cohort_date = start_date + timedelta(days=cohort_idx * 7)
            if cohort_date > end_date:
                break
            
            cohort_start = cohort_date
            cohort_end = min(cohort_date + timedelta(days=6), end_date)
            
            cohort_users = set()
            logs = CleanedBehaviorLog.objects.filter(
                timestamp__date__gte=cohort_start,
                timestamp__date__lte=cohort_end,
                is_valid=True
            )
            for log in logs:
                cohort_users.add(log.user_id)
            
            cohort_size = len(cohort_users)
            if cohort_size == 0:
                continue
            
            retention = {
                'cohort_date': cohort_start.strftime('%Y-%m-%d'),
                'cohort_size': cohort_size,
                'days': [],
                'rates': [],
            }
            
            for day_offset in [0, 1, 3, 7, 14, 30]:
                day_date = cohort_start + timedelta(days=day_offset)
                if day_date > end_date:
                    continue
                
                day_logs = CleanedBehaviorLog.objects.filter(
                    timestamp__date=day_date,
                    user_id__in=cohort_users,
                    is_valid=True
                )
                
                active_users = day_logs.values('user_id').distinct().count()
                rate = (active_users / cohort_size * 100) if cohort_size > 0 else 0
                
                retention['days'].append(f'Day {day_offset}')
                retention['rates'].append(round(rate, 2))
            
            result.append(retention)
        
        return result

    def _calculate_retention_ch(self, start_date, end_date):
        result = self.ch_client.get_user_retention_aggregated(start_date, end_date)
        
        retention_list = []
        for row in result:
            cohort_date, cohort_size, day0, day1, day3, day7, day14, day30 = row
            
            retention = {
                'cohort_date': cohort_date.strftime('%Y-%m-%d') if hasattr(cohort_date, 'strftime') else str(cohort_date),
                'cohort_size': cohort_size,
                'days': ['Day 0', 'Day 1', 'Day 3', 'Day 7', 'Day 14', 'Day 30'],
                'rates': [],
            }
            
            for day_val in [day0, day1, day3, day7, day14, day30]:
                rate = (day_val / cohort_size * 100) if cohort_size > 0 else 0
                retention['rates'].append(round(rate, 2))
            
            retention_list.append(retention)
        
        return retention_list

    def get_user_segment_distribution(self):
        segments = UserProfile.objects.values('segment').annotate(count=Count('id'))
        
        segment_names = {
            'new': '新用户',
            'active': '活跃用户',
            'loyal': '忠实用户',
            'vip': 'VIP用户',
            'churned': '流失用户',
            'lost': '流失访客',
        }
        
        data = []
        for seg in segments:
            data.append({
                'name': segment_names.get(seg['segment'], seg['segment']),
                'value': seg['count'],
            })
        
        return data

    def get_product_performance(self, start_date, end_date, limit=10):
        if self._use_ch_aggregation:
            try:
                return self._get_product_performance_ch(start_date, end_date, limit)
            except Exception:
                pass
        
        logs = CleanedBehaviorLog.objects.filter(
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            is_valid=True,
            product_id__isnull=False
        )
        
        product_stats = {}
        
        for log in logs:
            pid = log.product_id
            if pid not in product_stats:
                product_stats[pid] = {
                    'views': 0,
                    'clicks': 0,
                    'add_to_carts': 0,
                    'purchases': 0,
                    'revenue': 0,
                }
            
            stats = product_stats[pid]
            if log.event_type == 'view':
                stats['views'] += 1
            elif log.event_type == 'click':
                stats['clicks'] += 1
            elif log.event_type == 'add_to_cart':
                stats['add_to_carts'] += 1
            elif log.event_type == 'purchase':
                stats['purchases'] += 1
                stats['revenue'] += float(log.order_amount or 0)
        
        result = []
        for pid, stats in product_stats.items():
            ctr = (stats['clicks'] / stats['views'] * 100) if stats['views'] > 0 else 0
            conv = (stats['purchases'] / stats['views'] * 100) if stats['views'] > 0 else 0
            
            result.append({
                'product_id': pid,
                'product_name': f'商品 {pid}',
                'views': stats['views'],
                'clicks': stats['clicks'],
                'add_to_carts': stats['add_to_carts'],
                'purchases': stats['purchases'],
                'revenue': round(stats['revenue'], 2),
                'click_through_rate': round(ctr, 2),
                'conversion_rate': round(conv, 2),
            })
        
        result.sort(key=lambda x: x['revenue'], reverse=True)
        return result[:limit]

    def _get_product_performance_ch(self, start_date, end_date, limit=10):
        result = self.ch_client.execute_query(f"""
            SELECT
                product_id,
                countIf(event_type = 'view') AS views,
                countIf(event_type = 'click') AS clicks,
                countIf(event_type = 'add_to_cart') AS add_to_carts,
                countIf(event_type = 'purchase') AS purchases,
                sumIf(order_amount, event_type = 'purchase') AS revenue
            FROM user_behavior_events
            WHERE
                toDate(timestamp) >= %(start_date)s
                AND toDate(timestamp) <= %(end_date)s
                AND is_valid = 1
                AND product_id IS NOT NULL
            GROUP BY product_id
            ORDER BY revenue DESC
            LIMIT {limit}
        """, {'start_date': start_date, 'end_date': end_date})
        
        products = []
        for row in result:
            product_id, views, clicks, add_to_carts, purchases, revenue = row
            ctr = (clicks / views * 100) if views > 0 else 0
            conv = (purchases / views * 100) if views > 0 else 0
            
            products.append({
                'product_id': product_id,
                'product_name': f'商品 {product_id}',
                'views': views,
                'clicks': clicks,
                'add_to_carts': add_to_carts,
                'purchases': purchases,
                'revenue': round(float(revenue or 0), 2),
                'click_through_rate': round(ctr, 2),
                'conversion_rate': round(conv, 2),
            })
        
        return products

    def get_repeat_purchase_rate(self, start_date, end_date):
        if self._use_ch_aggregation:
            try:
                return self._get_repeat_purchase_rate_ch(start_date, end_date)
            except Exception:
                pass
        
        purchase_logs = CleanedBehaviorLog.objects.filter(
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            event_type='purchase',
            is_valid=True
        )
        
        user_orders = {}
        for log in purchase_logs:
            uid = log.user_id
            user_orders[uid] = user_orders.get(uid, 0) + 1
        
        total_buyers = len(user_orders)
        repeat_buyers = sum(1 for count in user_orders.values() if count >= 2)
        
        repeat_rate = (repeat_buyers / total_buyers * 100) if total_buyers > 0 else 0
        
        return {
            'total_buyers': total_buyers,
            'repeat_buyers': repeat_buyers,
            'repeat_purchase_rate': round(repeat_rate, 2),
        }

    def _get_repeat_purchase_rate_ch(self, start_date, end_date):
        result = self.ch_client.get_repeat_purchase_stats(start_date, end_date)
        
        if result and result[0]:
            total_buyers, repeat_buyers = result[0]
        else:
            total_buyers = 0
            repeat_buyers = 0
        
        repeat_rate = (repeat_buyers / total_buyers * 100) if total_buyers > 0 else 0
        
        return {
            'total_buyers': total_buyers,
            'repeat_buyers': repeat_buyers,
            'repeat_purchase_rate': round(repeat_rate, 2),
        }

    def calculate_daily_stats(self, target_date):
        logs = CleanedBehaviorLog.objects.filter(
            timestamp__date=target_date,
            is_valid=True
        )
        
        view_logs = logs.filter(event_type='view')
        click_logs = logs.filter(event_type='click')
        cart_logs = logs.filter(event_type='add_to_cart')
        purchase_logs = logs.filter(event_type='purchase')
        
        pv = view_logs.count()
        uv = logs.values('user_id').distinct().count()
        
        sessions = logs.values('session_id').distinct().count()
        
        session_views = view_logs.values('session_id').annotate(view_count=Count('id'))
        bounce_sessions = sum(1 for sv in session_views if sv['view_count'] <= 1)
        bounce_rate = (bounce_sessions / sessions * 100) if sessions > 0 else 0
        
        total_duration = logs.aggregate(total=Sum('duration'))['total'] or 0
        avg_session_duration = total_duration / sessions if sessions > 0 else 0
        
        orders = purchase_logs.count()
        revenue_agg = purchase_logs.aggregate(total=Sum('order_amount'))
        order_amount = float(revenue_agg['total'] or 0)
        
        stats, created = DailyStats.objects.update_or_create(
            date=target_date,
            defaults={
                'pv': pv,
                'uv': uv,
                'new_users': 0,
                'active_users': uv,
                'orders': orders,
                'order_amount': order_amount,
                'cart_adds': cart_logs.count(),
                'product_clicks': click_logs.count(),
                'bounce_rate': bounce_rate,
                'avg_session_duration': avg_session_duration,
            }
        )
        
        return stats

    def get_heatmap_data(self, start_date, end_date):
        if self._use_ch_aggregation:
            try:
                return self._get_heatmap_data_ch(start_date, end_date)
            except Exception:
                pass
        
        logs = CleanedBehaviorLog.objects.filter(
            timestamp__date__gte=start_date,
            timestamp__date__lte=end_date,
            is_valid=True
        )
        
        hour_category = {}
        categories = set()
        
        for log in logs:
            hour = log.timestamp.hour
            if log.product_id:
                try:
                    category = f'分类_{(int(log.product_id.split("_")[-1]) % 5) + 1}'
                except (ValueError, IndexError):
                    category = '分类_1'
                categories.add(category)
                key = (hour, category)
                hour_category[key] = hour_category.get(key, 0) + 1
        
        categories = sorted(list(categories)) if categories else ['分类_1', '分类_2', '分类_3', '分类_4', '分类_5']
        hours = list(range(24))
        
        heatmap_data = []
        for h in hours:
            for c in categories:
                value = hour_category.get((h, c), 0)
                heatmap_data.append([h, categories.index(c), value])
        
        return {
            'categories': categories,
            'hours': [f'{h:02d}:00' for h in hours],
            'data': heatmap_data,
        }

    def _get_heatmap_data_ch(self, start_date, end_date):
        result = self.ch_client.execute_query("""
            SELECT
                toHour(timestamp) AS hour,
                product_id,
                count() AS cnt
            FROM user_behavior_events
            WHERE
                toDate(timestamp) >= %(start_date)s
                AND toDate(timestamp) <= %(end_date)s
                AND is_valid = 1
                AND product_id IS NOT NULL
            GROUP BY hour, product_id
        """, {'start_date': start_date, 'end_date': end_date})
        
        hour_category = {}
        categories = set()
        
        for row in result:
            hour, product_id, cnt = row
            try:
                category = f'分类_{(int(str(product_id).split("_")[-1]) % 5) + 1}'
            except (ValueError, IndexError):
                category = '分类_1'
            categories.add(category)
            key = (int(hour), category)
            hour_category[key] = hour_category.get(key, 0) + int(cnt)
        
        categories = sorted(list(categories)) if categories else ['分类_1', '分类_2', '分类_3', '分类_4', '分类_5']
        hours = list(range(24))
        
        heatmap_data = []
        for h in hours:
            for c in categories:
                value = hour_category.get((h, c), 0)
                heatmap_data.append([h, categories.index(c), value])
        
        return {
            'categories': categories,
            'hours': [f'{h:02d}:00' for h in hours],
            'data': heatmap_data,
        }
