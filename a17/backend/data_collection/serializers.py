from rest_framework import serializers


class BehaviorLogSerializer(serializers.Serializer):
    user_id = serializers.CharField(max_length=64, allow_null=True, allow_blank=True)
    session_id = serializers.CharField(max_length=64, required=True)
    event_type = serializers.CharField(max_length=32, required=True)
    product_id = serializers.CharField(max_length=64, allow_null=True, required=False)
    page_url = serializers.CharField(max_length=512, required=True)
    referer_url = serializers.CharField(max_length=512, allow_null=True, required=False)
    timestamp = serializers.DateTimeField(required=True)
    user_agent = serializers.CharField(max_length=1024, allow_null=True, required=False)
    ip_address = serializers.CharField(max_length=64, allow_null=True, required=False)
    device_type = serializers.CharField(max_length=32, allow_null=True, required=False)
    browser = serializers.CharField(max_length=64, allow_null=True, required=False)
    os = serializers.CharField(max_length=64, allow_null=True, required=False)
    event_data = serializers.JSONField(allow_null=True, required=False)

    def validate_event_type(self, value):
        valid_types = ['view', 'click', 'add_to_cart', 'remove_from_cart', 'checkout', 'purchase']
        if value not in valid_types:
            raise serializers.ValidationError(f'Invalid event type. Must be one of: {valid_types}')
        return value
