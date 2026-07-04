"""
Takvim modülü — Etkinlik (Event) API View'ları
"""
import json
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.takvim.application.service import EventService
from apps.takvim.infrastructure.repository import ReminderRepository
from apps.takvim.interfaces.sube_context import (
    assert_takvim_record_sube_access,
    resolve_mandatory_takvim_sube,
)
from apps.takvim.helpers import (
    _get_kurum_id, _get_egitim_yili_id, _get_donem_id,
    _get_user_id,
    serialize_event, serialize_event_compact, serialize_reminder,
)


def _parse_datetime(val):
    """ISO string → datetime"""
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    return datetime.fromisoformat(val.replace('Z', '+00:00'))


def _event_sube_gate(request, event):
    err = assert_takvim_record_sube_access(request, event.kurum_id, event.sube_id)
    if err:
        return err
    return None


@csrf_exempt
def api_event_list_create(request):
    """Etkinlikleri listele veya oluştur"""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    service = EventService()

    if request.method == 'GET':
        sube_id, err = resolve_mandatory_takvim_sube(request, kurum_id)
        if err:
            return err

        filters = {'sube_id': sube_id}
        p = request.GET

        egitim_yili_id = _get_egitim_yili_id(request)
        donem_id = _get_donem_id(request)
        if egitim_yili_id:
            filters['egitim_yili_id'] = egitim_yili_id
        if donem_id:
            filters['donem_id'] = donem_id

        if p.get('baslangic'):
            filters['baslangic'] = _parse_datetime(p['baslangic'])
        if p.get('bitis'):
            filters['bitis'] = _parse_datetime(p['bitis'])
        if p.get('event_type_id'):
            filters['event_type_id'] = p['event_type_id']
        if p.get('kategori'):
            filters['kategori'] = p['kategori']
        if p.get('durum'):
            filters['durum'] = p['durum']
        if p.get('salon_id'):
            filters['salon_id'] = p['salon_id']
        if p.get('ogretmen_id'):
            filters['ogretmen_id'] = int(p['ogretmen_id'])
        if p.get('sinif_id'):
            filters['sinif_id'] = int(p['sinif_id'])
        if p.get('search'):
            filters['search'] = p['search']

        events = service.list_events(kurum_id, filters)

        # compact=true → FullCalendar formatı
        if p.get('compact') == 'true':
            return JsonResponse({
                'success': True,
                'data': [serialize_event_compact(e) for e in events],
            })

        return JsonResponse({
            'success': True,
            'data': [serialize_event(e) for e in events],
        })

    elif request.method == 'POST':
        try:
            sube_id, err = resolve_mandatory_takvim_sube(request, kurum_id)
            if err:
                return err

            data = json.loads(request.body)
            user_id = _get_user_id(request)

            data['sube_id'] = sube_id
            if not data.get('egitim_yili_id'):
                egitim_yili_id = _get_egitim_yili_id(request)
                if egitim_yili_id:
                    data['egitim_yili_id'] = egitim_yili_id
            if not data.get('donem_id'):
                donem_id = _get_donem_id(request)
                if donem_id:
                    data['donem_id'] = donem_id

            # Datetime parsing
            data['baslangic'] = _parse_datetime(data.get('baslangic'))
            data['bitis'] = _parse_datetime(data.get('bitis'))
            if data.get('tekrar_bitis'):
                data['tekrar_bitis'] = data['tekrar_bitis']

            event = service.create_event(kurum_id, data, user_id)
            return JsonResponse({
                'success': True,
                'data': serialize_event(event),
                'message': 'Etkinlik oluşturuldu',
            }, status=201)
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_event_detail(request, pk):
    """Etkinlik detay / güncelle / sil"""
    service = EventService()

    if request.method == 'GET':
        try:
            event = service.get_event(pk)
            err = _event_sube_gate(request, event)
            if err:
                return err
            reminders = ReminderRepository.get_by_event(pk)
            data = serialize_event(event)
            data['reminders'] = [serialize_reminder(r) for r in reminders]
            return JsonResponse({'success': True, 'data': data})
        except ValueError as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=404)

    elif request.method == 'PUT':
        try:
            event = service.get_event(pk)
            err = _event_sube_gate(request, event)
            if err:
                return err
            data = json.loads(request.body)
            user_id = _get_user_id(request)
            if data.get('baslangic'):
                data['baslangic'] = _parse_datetime(data['baslangic'])
            if data.get('bitis'):
                data['bitis'] = _parse_datetime(data['bitis'])
            event = service.update_event(pk, data, user_id)
            return JsonResponse({
                'success': True,
                'data': serialize_event(event),
                'message': 'Etkinlik güncellendi',
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            event = service.get_event(pk)
            err = _event_sube_gate(request, event)
            if err:
                return err
            user_id = _get_user_id(request)
            service.delete_event(pk, user_id)
            return JsonResponse({'success': True, 'message': 'Etkinlik silindi'})
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_event_move(request, pk):
    """Drag & drop — etkinlik taşıma"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        service = EventService()
        event = service.get_event(pk)
        err = _event_sube_gate(request, event)
        if err:
            return err
        data = json.loads(request.body)
        user_id = _get_user_id(request)
        event = service.move_event(
            pk,
            _parse_datetime(data['baslangic']),
            _parse_datetime(data['bitis']),
            user_id,
        )
        return JsonResponse({
            'success': True,
            'data': serialize_event_compact(event),
            'message': 'Etkinlik taşındı',
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_event_resize(request, pk):
    """Resize — süre değişikliği"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        service = EventService()
        event = service.get_event(pk)
        err = _event_sube_gate(request, event)
        if err:
            return err
        data = json.loads(request.body)
        user_id = _get_user_id(request)
        event = service.resize_event(pk, _parse_datetime(data['bitis']), user_id)
        return JsonResponse({
            'success': True,
            'data': serialize_event_compact(event),
            'message': 'Süre güncellendi',
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
def api_event_status(request, pk):
    """Durum değiştir"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    try:
        service = EventService()
        event = service.get_event(pk)
        err = _event_sube_gate(request, event)
        if err:
            return err
        data = json.loads(request.body)
        user_id = _get_user_id(request)
        event = service.change_status(pk, data['durum'], user_id)
        return JsonResponse({
            'success': True,
            'data': serialize_event(event),
            'message': 'Durum güncellendi',
        })
    except (ValueError, Exception) as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
