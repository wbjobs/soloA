import json
import uuid
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import BehaviorLogSerializer
from .clickhouse_client import get_clickhouse_client


class CollectLogView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        serializer = BehaviorLogSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {'success': False, 'errors': serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = serializer.validated_data
        log_id = str(uuid.uuid4())
        user_id = data.get('user_id') or f'anonymous_{data.get("session_id", "unknown")}'

        log_data = {
            'id': log_id,
            'user_id': user_id,
            'session_id': data['session_id'],
            'event_type': data['event_type'],
            'product_id': data.get('product_id'),
            'page_url': data['page_url'],
            'referer_url': data.get('referer_url'),
            'timestamp': data['timestamp'],
            'user_agent': data.get('user_agent') or request.META.get('HTTP_USER_AGENT', ''),
            'ip_address': data.get('ip_address') or self._get_client_ip(request),
            'device_type': data.get('device_type') or 'unknown',
            'browser': data.get('browser') or 'unknown',
            'os': data.get('os') or 'unknown',
            'event_data': json.dumps(data.get('event_data') or {}),
        }

        try:
            ch_client = get_clickhouse_client()
            ch_client.insert_raw_log(log_data)
            return Response(
                {'success': True, 'log_id': log_id},
                status=status.HTTP_200_OK
            )
        except Exception as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0]
        return request.META.get('REMOTE_ADDR', '')


class BatchCollectLogView(APIView):
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        logs = request.data
        if not isinstance(logs, list):
            return Response(
                {'success': False, 'error': 'Expected array of logs'},
                status=status.HTTP_400_BAD_REQUEST
            )

        valid_logs = []
        invalid_logs = []

        for log_data in logs:
            serializer = BehaviorLogSerializer(data=log_data)
            if serializer.is_valid():
                data = serializer.validated_data
                valid_logs.append({
                    'id': str(uuid.uuid4()),
                    'user_id': data.get('user_id') or f'anonymous_{data.get("session_id", "unknown")}',
                    'session_id': data['session_id'],
                    'event_type': data['event_type'],
                    'product_id': data.get('product_id'),
                    'page_url': data['page_url'],
                    'referer_url': data.get('referer_url'),
                    'timestamp': data['timestamp'],
                    'user_agent': data.get('user_agent') or '',
                    'ip_address': data.get('ip_address') or '',
                    'device_type': data.get('device_type') or 'unknown',
                    'browser': data.get('browser') or 'unknown',
                    'os': data.get('os') or 'unknown',
                    'event_data': json.dumps(data.get('event_data') or {}),
                })
            else:
                invalid_logs.append({'data': log_data, 'errors': serializer.errors})

        if valid_logs:
            try:
                ch_client = get_clickhouse_client()
                query = """
                    INSERT INTO raw_behavior_logs (
                        id, user_id, session_id, event_type, product_id, page_url,
                        referer_url, timestamp, user_agent, ip_address, device_type,
                        browser, os, event_data
                    ) VALUES
                """
                ch_client.client.execute(query, valid_logs)
            except Exception as e:
                return Response(
                    {'success': False, 'error': str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        return Response({
            'success': True,
            'received': len(logs),
            'processed': len(valid_logs),
            'invalid': len(invalid_logs),
        }, status=status.HTTP_200_OK)
