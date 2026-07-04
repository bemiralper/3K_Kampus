"""
Takvim modülü — Kullanıcı Bildirim Tercihleri API View'ları

Endpoint'ler:
- GET  /bildirim-tercihleri/           → Kullanıcının tercihlerini listele
- POST /bildirim-tercihleri/           → Tercih oluştur/güncelle (upsert)
- DELETE /bildirim-tercihleri/<id>/     → Tercih sil
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.takvim.application.notification_service import UserPreferenceService
from apps.takvim.helpers import _get_kurum_id, _get_user_id


def serialize_preference(p):
    return {
        'id': str(p.id),
        'event_type_id': str(p.event_type_id) if p.event_type_id else None,
        'event_type_ad': p.event_type.ad if p.event_type_id else 'Genel',
        'event_type_renk': p.event_type.renk if p.event_type_id else '#6B7280',
        'event_type_ikon': p.event_type.ikon if p.event_type_id else '🔔',
        'app_enabled': p.app_enabled,
        'sms_enabled': p.sms_enabled,
        'email_enabled': p.email_enabled,
        'sessiz_baslangic': p.sessiz_baslangic.strftime('%H:%M') if p.sessiz_baslangic else None,
        'sessiz_bitis': p.sessiz_bitis.strftime('%H:%M') if p.sessiz_bitis else None,
    }


@csrf_exempt
def api_preference_list_create(request):
    """Bildirim tercihlerini listele veya oluştur/güncelle"""
    kurum_id = _get_kurum_id(request)
    user_id = _get_user_id(request)
    if not kurum_id or not user_id:
        return JsonResponse({'success': False, 'error': 'Yetkilendirme hatası'}, status=400)

    service = UserPreferenceService()

    if request.method == 'GET':
        prefs = service.get_preferences(user_id, kurum_id)
        return JsonResponse({
            'success': True,
            'data': [serialize_preference(p) for p in prefs],
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            pref = service.upsert_preference(user_id, kurum_id, data)
            return JsonResponse({
                'success': True,
                'data': serialize_preference(pref),
                'message': 'Tercih kaydedildi',
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_preference_delete(request, pk):
    """Tercih sil"""
    if request.method != 'DELETE':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    service = UserPreferenceService()
    try:
        service.delete_preference(pk)
        return JsonResponse({'success': True, 'message': 'Tercih silindi'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=400)
