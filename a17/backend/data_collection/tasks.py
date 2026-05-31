import json
import uuid
from datetime import datetime, timedelta
from collections import defaultdict
from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.utils import timezone
from django.db import transaction
from .clickhouse_client import get_clickhouse_client
from .models import CleanedBehaviorLog, UserProfile


BATCH_SIZE = 10000
CHUNK_SIZE = 5000
SOFT_TIME_LIMIT = 300
HARD_TIME_LIMIT = 600
USER_PROFILE_BATCH_SIZE = 2000


@shared_task(
    name='data_collection.tasks.clean_raw_logs',
    soft_time_limit=SOFT_TIME_LIMIT,
    time_limit=HARD_TIME_LIMIT,
    autoretry_for=(SoftTimeLimitExceeded, Exception),
    retry_kwargs={'max_retries': 3, 'countdown': 60},
    rate_limit='10/m'
)
def clean_raw_logs(time_range_hours=1):
    ch_client = get_clickhouse_client()
    
    now = timezone.now()
    start_time = now - timedelta(hours=time_range_hours)
    
    total_processed = 0
    total_invalid = 0
    
    try:
        count_result = ch_client.execute_query("""
            SELECT count(*)
            FROM raw_behavior_logs
            WHERE timestamp >= %(start_time)s AND timestamp < %(end_time)s
        """, {'start_time': start_time, 'end_time': now})
        
        total_count = count_result[0][0] if count_result else 0
        
        if total_count == 0:
            return {'processed': 0, 'invalid': 0, 'total': 0}
        
        offset = 0
        while offset < total_count:
            batch_logs = ch_client.execute_query("""
                SELECT id, user_id, session_id, event_type, product_id, page_url,
                       timestamp, user_agent, ip_address, device_type, event_data
                FROM raw_behavior_logs
                WHERE timestamp >= %(start_time)s AND timestamp < %(end_time)s
                ORDER BY timestamp
                LIMIT %(batch_size)s OFFSET %(offset)s
            """, {
                'start_time': start_time,
                'end_time': now,
                'batch_size': BATCH_SIZE,
                'offset': offset
            })
            
            if not batch_logs:
                break
            
            cleaned_events, invalid_count = _process_batch(batch_logs)
            total_processed += len(cleaned_events)
            total_invalid += invalid_count
            
            if cleaned_events:
                _persist_batch(ch_client, cleaned_events)
            
            offset += BATCH_SIZE
    
    except SoftTimeLimitExceeded:
        _trigger_residual_cleaning.delay(start_time.isoformat())
        return {
            'processed': total_processed,
            'invalid': total_invalid,
            'status': 'timeout_partial',
            'message': '任务超时，剩余数据将由后续任务处理'
        }
    except Exception as e:
        return {
            'error': str(e),
            'processed': total_processed,
            'invalid': total_invalid,
        }
    
    return {
        'processed': total_processed,
        'invalid': total_invalid,
        'total': total_count,
    }


def _process_batch(batch_logs):
    cleaned_events = []
    invalid_count = 0
    now = datetime.now()
    
    valid_types = {'view', 'click', 'add_to_cart', 'remove_from_cart', 'checkout', 'purchase'}
    
    for log in batch_logs:
        log_id, user_id, session_id, event_type, product_id, page_url, \
        timestamp, user_agent, ip_address, device_type, event_data = log
        
        if not (session_id and event_type and page_url and timestamp):
            invalid_count += 1
            continue
        
        if event_type not in valid_types:
            invalid_count += 1
            continue
        
        if timestamp > now:
            invalid_count += 1
            continue
        
        try:
            event_data_dict = json.loads(event_data) if event_data else {}
        except json.JSONDecodeError:
            event_data_dict = {}
        
        duration = event_data_dict.get('duration', 0)
        order_id = event_data_dict.get('order_id')
        order_amount = event_data_dict.get('order_amount')
        
        cleaned_events.append({
            'id': str(uuid.uuid4()),
            'user_id': user_id or f'anonymous_{session_id}',
            'session_id': session_id,
            'event_type': event_type,
            'product_id': product_id,
            'page_url': page_url,
            'timestamp': timestamp,
            'duration': int(duration) if duration else 0,
            'device_type': device_type or 'unknown',
            'ip_address': ip_address or '',
            'order_id': order_id,
            'order_amount': order_amount,
            'is_valid': 1,
        })
    
    return cleaned_events, invalid_count


def _persist_batch(ch_client, cleaned_events):
    ch_client.insert_processed_events(cleaned_events)
    
    mysql_records = [
        CleanedBehaviorLog(
            user_id=e['user_id'],
            session_id=e['session_id'],
            event_type=e['event_type'],
            product_id=e['product_id'],
            page_url=e['page_url'],
            timestamp=e['timestamp'],
            duration=e['duration'],
            device_type=e['device_type'],
            ip_address=e['ip_address'],
            order_id=e['order_id'],
            order_amount=e['order_amount'],
            is_valid=True,
        )
        for e in cleaned_events
    ]
    
    with transaction.atomic():
        for i in range(0, len(mysql_records), CHUNK_SIZE):
            chunk = mysql_records[i:i + CHUNK_SIZE]
            CleanedBehaviorLog.objects.bulk_create(chunk, batch_size=1000)
    
    _batch_update_user_profiles(cleaned_events)


def _batch_update_user_profiles(events):
    user_stats = defaultdict(lambda: {
        'visits': 0,
        'orders': 0,
        'spent': 0.0,
        'timestamps': [],
    })
    
    for event in events:
        user_id = event['user_id']
        if user_id.startswith('anonymous_'):
            continue
        
        stats = user_stats[user_id]
        stats['visits'] += 1
        stats['timestamps'].append(event['timestamp'])
        
        if event['event_type'] == 'purchase' and event['order_amount']:
            stats['orders'] += 1
            stats['spent'] += float(event['order_amount'])
    
    if not user_stats:
        return
    
    user_ids = list(user_stats.keys())
    
    existing_profiles = UserProfile.objects.filter(user_id__in=user_ids)
    existing_map = {p.user_id: p for p in existing_profiles}
    
    new_profiles = []
    profiles_to_update = []
    
    now = timezone.now()
    
    for user_id, stats in user_stats.items():
        max_timestamp = max(stats['timestamps'])
        
        if user_id in existing_map:
            profile = existing_map[user_id]
            profile.total_visits += stats['visits']
            profile.total_orders += stats['orders']
            profile.total_spent += stats['spent']
            if max_timestamp > profile.last_visit_time:
                profile.last_visit_time = max_timestamp
            profile.segment = _calculate_user_segment(profile, now)
            profiles_to_update.append(profile)
        else:
            profile = UserProfile(
                user_id=user_id,
                first_visit_time=min(stats['timestamps']),
                last_visit_time=max_timestamp,
                total_visits=stats['visits'],
                total_orders=stats['orders'],
                total_spent=stats['spent'],
                segment='new',
            )
            profile.segment = _calculate_user_segment(profile, now)
            new_profiles.append(profile)
    
    with transaction.atomic():
        if new_profiles:
            UserProfile.objects.bulk_create(new_profiles, batch_size=USER_PROFILE_BATCH_SIZE)
        
        if profiles_to_update:
            UserProfile.objects.bulk_update(
                profiles_to_update,
                ['total_visits', 'total_orders', 'total_spent', 'last_visit_time', 'segment'],
                batch_size=USER_PROFILE_BATCH_SIZE
            )


def _calculate_user_segment(profile, now=None):
    if now is None:
        now = timezone.now()
    
    days_since_last_visit = (now - profile.last_visit_time).days if profile.last_visit_time else 999
    
    if profile.total_orders == 0 and days_since_last_visit > 30:
        return 'lost'
    elif profile.total_orders == 0:
        return 'new'
    elif profile.total_orders >= 10 and days_since_last_visit < 7:
        return 'vip'
    elif profile.total_orders >= 3:
        return 'loyal'
    elif days_since_last_visit < 30:
        return 'active'
    else:
        return 'churned'


@shared_task(name='data_collection.tasks._trigger_residual_cleaning')
def _trigger_residual_cleaning(start_time_iso):
    pass


@shared_task
def import_sample_data():
    from datetime import datetime, timedelta
    import random
    
    ch_client = get_clickhouse_client()
    ch_client.initialize_database()
    ch_client.initialize_tables()
    
    now = datetime.now()
    sample_data = []
    
    event_types = ['view', 'click', 'add_to_cart', 'purchase']
    device_types = ['mobile', 'desktop', 'tablet']
    categories = ['电子产品', '服装', '家居', '美妆', '食品']
    
    for i in range(1000):
        days_ago = random.randint(0, 30)
        hours_ago = random.randint(0, 23)
        minutes_ago = random.randint(0, 59)
        timestamp = now - timedelta(days=days_ago, hours=hours_ago, minutes=minutes_ago)
        
        user_id = f'user_{random.randint(1, 200)}'
        session_id = f'session_{random.randint(1, 500)}'
        event_type = random.choices(event_types, weights=[0.5, 0.3, 0.15, 0.05])[0]
        product_id = f'product_{random.randint(1, 100)}'
        category = random.choice(categories)
        page_url = f'/products/{category}/{product_id}'
        
        event_data = {}
        if event_type == 'purchase':
            event_data['order_id'] = f'order_{i}'
            event_data['order_amount'] = round(random.uniform(10, 1000), 2)
        
        sample_data.append({
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'session_id': session_id,
            'event_type': event_type,
            'product_id': product_id,
            'page_url': page_url,
            'referer_url': None,
            'timestamp': timestamp,
            'user_agent': 'Mozilla/5.0',
            'ip_address': f'192.168.{random.randint(1, 254)}.{random.randint(1, 254)}',
            'device_type': random.choice(device_types),
            'browser': 'Chrome',
            'os': 'Windows',
            'event_data': json.dumps(event_data),
        })
    
    ch_client.client.execute("""
        INSERT INTO raw_behavior_logs (
            id, user_id, session_id, event_type, product_id, page_url,
            referer_url, timestamp, user_agent, ip_address, device_type,
            browser, os, event_data
        ) VALUES
    """, sample_data)
    
    return {'imported': len(sample_data)}
