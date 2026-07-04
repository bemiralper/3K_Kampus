"""Zorunlu şube — akademik modül API."""
import json

from django.http import JsonResponse
from rest_framework import status
from rest_framework.response import Response

from shared.context import get_secili_kurum_id, get_secili_egitim_yili_id
from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def mandatory_academic_context(request):
    kurum_id = get_secili_kurum_id(request)
    if not kurum_id:
        return None, JsonResponse({'success': False, 'error': 'Kurum bağlamı zorunludur.'}, status=400)

    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, JsonResponse({'success': False, 'error': err['error']}, status=err['status'])

    return {
        'kurum_id': kurum_id,
        'sube_id': sube_id,
        'egitim_yili_id': get_secili_egitim_yili_id(request),
    }, None


def mandatory_academic_context_drf(request):
    ctx, err = mandatory_academic_context(request)
    if err:
        body = json.loads(err.content.decode())
        return None, Response({'success': False, 'error': body.get('error')}, status=err.status_code)
    return ctx, None


def assert_academic_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    err = _assert_record(request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube)
    if err:
        return JsonResponse({'success': False, 'error': err['error']}, status=err['status'])
    return None


def assert_academic_sube_access_drf(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    err = _assert_record(request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube)
    if err:
        return Response({'success': False, 'error': err['error']}, status=err['status'])
    return None


def _load_schedule_template(template_id, *, is_active=True):
    from apps.academic.domain.schedule_template import ScheduleTemplate

    qs = ScheduleTemplate.objects.filter(pk=template_id)
    if is_active:
        qs = qs.filter(is_active=True)
    return qs.first()


def gate_schedule_template(request, template_id, *, is_active=True, allow_null_sube=True):
    """Returns (ctx, template, None) or (None, None, error_response)."""
    ctx, err = mandatory_academic_context(request)
    if err:
        return None, None, err

    template = _load_schedule_template(template_id, is_active=is_active)
    if not template or template.kurum_id != ctx['kurum_id']:
        return None, None, JsonResponse({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=404)

    gate = assert_academic_sube_access(
        request, ctx['kurum_id'], template.sube_id, allow_null_sube=allow_null_sube,
    )
    if gate:
        return None, None, gate
    return ctx, template, None


def gate_schedule_template_drf(request, template_id, *, is_active=True, allow_null_sube=True):
    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return None, None, err

    template = _load_schedule_template(template_id, is_active=is_active)
    if not template or template.kurum_id != ctx['kurum_id']:
        return None, None, Response({'success': False, 'error': 'Zaman şablonu bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    gate = assert_academic_sube_access_drf(
        request, ctx['kurum_id'], template.sube_id, allow_null_sube=allow_null_sube,
    )
    if gate:
        return None, None, gate
    return ctx, template, None


def gate_weekly_cycle(request, cycle_id):
    from apps.academic.domain.weekly_cycle import WeeklyCycle

    try:
        cycle = WeeklyCycle.objects.select_related('schedule_template').get(pk=cycle_id, is_active=True)
    except WeeklyCycle.DoesNotExist:
        return None, None, JsonResponse({'success': False, 'error': 'Haftalık döngü bulunamadı.'}, status=404)
    return gate_schedule_template(request, cycle.schedule_template_id)


def gate_weekly_cycle_drf(request, cycle_id):
    from apps.academic.domain.weekly_cycle import WeeklyCycle

    try:
        cycle = WeeklyCycle.objects.select_related('schedule_template').get(pk=cycle_id, is_active=True)
    except WeeklyCycle.DoesNotExist:
        return None, None, Response({'detail': 'Haftalık döngü bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return gate_schedule_template_drf(request, cycle.schedule_template_id)


def gate_weekly_day_drf(request, day_id):
    from apps.academic.domain.weekly_day import WeeklyDay

    try:
        day = WeeklyDay.objects.select_related('weekly_cycle__schedule_template').get(pk=day_id)
    except WeeklyDay.DoesNotExist:
        return None, None, Response({'detail': 'Gün kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return gate_schedule_template_drf(request, day.weekly_cycle.schedule_template_id)


def gate_timeslot(request, timeslot_id):
    from apps.academic.domain.timeslot import TimeSlot

    try:
        timeslot = TimeSlot.objects.select_related('schedule_template').get(pk=timeslot_id, is_active=True)
    except TimeSlot.DoesNotExist:
        return None, None, JsonResponse({'success': False, 'error': 'Ders saati bulunamadı.'}, status=404)
    ctx, template, err = gate_schedule_template(request, timeslot.schedule_template_id)
    if err:
        return None, None, err
    return ctx, timeslot, None


def gate_sinif_drf(request, sinif_id):
    from apps.sinif.domain.models import Sinif

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return None, None, err

    try:
        sinif = Sinif.objects.get(pk=sinif_id)
    except Sinif.DoesNotExist:
        return None, None, Response({'error': 'Sınıf bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    gate = assert_academic_sube_access_drf(request, ctx['kurum_id'], sinif.sube_id)
    if gate:
        return None, None, gate
    return ctx, sinif, None


def gate_ders_drf(request, ders_id):
    from apps.egitim_tanimlari.models import Ders

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return None, None, err

    try:
        ders = Ders.objects.get(pk=ders_id, aktif_mi=True)
    except Ders.DoesNotExist:
        return None, None, Response({'error': 'Ders bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    gate = assert_academic_sube_access_drf(request, ctx['kurum_id'], ders.sube_id)
    if gate:
        return None, None, gate
    return ctx, ders, None


def gate_class_lesson_plan_drf(request, plan_id):
    from apps.academic.domain.class_lesson_plan import ClassLessonPlan

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return None, None, err

    try:
        plan = ClassLessonPlan.objects.select_related('sinif').get(pk=plan_id, is_active=True)
    except ClassLessonPlan.DoesNotExist:
        return None, None, Response({'error': 'Plan bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    gate = assert_academic_sube_access_drf(request, ctx['kurum_id'], plan.sinif.sube_id)
    if gate:
        return None, None, gate
    return ctx, plan, None


def gate_lesson_teacher_pool_drf(request, pool_id):
    from apps.academic.domain.lesson_teacher_pool import LessonTeacherPool

    ctx, err = mandatory_academic_context_drf(request)
    if err:
        return None, None, err

    try:
        pool = LessonTeacherPool.objects.select_related('ders').get(pk=pool_id, is_active=True)
    except LessonTeacherPool.DoesNotExist:
        return None, None, Response({'error': 'Havuz kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    gate = assert_academic_sube_access_drf(request, ctx['kurum_id'], pool.ders.sube_id)
    if gate:
        return None, None, gate
    return ctx, pool, None


def filter_by_sube_id(queryset, sube_id, field_path='sube_id'):
    return queryset.filter(**{field_path: sube_id})
