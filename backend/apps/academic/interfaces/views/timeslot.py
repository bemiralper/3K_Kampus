"""
TimeSlot Views
"""

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
import json

from apps.academic.interfaces.sube_context import (
    filter_by_sube_id,
    gate_schedule_template,
    gate_timeslot,
    mandatory_academic_context,
)
from apps.academic.domain.timeslot import TimeSlot
from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.interfaces.serializers.timeslot import (
    TimeSlotSerializer,
    TimeSlotCreateSerializer,
    TimeSlotUpdateSerializer,
    TimeSlotBulkCreateSerializer,
)


@csrf_exempt
@require_http_methods(["GET"])
def timeslot_list_api(request):
    """
    GET /api/academic/timeslots/
    Tüm aktif ders saatlerini listele
    Query params: template_id
    """
    try:
        ctx, err = mandatory_academic_context(request)
        if err:
            return err

        queryset = TimeSlot.objects.filter(is_active=True)
        queryset = filter_by_sube_id(queryset, ctx['sube_id'], field_path='schedule_template__sube_id')

        template_id = request.GET.get('template_id')
        if template_id:
            _, _, gate_err = gate_schedule_template(request, template_id)
            if gate_err:
                return gate_err
            queryset = queryset.filter(schedule_template_id=template_id)
        
        queryset = queryset.select_related('schedule_template').order_by('order')
        
        serializer = TimeSlotSerializer(queryset, many=True)
        
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
def timeslot_create_api(request):
    """
    POST /api/academic/timeslots/create/
    Yeni ders saati oluştur
    """
    try:
        data = json.loads(request.body)

        template_id = data.get('schedule_template')
        if not template_id:
            return JsonResponse({'success': False, 'error': 'schedule_template zorunludur.'}, status=400)
        _, _, gate_err = gate_schedule_template(request, template_id)
        if gate_err:
            return gate_err
        
        serializer = TimeSlotCreateSerializer(data=data)
        
        if serializer.is_valid():
            timeslot = serializer.save()
            response_serializer = TimeSlotSerializer(timeslot)
            
            return JsonResponse({
                'success': True,
                'message': 'Ders saati başarıyla oluşturuldu.',
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
@require_http_methods(["POST"])
def timeslot_bulk_create_api(request):
    """
    POST /api/academic/timeslots/bulk-create/
    Toplu ders saati oluştur
    """
    try:
        data = json.loads(request.body)

        template_id = data.get('schedule_template_id')
        if not template_id:
            return JsonResponse({'success': False, 'error': 'schedule_template_id zorunludur.'}, status=400)
        _, _, gate_err = gate_schedule_template(request, template_id)
        if gate_err:
            return gate_err
        
        serializer = TimeSlotBulkCreateSerializer(data=data)
        
        if serializer.is_valid():
            timeslots = serializer.save()
            response_serializer = TimeSlotSerializer(timeslots, many=True)
            
            return JsonResponse({
                'success': True,
                'message': f'{len(timeslots)} ders saati başarıyla oluşturuldu.',
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
def timeslot_detail_api(request, timeslot_id):
    """
    GET /api/academic/timeslots/<id>/
    Ders saati detayı
    """
    try:
        _, timeslot, gate_err = gate_timeslot(request, timeslot_id)
        if gate_err:
            return gate_err
        
        serializer = TimeSlotSerializer(timeslot)
        
        return JsonResponse({
            'success': True,
            'data': serializer.data
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def timeslot_update_api(request, timeslot_id):
    """
    PUT/PATCH /api/academic/timeslots/<id>/update/
    Ders saati güncelle
    """
    try:
        _, timeslot, gate_err = gate_timeslot(request, timeslot_id)
        if gate_err:
            return gate_err
        
        data = json.loads(request.body)
        
        serializer = TimeSlotUpdateSerializer(
            timeslot, 
            data=data, 
            partial=(request.method == 'PATCH')
        )
        
        if serializer.is_valid():
            timeslot = serializer.save()
            response_serializer = TimeSlotSerializer(timeslot)
            
            return JsonResponse({
                'success': True,
                'message': 'Ders saati başarıyla güncellendi.',
                'data': response_serializer.data
            })
        
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
@require_http_methods(["DELETE"])
def timeslot_delete_api(request, timeslot_id):
    """
    DELETE /api/academic/timeslots/<id>/delete/
    Ders saati sil (soft delete)
    """
    try:
        _, timeslot, gate_err = gate_timeslot(request, timeslot_id)
        if gate_err:
            return gate_err
        
        timeslot.soft_delete()
        
        return JsonResponse({
            'success': True,
            'message': 'Ders saati başarıyla silindi.'
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def timeslot_reorder_api(request):
    """
    POST /api/academic/timeslots/reorder/
    Ders saatlerini yeniden sırala
    Body: { "template_id": 1, "orders": [{"id": 1, "order": 1}, {"id": 2, "order": 2}, ...] }
    """
    try:
        data = json.loads(request.body)
        
        template_id = data.get('template_id')
        orders = data.get('orders', [])
        
        if not template_id:
            return JsonResponse({
                'success': False,
                'error': 'template_id zorunludur.'
            }, status=400)
        
        if not orders:
            return JsonResponse({
                'success': False,
                'error': 'orders listesi zorunludur.'
            }, status=400)
        
        _, template, gate_err = gate_schedule_template(request, template_id)
        if gate_err:
            return gate_err
        
        # Sıraları güncelle
        updated_count = 0
        for order_data in orders:
            slot_id = order_data.get('id')
            new_order = order_data.get('order')
            
            if slot_id and new_order is not None:
                TimeSlot.objects.filter(
                    pk=slot_id,
                    schedule_template=template,
                    is_active=True
                ).update(order=new_order)
                updated_count += 1
        
        return JsonResponse({
            'success': True,
            'message': f'{updated_count} ders saati yeniden sıralandı.'
        })
    
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
def timeslot_by_template_api(request, template_id):
    """
    GET /api/academic/schedule-templates/<template_id>/timeslots/
    Belirli bir şablonun tüm ders saatlerini getir
    """
    try:
        _, template, gate_err = gate_schedule_template(request, template_id)
        if gate_err:
            return gate_err
        
        timeslots = TimeSlot.objects.filter(
            schedule_template=template,
            is_active=True
        ).order_by('order')
        
        serializer = TimeSlotSerializer(timeslots, many=True)
        
        return JsonResponse({
            'success': True,
            'data': serializer.data,
            'count': timeslots.count(),
            'template': {
                'id': template.id,
                'name': template.name
            }
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def timeslot_bulk_delete_api(request, template_id):
    """
    DELETE /api/academic/schedule-templates/<template_id>/timeslots/bulk-delete/
    Belirli bir şablonun tüm ders saatlerini sil (soft delete)
    """
    try:
        _, template, gate_err = gate_schedule_template(request, template_id)
        if gate_err:
            return gate_err
        
        # Aktif slotları say ve sil
        deleted_count = TimeSlot.objects.filter(
            schedule_template=template,
            is_active=True
        ).update(is_active=False)
        
        return JsonResponse({
            'success': True,
            'message': f'{deleted_count} adet ders saati silindi.',
            'deleted_count': deleted_count
        })
    
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# =====================================================
# SLOT GENERATOR ENDPOINTS
# =====================================================

@csrf_exempt
@require_http_methods(["POST"])
def timeslot_generate_preview_api(request):
    """
    POST /api/academic/timeslots/generate-preview/
    Toplu slot üretim önizlemesi
    
    Body:
    {
        "schedule_template_id": 1,
        "start_time": "08:30",
        "lesson_duration": 40,
        "short_break_duration": 10,
        "lesson_count": 8,
        "lunch_break_enabled": true,
        "lunch_break_after_lesson": 4,
        "lunch_break_duration": 60,
        "evening_break_enabled": false,
        "evening_break_after_lesson": 8,
        "evening_break_duration": 30
    }
    """
    try:
        from apps.academic.interfaces.serializers.timeslot import SlotGeneratorConfigSerializer
        from apps.academic.services.slot_generator import SlotGenerator, SlotConfig
        
        data = json.loads(request.body)
        
        # Validasyon
        serializer = SlotGeneratorConfigSerializer(data=data)
        if not serializer.is_valid():
            return JsonResponse({
                'success': False,
                'errors': serializer.errors
            }, status=400)
        
        validated_data = serializer.validated_data

        _, _, gate_err = gate_schedule_template(request, validated_data['schedule_template_id'])
        if gate_err:
            return gate_err
        
        # Config oluştur
        config = SlotConfig.from_dict(validated_data)
        
        # Generator
        generator = SlotGenerator(config)
        
        # Mevcut slot kontrolü
        existing_info = generator.check_existing_slots()
        
        # Önizleme
        preview = generator.generate_preview()
        summary = generator.get_summary()
        
        return JsonResponse({
            'success': True,
            'data': {
                'preview': preview,
                'summary': summary,
                'existing': existing_info,
                'config': {
                    'start_time': config.start_time.strftime('%H:%M'),
                    'lesson_duration': config.lesson_duration,
                    'short_break_duration': config.short_break_duration,
                    'lesson_count': config.lesson_count,
                    'lunch_break_enabled': config.lunch_break_enabled,
                    'lunch_break_after_lesson': config.lunch_break_after_lesson,
                    'lunch_break_duration': config.lunch_break_duration,
                    'evening_break_enabled': config.evening_break_enabled,
                    'evening_break_after_lesson': config.evening_break_after_lesson,
                    'evening_break_duration': config.evening_break_duration,
                }
            }
        })
    
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON formatı.'
        }, status=400)
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
@require_http_methods(["POST"])
def timeslot_generate_create_api(request):
    """
    POST /api/academic/timeslots/generate-create/
    Toplu slot üretimi ve kaydetme
    
    Body:
    {
        "schedule_template_id": 1,
        "start_time": "08:30",
        "lesson_duration": 40,
        "short_break_duration": 10,
        "lesson_count": 8,
        "lunch_break_enabled": true,
        "lunch_break_after_lesson": 4,
        "lunch_break_duration": 60,
        "evening_break_enabled": false,
        "evening_break_after_lesson": 8,
        "evening_break_duration": 30,
        "overwrite_existing": false
    }
    """
    try:
        from apps.academic.interfaces.serializers.timeslot import SlotGeneratorConfigSerializer
        from apps.academic.services.slot_generator import SlotGenerator, SlotConfig
        
        data = json.loads(request.body)
        
        # Validasyon
        serializer = SlotGeneratorConfigSerializer(data=data)
        if not serializer.is_valid():
            return JsonResponse({
                'success': False,
                'errors': serializer.errors
            }, status=400)
        
        validated_data = serializer.validated_data

        _, _, gate_err = gate_schedule_template(request, validated_data['schedule_template_id'])
        if gate_err:
            return gate_err
        
        # Config oluştur
        config = SlotConfig.from_dict(validated_data)
        
        # Generator
        generator = SlotGenerator(config)
        
        # Mevcut slot kontrolü
        existing_info = generator.check_existing_slots()
        
        # Eğer mevcut slotlar varsa ve overwrite_existing False ise hata döndür
        if existing_info['has_existing'] and not config.overwrite_existing:
            return JsonResponse({
                'success': False,
                'error': f'Bu şablonda {existing_info["existing_count"]} adet mevcut ders saati var. Üzerine yazmak için "overwrite_existing" parametresini true yapın.',
                'existing': existing_info
            }, status=409)  # Conflict
        
        # Slotları oluştur
        created_slots = generator.generate_create()
        summary = generator.get_summary()
        
        # Oluşturulan slotları serialize et
        from apps.academic.interfaces.serializers.timeslot import TimeSlotSerializer
        slots_data = TimeSlotSerializer(created_slots, many=True).data
        
        return JsonResponse({
            'success': True,
            'message': f'{len(created_slots)} adet ders saati başarıyla oluşturuldu.',
            'data': {
                'slots': slots_data,
                'summary': summary,
                'overwritten': config.overwrite_existing and existing_info['has_existing']
            }
        }, status=201)
    
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Geçersiz JSON formatı.'
        }, status=400)
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

