"""
ScheduleTemplate Views
"""

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
import json

from apps.academic.interfaces.sube_context import assert_academic_sube_access, mandatory_academic_context
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.interfaces.serializers.schedule_template import (
    ScheduleTemplateListSerializer,
    ScheduleTemplateDetailSerializer,
    ScheduleTemplateCreateSerializer,
    ScheduleTemplateUpdateSerializer,
)


@csrf_exempt
@require_http_methods(["GET"])
def schedule_template_list_api(request):
    """
    GET /api/academic/schedule-templates/
    Tüm aktif zaman şablonlarını listele
    Query params: kurum_id, sube_id
    """
    try:
        ctx, err = mandatory_academic_context(request)
        if err:
            return err

        queryset = ScheduleTemplate.objects.filter(
            is_active=True,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        
        queryset = queryset.select_related('kurum', 'sube').order_by('name')
        
        serializer = ScheduleTemplateListSerializer(queryset, many=True)
        
        return JsonResponse({
            'success': True,
            'data': serializer.data,
            'count': queryset.count()
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def schedule_template_create_api(request):
    """
    POST /api/academic/schedule-templates/create/
    Yeni zaman şablonu oluştur
    """
    try:
        ctx, err = mandatory_academic_context(request)
        if err:
            return err

        data = json.loads(request.body)
        data.setdefault('kurum', ctx['kurum_id'])
        data.setdefault('sube', ctx['sube_id'])
        
        serializer = ScheduleTemplateCreateSerializer(data=data)
        
        if serializer.is_valid():
            template = serializer.save()
            response_serializer = ScheduleTemplateDetailSerializer(template)
            
            return JsonResponse({
                'success': True,
                'message': 'Zaman şablonu başarıyla oluşturuldu.',
                'data': response_serializer.data
            }, status=201)
        
        return JsonResponse({
            'success': False,
            'errors': serializer.errors
        }, status=400)
    
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON formatı.'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def schedule_template_detail_api(request, template_id):
    """
    GET /api/academic/schedule-templates/<id>/
    Zaman şablonu detayı (TimeSlot'ları ile birlikte)
    """
    try:
        template = ScheduleTemplate.objects.select_related(
            'kurum', 'sube'
        ).prefetch_related(
            'time_slots'
        ).get(pk=template_id, is_active=True)

        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate
        
        serializer = ScheduleTemplateDetailSerializer(template)
        
        return JsonResponse({
            'success': True,
            'data': serializer.data
        })
    
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Zaman şablonu bulunamadı.'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def schedule_template_update_api(request, template_id):
    """
    PUT/PATCH /api/academic/schedule-templates/<id>/update/
    Zaman şablonu güncelle
    """
    try:
        template = ScheduleTemplate.objects.get(pk=template_id, is_active=True)

        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate
        
        data = json.loads(request.body)
        
        serializer = ScheduleTemplateUpdateSerializer(
            template, 
            data=data, 
            partial=(request.method == 'PATCH')
        )
        
        if serializer.is_valid():
            template = serializer.save()
            response_serializer = ScheduleTemplateDetailSerializer(template)
            
            return JsonResponse({
                'success': True,
                'message': 'Zaman şablonu başarıyla güncellendi.',
                'data': response_serializer.data
            })
        
        return JsonResponse({
            'success': False,
            'errors': serializer.errors
        }, status=400)
    
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Zaman şablonu bulunamadı.'
        }, status=404)
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON formatı.'
        }, status=400)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def schedule_template_delete_api(request, template_id):
    """
    DELETE /api/academic/schedule-templates/<id>/delete/
    Zaman şablonu sil (soft delete)
    """
    try:
        template = ScheduleTemplate.objects.get(pk=template_id, is_active=True)

        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate
        
        # Soft delete - ilişkili TimeSlot'lar da deaktif edilecek
        template.soft_delete()
        
        return JsonResponse({
            'success': True,
            'message': 'Zaman şablonu başarıyla silindi.'
        })
    
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'Zaman şablonu bulunamadı.'
        }, status=404)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)
