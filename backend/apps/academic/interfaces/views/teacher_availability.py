"""
Öğretmen Uygunluğu API
"""

import json
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.academic.domain.teacher_availability import (
    AvailabilityKind,
    SlotAvailabilityStatus,
    TeacherAvailabilitySet,
)
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.interfaces.sube_context import mandatory_academic_context
from apps.academic.services import teacher_availability_service as svc


def _parse_date(val):
    if not val:
        return None
    return datetime.strptime(str(val)[:10], '%Y-%m-%d').date()


@csrf_exempt
@require_http_methods(['GET'])
def teacher_availability_teachers_api(request):
    ctx, err = mandatory_academic_context(request)
    if err:
        return err
    data = svc.list_teachers(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        egitim_yili_id=ctx.get('egitim_yili_id'),
        search=request.GET.get('search', ''),
        brans=request.GET.get('brans', ''),
        sozlesme_turu=request.GET.get('sozlesme_turu', ''),
        aktif_only=request.GET.get('aktif_only', 'true') != 'false',
    )
    return JsonResponse({'success': True, 'data': data, 'count': len(data)})


@csrf_exempt
@require_http_methods(['GET'])
def teacher_availability_detail_api(request, personel_id):
    ctx, err = mandatory_academic_context(request)
    if err:
        return err

    contract = svc.get_active_contract(
        personel_id,
        ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        egitim_yili_id=ctx.get('egitim_yili_id'),
    )

    gorevlendirme = svc.get_teacher_gorevlendirme(
        personel_id,
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        egitim_yili_id=ctx.get('egitim_yili_id'),
    )
    gorevlendirme_data = svc.serialize_gorevlendirme(gorevlendirme)

    default_set = TeacherAvailabilitySet.objects.filter(
        personel_id=personel_id,
        sube_id=ctx['sube_id'],
        kind=AvailabilityKind.DEFAULT,
        is_active=True,
    ).prefetch_related('calendar_links', 'cells').first()

    temporary_sets = list(
        TeacherAvailabilitySet.objects.filter(
            personel_id=personel_id,
            sube_id=ctx['sube_id'],
            kind=AvailabilityKind.TEMPORARY,
            is_active=True,
        ).prefetch_related('calendar_links', 'cells').order_by('-valid_from')
    )

    calendars = WeeklyCycle.objects.filter(
        kurum_id=ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        is_active=True,
    ).order_by('name')

    cal_list = [
        {
            'id': c.id,
            'name': c.name,
            'description': c.description,
            'color': c.color,
            'icon': c.icon,
            'program_tipi': c.program_tipi,
            'program_tipi_display': c.get_program_tipi_display(),
            'active_day_count': c.active_day_count,
            'used_templates': [
                {'id': t.id, 'name': t.name} for t in c.used_schedule_templates()
            ],
        }
        for c in calendars
    ]

    default_data = svc.serialize_availability_set(default_set) if default_set else None
    temp_data = [svc.serialize_availability_set(s) for s in temporary_sets]

    summary_cells = default_data['cells'] if default_data else {}
    summary_cals = default_data['calendar_ids'] if default_data else []

    return JsonResponse({
        'success': True,
        'data': {
            'contract': contract,
            'gorevlendirme': gorevlendirme_data,
            'default_set': default_data,
            'temporary_sets': temp_data,
            'work_calendars': cal_list,
            'summary': svc.compute_detailed_summary(
                summary_cells,
                summary_cals,
                calendars=cal_list,
            ),
        },
    })


@csrf_exempt
@require_http_methods(['GET'])
def teacher_availability_grid_api(request, personel_id, calendar_id):
    ctx, err = mandatory_academic_context(request)
    if err:
        return err

    try:
        cycle = WeeklyCycle.objects.get(
            pk=calendar_id,
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
            is_active=True,
        )
    except WeeklyCycle.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Çalışma takvimi bulunamadı.'}, status=404)

    structure = svc.build_calendar_grid_structure(cycle)
    return JsonResponse({'success': True, 'data': structure})


@csrf_exempt
@require_http_methods(['PUT', 'POST'])
def teacher_availability_save_api(request, personel_id):
    ctx, err = mandatory_academic_context(request)
    if err:
        return err

    try:
        body = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Geçersiz JSON.'}, status=400)

    kind = body.get('kind', AvailabilityKind.DEFAULT)
    set_id = body.get('set_id')
    calendar_ids = body.get('calendar_ids') or []
    cells = body.get('cells') or {}
    force_save = body.get('force_save', False)

    contract = svc.get_active_contract(
        personel_id,
        ctx['kurum_id'],
        sube_id=ctx['sube_id'],
        egitim_yili_id=ctx.get('egitim_yili_id'),
    )
    warnings = svc.contract_conflicts(
        contract=contract,
        cells=cells,
        calendar_ids=calendar_ids,
    )
    if warnings and not force_save:
        return JsonResponse({
            'success': False,
            'warnings': warnings,
            'error': 'Sözleşme ile uyumsuzluk var. Yine de kaydetmek için force_save=true gönderin.',
        }, status=409)

    if kind == AvailabilityKind.DEFAULT:
        av_set = TeacherAvailabilitySet.objects.filter(
            personel_id=personel_id,
            sube_id=ctx['sube_id'],
            kind=AvailabilityKind.DEFAULT,
            is_active=True,
        ).first()
        if not av_set:
            av_set = svc.get_or_create_default_set(
                personel_id=personel_id,
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
            )
    else:
        if set_id:
            av_set = TeacherAvailabilitySet.objects.filter(
                pk=set_id,
                personel_id=personel_id,
                sube_id=ctx['sube_id'],
                kind=AvailabilityKind.TEMPORARY,
            ).first()
            if not av_set:
                return JsonResponse({'success': False, 'error': 'Geçici kayıt bulunamadı.'}, status=404)
        else:
            av_set = TeacherAvailabilitySet.objects.create(
                personel_id=personel_id,
                kurum_id=ctx['kurum_id'],
                sube_id=ctx['sube_id'],
                kind=AvailabilityKind.TEMPORARY,
                title=body.get('title') or 'Geçici Uygunluk',
                is_active=True,
            )

    av_set = svc.save_availability_set(
        av_set=av_set,
        calendar_ids=calendar_ids,
        cells=cells,
        title=body.get('title') or av_set.title,
        valid_from=_parse_date(body.get('valid_from')),
        valid_until=_parse_date(body.get('valid_until')),
    )

    payload = svc.serialize_availability_set(
        TeacherAvailabilitySet.objects.prefetch_related('calendar_links', 'cells').get(pk=av_set.pk)
    )
    cal_list = [
        {
            'id': c.id,
            'name': c.name,
            'program_tipi': c.program_tipi,
            'program_tipi_display': c.get_program_tipi_display(),
            'color': c.color,
        }
        for c in WeeklyCycle.objects.filter(
            id__in=payload['calendar_ids'],
            kurum_id=ctx['kurum_id'],
            sube_id=ctx['sube_id'],
        )
    ]
    payload['summary'] = svc.compute_detailed_summary(
        payload['cells'],
        payload['calendar_ids'],
        calendars=cal_list,
    )

    return JsonResponse({
        'success': True,
        'message': 'Uygunluk kaydedildi.',
        'data': payload,
        'warnings': warnings,
    })


@csrf_exempt
@require_http_methods(['DELETE'])
def teacher_availability_temp_delete_api(request, personel_id, set_id):
    ctx, err = mandatory_academic_context(request)
    if err:
        return err

    updated = TeacherAvailabilitySet.objects.filter(
        pk=set_id,
        personel_id=personel_id,
        sube_id=ctx['sube_id'],
        kind=AvailabilityKind.TEMPORARY,
    ).update(is_active=False)
    if not updated:
        return JsonResponse({'success': False, 'error': 'Kayıt bulunamadı.'}, status=404)
    return JsonResponse({'success': True, 'message': 'Geçici uygunluk silindi.'})
