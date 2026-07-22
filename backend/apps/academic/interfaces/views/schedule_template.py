"""
ScheduleTemplate Views
"""

from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.http import JsonResponse
import json

from apps.academic.interfaces.sube_context import (
    assert_academic_sube_access,
    gate_schedule_template,
    mandatory_academic_context,
)
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
    """GET /api/academic/schedule-templates/"""
    try:
        ctx, err = mandatory_academic_context(request)
        if err:
            return err

        queryset = ScheduleTemplate.objects.filter(
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
        queryset = queryset.select_related(
            'kurum', 'sube', 'primary_weekly_cycle',
        ).prefetch_related('weekly_cycles', 'time_slots', 'schedule_versions').order_by('-is_active', 'name')

        serializer = ScheduleTemplateListSerializer(queryset, many=True)
        return JsonResponse({'success': True, 'data': serializer.data, 'count': queryset.count()})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def schedule_template_create_api(request):
    """POST /api/academic/schedule-templates/create/"""
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
            return JsonResponse({
                'success': True,
                'message': 'Zaman şablonu başarıyla oluşturuldu.',
                'data': ScheduleTemplateDetailSerializer(template).data,
            }, status=201)

        return JsonResponse({'success': False, 'errors': serializer.errors}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı.'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def schedule_template_detail_api(request, template_id):
    """GET /api/academic/schedule-templates/<id>/"""
    try:
        template = ScheduleTemplate.objects.select_related(
            'kurum', 'sube', 'primary_weekly_cycle',
        ).prefetch_related('time_slots').get(pk=template_id)

        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate

        return JsonResponse({
            'success': True,
            'data': ScheduleTemplateDetailSerializer(template).data,
        })
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["PUT", "PATCH"])
def schedule_template_update_api(request, template_id):
    """PUT/PATCH /api/academic/schedule-templates/<id>/update/"""
    try:
        template = ScheduleTemplate.objects.get(pk=template_id)
        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate

        data = json.loads(request.body)
        serializer = ScheduleTemplateUpdateSerializer(
            template, data=data, partial=(request.method == 'PATCH'),
        )
        if serializer.is_valid():
            template = serializer.save()
            return JsonResponse({
                'success': True,
                'message': 'Zaman şablonu başarıyla güncellendi.',
                'data': ScheduleTemplateDetailSerializer(template).data,
            })

        return JsonResponse({'success': False, 'errors': serializer.errors}, status=400)
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı.'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["DELETE"])
def schedule_template_delete_api(request, template_id):
    """DELETE /api/academic/schedule-templates/<id>/delete/

    Aktif şablon → pasif yapılır.
    Pasif şablon → kullanılmıyorsa kalıcı silinir.
    """
    try:
        template = ScheduleTemplate.objects.get(pk=template_id)
        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate

        if template.is_active:
            template.soft_delete()
            return JsonResponse({
                'success': True,
                'action': 'deactivated',
                'message': 'Zaman şablonu pasif yapıldı.',
            })

        try:
            template.hard_delete()
        except ValueError as exc:
            return JsonResponse({'success': False, 'error': str(exc)}, status=400)

        return JsonResponse({
            'success': True,
            'action': 'deleted',
            'message': 'Zaman şablonu kalıcı olarak silindi.',
        })
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def schedule_template_copy_api(request, template_id):
    """POST /api/academic/schedule-templates/<id>/copy/"""
    try:
        from apps.academic.domain.timeslot import TimeSlot

        source = ScheduleTemplate.objects.prefetch_related(
            'time_slots',
        ).get(pk=template_id, is_active=True)

        gate = assert_academic_sube_access(request, source.kurum_id, source.sube_id, allow_null_sube=True)
        if gate:
            return gate

        data = json.loads(request.body or '{}')
        copy_name = (data.get('name') or f'{source.name} (Kopya)').strip()
        base_name = copy_name
        suffix = 2
        while ScheduleTemplate.objects.filter(
            kurum_id=source.kurum_id,
            sube_id=source.sube_id,
            name__iexact=copy_name,
            is_active=True,
        ).exists():
            copy_name = f'{base_name} {suffix}'
            suffix += 1

        new_template = ScheduleTemplate.objects.create(
            kurum_id=source.kurum_id,
            sube_id=source.sube_id,
            name=copy_name,
            description=source.description,
            gun_yapisi_label=source.gun_yapisi_label or '',
            is_active=True,
            is_default=False,
        )

        for slot in source.time_slots.filter(is_active=True).order_by('order'):
            TimeSlot.objects.create(
                schedule_template=new_template,
                slot_type=slot.slot_type,
                name=slot.name,
                start_time=slot.start_time,
                end_time=slot.end_time,
                order=slot.order,
                is_active=True,
            )

        return JsonResponse({
            'success': True,
            'message': 'Şablon kopyalandı.',
            'data': ScheduleTemplateDetailSerializer(new_template).data,
        }, status=201)
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=404)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON formatı.'}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def schedule_template_usage_api(request, template_id):
    """GET /api/academic/schedule-templates/<id>/usage/"""
    try:
        from apps.academic.domain.schedule_version import ScheduleVersion

        template = ScheduleTemplate.objects.get(pk=template_id)
        gate = assert_academic_sube_access(request, template.kurum_id, template.sube_id, allow_null_sube=True)
        if gate:
            return gate

        versions = ScheduleVersion.objects.filter(
            schedule_template=template,
        ).select_related('term', 'egitim_yili').order_by('-updated_at')

        data = [{
            'id': v.id,
            'name': v.name,
            'is_active_version': v.is_active,
            'term_name': v.term.name if v.term_id else None,
            'egitim_yili_name': str(v.egitim_yili) if v.egitim_yili_id else None,
        } for v in versions]

        return JsonResponse({'success': True, 'data': data, 'count': len(data)})
    except ScheduleTemplate.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=404)
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def schedule_template_export_api(request, template_id):
    """GET /api/academic/schedule-templates/<id>/export/?format=csv|xlsx — kurumsal dışa aktarma."""
    from shared.export.style_manager import ExportColumn, ExportStat, ReportMeta

    ctx, template, err = gate_schedule_template(request, template_id, is_active=False)
    if err:
        return err

    slots = list(template.time_slots.filter(is_active=True).order_by('order'))

    rows = [{
        'order': slot.order,
        'name': slot.name,
        'start_time': slot.start_time.strftime('%H:%M') if slot.start_time else '',
        'end_time': slot.end_time.strftime('%H:%M') if slot.end_time else '',
        'duration': slot.duration,
        'slot_type_display': slot.slot_type_display,
    } for slot in slots]

    columns = [
        ExportColumn(key='order', label='Sıra', type='integer'),
        ExportColumn(key='name', label='Ad', type='text'),
        ExportColumn(key='start_time', label='Başlangıç', type='text'),
        ExportColumn(key='end_time', label='Bitiş', type='text'),
        ExportColumn(key='duration', label='Süre (dk)', type='integer'),
        ExportColumn(key='slot_type_display', label='Tip', type='text'),
    ]

    user = request.user
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    meta = ReportMeta(
        report_title='DERS SAATLERİ LİSTESİ',
        kurum_ad=template.kurum.ad if template.kurum_id else '',
        sube_ad=template.sube.ad if template.sube_id else '',
        generated_by=generated_by,
        extra={'template_name': template.name},
    )

    lesson_count = sum(1 for slot in slots if not slot.is_break)
    break_count = len(slots) - lesson_count
    stats = [
        ExportStat(label='Toplam Slot', value=len(slots), type='integer'),
        ExportStat(label='Ders', value=lesson_count, type='integer'),
        ExportStat(label='Mola', value=break_count, type='integer'),
    ]

    fmt = (request.GET.get('format') or 'xlsx').lower()
    filename = f'{template.name}_ders_saatleri'
    if fmt == 'csv':
        from shared.export import CsvExportService
        return CsvExportService.export(rows, columns, meta=meta, filename=filename)

    from shared.export import ExcelExportService
    return ExcelExportService.export(rows, columns, meta=meta, stats=stats, filename=filename, orientation='portrait')
