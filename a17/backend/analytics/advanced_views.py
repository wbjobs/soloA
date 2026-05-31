from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime, timedelta
from django.utils import timezone
from .user_profile_service import UserProfileService, DEFAULT_TAGS_CONFIG
from .ab_test_service import ABTestService
from .custom_report_service import CustomReportService
from .models import (
    UserTag, UserTagValue, UserSegment, UserSegmentMember,
    ABTestExperiment, ABTestVariant, CustomReport, ReportTemplate,
    TAG_CATEGORY_CHOICES
)


class UserTagListView(APIView):
    def get(self, request):
        category = request.query_params.get('category')
        
        service = UserProfileService()
        
        if category:
            tags = service.get_all_tags(category=category)
        else:
            tags_by_category = service.get_tags_by_category()
            return Response({
                'success': True,
                'data': tags_by_category,
            })
        
        return Response({
            'success': True,
            'data': list(tags.values('tag_code', 'tag_name', 'tag_category', 'tag_type', 'description')),
        })

    def post(self, request):
        data = request.data
        tag = UserTag.objects.create(
            tag_code=data['tag_code'],
            tag_name=data['tag_name'],
            tag_category=data.get('tag_category', 'custom'),
            tag_type=data.get('tag_type', 'categorical'),
            tag_source=data.get('tag_source', 'manual'),
            description=data.get('description'),
            tag_values=data.get('tag_values', []),
            rule_config=data.get('rule_config'),
        )
        return Response({'success': True, 'data': {'id': tag.id}})


class UserTagDetailView(APIView):
    def get(self, request, tag_code):
        service = UserProfileService()
        distribution = service.get_tag_distribution(tag_code)
        return Response({'success': True, 'data': distribution})


class UserProfileDetailView(APIView):
    def get(self, request, user_id):
        service = UserProfileService()
        profile = service.get_user_profile_detail(user_id)
        if profile is None:
            return Response(
                {'success': False, 'error': 'User not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response({'success': True, 'data': profile})


class CalculateUserTagsView(APIView):
    def post(self, request):
        service = UserProfileService()
        
        result = service.initialize_default_tags()
        
        return Response({
            'success': True,
            'data': {'message': 'Default tags initialized', **result},
        })


class BatchCalculateTagsView(APIView):
    def post(self, request):
        data = request.data
        user_ids = data.get('user_ids')
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        
        if start_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if end_date:
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        service = UserProfileService()
        result = service.batch_update_user_tags(user_ids, start_date, end_date)
        
        return Response({'success': True, 'data': result})


class UserSearchView(APIView):
    def post(self, request):
        data = request.data
        tag_conditions = data.get('tag_conditions', [])
        limit = int(data.get('limit', 100))
        
        service = UserProfileService()
        users = service.search_users_by_tags(tag_conditions, limit=limit)
        
        return Response({
            'success': True,
            'data': list(users.values('user_id', 'total_visits', 'total_orders', 'total_spent', 'segment')),
        })


class UserSegmentListView(APIView):
    def get(self, request):
        segments = UserSegment.objects.filter(is_active=True)
        return Response({
            'success': True,
            'data': list(segments.values(
                'id', 'name', 'description', 'user_count', 'is_dynamic', 'created_at'
            )),
        })

    def post(self, request):
        data = request.data
        service = UserProfileService()
        
        segment = service.create_user_segment(
            name=data['name'],
            description=data.get('description', ''),
            conditions=data.get('conditions', {}),
            is_dynamic=data.get('is_dynamic', True),
        )
        
        return Response({
            'success': True,
            'data': {'id': segment.id, 'name': segment.name, 'user_count': segment.user_count},
        })


class UserSegmentDetailView(APIView):
    def get(self, request, segment_id):
        service = UserProfileService()
        overview = service.get_segment_overview(segment_id)
        if overview is None:
            return Response(
                {'success': False, 'error': 'Segment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        return Response({'success': True, 'data': overview})

    def post(self, request, segment_id):
        service = UserProfileService()
        try:
            segment = UserSegment.objects.get(id=segment_id)
        except UserSegment.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Segment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        count = service.refresh_segment_members(segment)
        return Response({'success': True, 'data': {'user_count': count}})


class ABTestExperimentListView(APIView):
    def get(self, request):
        status_filter = request.query_params.get('status')
        service = ABTestService()
        
        experiments = service.get_all_experiments(status=status_filter)
        
        data = []
        for exp in experiments:
            variants = list(exp.variants.values(
                'id', 'name', 'variant_key', 'is_control', 'sample_size',
                'conversions', 'revenue'
            ))
            data.append({
                'id': exp.id,
                'name': exp.name,
                'experiment_key': exp.experiment_key,
                'status': exp.status,
                'primary_metric': exp.primary_metric,
                'start_date': exp.start_date.isoformat() if exp.start_date else None,
                'end_date': exp.end_date.isoformat() if exp.end_date else None,
                'variants': variants,
                'created_at': exp.created_at.isoformat(),
            })
        
        return Response({'success': True, 'data': data})

    def post(self, request):
        data = request.data
        service = ABTestService()
        
        try:
            experiment = service.create_experiment(
                name=data['name'],
                description=data.get('description', ''),
                experiment_key=data['experiment_key'],
                variants_config=data['variants'],
                primary_metric=data.get('primary_metric', 'conversion_rate'),
                secondary_metrics=data.get('secondary_metrics', []),
                traffic_percentage=data.get('traffic_percentage', 100),
                target_users=data.get('target_users', 'all'),
            )
            return Response({
                'success': True,
                'data': {'id': experiment.id, 'experiment_key': experiment.experiment_key},
            })
        except ValueError as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class ABTestExperimentDetailView(APIView):
    def get(self, request, experiment_id):
        service = ABTestService()
        try:
            result = service.get_experiment_results(experiment_id)
            return Response({'success': True, 'data': result})
        except ABTestExperiment.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Experiment not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def post(self, request, experiment_id):
        action = request.data.get('action')
        service = ABTestService()
        
        try:
            if action == 'start':
                experiment = service.start_experiment(experiment_id)
            elif action == 'pause':
                experiment = service.pause_experiment(experiment_id)
            elif action == 'end':
                experiment = service.end_experiment(experiment_id)
            else:
                return Response(
                    {'success': False, 'error': 'Invalid action'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            return Response({
                'success': True,
                'data': {'id': experiment.id, 'status': experiment.status},
            })
        except ValueError as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ABTestExperiment.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Experiment not found'},
                status=status.HTTP_404_NOT_FOUND
            )

    def delete(self, request, experiment_id):
        service = ABTestService()
        try:
            service.delete_experiment(experiment_id)
            return Response({'success': True})
        except ValueError as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
        except ABTestExperiment.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Experiment not found'},
                status=status.HTTP_404_NOT_FOUND
            )


class ABTestAssignmentView(APIView):
    def get(self, request):
        experiment_key = request.query_params.get('experiment_key')
        user_id = request.query_params.get('user_id')
        
        if not all([experiment_key, user_id]):
            return Response(
                {'success': False, 'error': 'experiment_key and user_id required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        service = ABTestService()
        variant = service.assign_variant(experiment_key, user_id)
        
        if variant is None:
            return Response({
                'success': True,
                'data': {'assigned': False, 'message': 'User not in experiment'},
            })
        
        return Response({
            'success': True,
            'data': {
                'assigned': True,
                'variant': {
                    'variant_key': variant.variant_key,
                    'variant_name': variant.name,
                    'is_control': variant.is_control,
                    'config': variant.config,
                },
            },
        })


class ABTestGenerateMockView(APIView):
    def post(self, request, experiment_id):
        service = ABTestService()
        days = int(request.data.get('days', 30))
        
        try:
            result = service.generate_mock_data(experiment_id, days)
            return Response({'success': True, 'data': result})
        except ABTestExperiment.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Experiment not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        except ValueError as e:
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )


class CustomReportConfigView(APIView):
    def get(self, request):
        service = CustomReportService()
        return Response({
            'success': True,
            'data': {
                'dimensions': service.get_available_dimensions(),
                'metrics': service.get_available_metrics(),
                'chart_types': service.get_available_chart_types(),
            },
        })


class CustomReportListView(APIView):
    def get(self, request):
        service = CustomReportService()
        reports = service.list_reports()
        
        data = list(reports.values(
            'id', 'name', 'description', 'chart_type',
            'is_public', 'is_favorite', 'created_at', 'updated_at'
        ))
        return Response({'success': True, 'data': data})

    def post(self, request):
        data = request.data
        service = CustomReportService()
        
        report = service.create_report(
            name=data['name'],
            dimensions=data.get('dimensions', []),
            metrics=data.get('metrics', []),
            chart_type=data.get('chart_type', 'line'),
            description=data.get('description'),
            filters=data.get('filters', {}),
            date_range_type=data.get('date_range_type', 'last_7_days'),
        )
        
        return Response({
            'success': True,
            'data': {'id': report.id, 'name': report.name},
        })


class CustomReportDetailView(APIView):
    def get(self, request, report_id):
        service = CustomReportService()
        detail = service.get_report_detail(report_id)
        return Response({'success': True, 'data': detail})

    def put(self, request, report_id):
        service = CustomReportService()
        service.update_report(report_id, **request.data)
        return Response({'success': True})

    def delete(self, request, report_id):
        service = CustomReportService()
        service.delete_report(report_id)
        return Response({'success': True})


class CustomReportExecuteView(APIView):
    def get(self, request, report_id):
        service = CustomReportService()
        result = service.execute_report(report_id)
        return Response({'success': True, 'data': result})

    def post(self, request):
        data = request.data
        service = CustomReportService()
        
        start_date = data.get('start_date')
        end_date = data.get('end_date')
        if start_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        if end_date:
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        result = service.execute_query(
            dimensions=data.get('dimensions', []),
            metrics=data.get('metrics', []),
            filters=data.get('filters', {}),
            start_date=start_date,
            end_date=end_date,
        )
        return Response({'success': True, 'data': result})


class ReportTemplateListView(APIView):
    def get(self, request):
        category = request.query_params.get('category')
        service = CustomReportService()
        templates = service.list_templates(category)
        
        return Response({
            'success': True,
            'data': list(templates.values(
                'id', 'name', 'description', 'category', 'is_default'
            )),
        })

    def post(self, request):
        data = request.data
        service = CustomReportService()
        
        template = service.create_template(
            name=data['name'],
            config=data.get('config', {}),
            category=data.get('category', 'general'),
            is_default=data.get('is_default', False),
        )
        
        return Response({
            'success': True,
            'data': {'id': template.id},
        })


class ApplyTemplateView(APIView):
    def post(self, request, template_id):
        data = request.data
        service = CustomReportService()
        
        report = service.create_report_from_template(
            template_id,
            name=data.get('name'),
        )
        
        return Response({
            'success': True,
            'data': {'id': report.id},
        })
