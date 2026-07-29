"""Takvim — Resmi tatil listesi, senkron ve özel ders Tatil/Devam kararı."""
from __future__ import annotations

import json
from datetime import date as date_cls

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from apps.ozel_ders.services import resmi_tatil_karar_service, tatil_etkilenen_service
from apps.ozel_ders.services.errors import OzelDersError
from apps.takvim.application.resmi_tatil_service import ResmiTatilSyncService
from apps.takvim.helpers import _get_kurum_id, _get_sube_id, _get_user_id
from apps.takvim.interfaces.sube_context import resolve_mandatory_takvim_sube


def _int_or_none(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_date(value):
    if value in (None, ''):
        return None
    if isinstance(value, date_cls):
        return value
    return date_cls.fromisoformat(str(value)[:10])


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def api_resmi_tatil_list_sync(request):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    sube_id, err = resolve_mandatory_takvim_sube(request, kurum_id)
    if err:
        return err

    try:
        if request.method == 'GET':
            year = _int_or_none(request.GET.get('year')) or date_cls.today().year
            data = resmi_tatil_karar_service.list_resmi_tatiller_for_year(
                kurum_id=kurum_id,
                sube_id=sube_id,
                year=year,
            )
            return JsonResponse({'success': True, 'data': data})

        body = {}
        if request.body:
            try:
                body = json.loads(request.body.decode('utf-8'))
            except (json.JSONDecodeError, UnicodeDecodeError):
                body = {}
        year = _int_or_none(body.get('year'))
        result = resmi_tatil_karar_service.sync_resmi_tatiller(
            kurum_id=kurum_id,
            year=year,
            user_id=_get_user_id(request),
        )
        # Manuel sync sonrası ensure cache'ini de doldur
        ResmiTatilSyncService().mark_synced(kurum_id)
        return JsonResponse({'success': True, 'data': result})
    except OzelDersError as exc:
        return JsonResponse(
            {'success': False, 'error': exc.message, 'code': getattr(exc, 'code', None)},
            status=getattr(exc, 'status', 400),
        )


@csrf_exempt
@require_http_methods(['PATCH', 'POST'])
def api_resmi_tatil_karar(request):
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    sube_id, err = resolve_mandatory_takvim_sube(request, kurum_id)
    if err:
        return err

    try:
        body = {}
        if request.body:
            body = json.loads(request.body.decode('utf-8'))
        holiday_key = (body.get('holiday_key') or '').strip()
        day = _parse_date(body.get('date') or body.get('tarih'))
        if not holiday_key or not day:
            return JsonResponse(
                {'success': False, 'error': 'holiday_key ve date zorunludur.'},
                status=400,
            )
        if 'ozel_ders_aktif' not in body:
            return JsonResponse(
                {'success': False, 'error': 'ozel_ders_aktif zorunludur.'},
                status=400,
            )
        data = resmi_tatil_karar_service.set_karar(
            kurum_id=kurum_id,
            sube_id=sube_id,
            holiday_key=holiday_key,
            day=day,
            ozel_ders_aktif=bool(body.get('ozel_ders_aktif')),
        )
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return JsonResponse(
            {'success': False, 'error': exc.message, 'code': getattr(exc, 'code', None)},
            status=getattr(exc, 'status', 400),
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)


@csrf_exempt
@require_http_methods(['POST'])
def api_resmi_tatil_ensure(request):
    """24 saatte bir otomatik senkron (Genel Takvim açılışı)."""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    # Şube zorunlu değil ensure için; kurum geneli sync
    _ = _get_sube_id(request)

    body = {}
    if request.body:
        try:
            body = json.loads(request.body.decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            body = {}
    force = bool(body.get('force'))
    year = _int_or_none(body.get('year'))

    result = ResmiTatilSyncService().ensure_synced(
        kurum_id,
        year=year,
        user_id=_get_user_id(request),
        force=force,
    )
    return JsonResponse({'success': True, 'data': result})


@csrf_exempt
@require_http_methods(['GET'])
def api_resmi_tatil_etkilenen(request):
    """Belirli günde planlanan + mevcut özel ders oturumları."""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    sube_id, err = resolve_mandatory_takvim_sube(request, kurum_id)
    if err:
        return err

    day = _parse_date(request.GET.get('date') or request.GET.get('tarih'))
    if not day:
        return JsonResponse({'success': False, 'error': 'date zorunludur.'}, status=400)

    try:
        data = tatil_etkilenen_service.list_affected_for_date(
            kurum_id=kurum_id,
            sube_id=sube_id,
            day=day,
        )
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return JsonResponse(
            {'success': False, 'error': exc.message, 'code': getattr(exc, 'code', None)},
            status=getattr(exc, 'status', 400),
        )
    except ValueError as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)


@csrf_exempt
@require_http_methods(['POST'])
def api_resmi_tatil_cevre(request):
    """Resmi tatil ±1 gününü özel ders tatili olarak işaretle / kaldır."""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    # Kurum geneli Event — şube zorunlu değil ama context için çöz
    _, err = resolve_mandatory_takvim_sube(request, kurum_id)
    if err:
        return err

    try:
        body = {}
        if request.body:
            body = json.loads(request.body.decode('utf-8'))
        day = _parse_date(body.get('date') or body.get('tarih'))
        side = (body.get('side') or '').strip().lower()
        if not day or side not in ('prev', 'next'):
            return JsonResponse(
                {'success': False, 'error': 'date ve side (prev|next) zorunludur.'},
                status=400,
            )
        if 'aktif' not in body:
            return JsonResponse({'success': False, 'error': 'aktif zorunludur.'}, status=400)

        data = tatil_etkilenen_service.set_cevre_tatil(
            kurum_id=kurum_id,
            base_date=day,
            side=side,
            aktif=bool(body.get('aktif')),
            user_id=_get_user_id(request),
        )
        return JsonResponse({'success': True, 'data': data})
    except OzelDersError as exc:
        return JsonResponse(
            {'success': False, 'error': exc.message, 'code': getattr(exc, 'code', None)},
            status=getattr(exc, 'status', 400),
        )
    except (json.JSONDecodeError, UnicodeDecodeError, ValueError) as exc:
        return JsonResponse({'success': False, 'error': str(exc)}, status=400)
