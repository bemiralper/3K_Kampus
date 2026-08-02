"""
Takvim modülü — Bildirim API View'ları

Endpoint'ler:
- GET  /bildirimler/            → Kullanıcı bildirimleri listele
- GET  /bildirimler/ozet/       → Okunmamış sayı + son 5 bildirim
- POST /bildirimler/<id>/oku/   → Bildirimi okundu işaretle
- POST /bildirimler/hepsini-oku/ → Tümünü okundu işaretle
- GET  /bildirim-loglar/        → Bildirim logları (admin)
- GET  /bildirim-loglar/istatistik/ → İstatistikler (admin)
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.takvim.application.notification_service import (
    AppNotificationService, NotificationLogService,
)
from apps.takvim.helpers import _get_kurum_id, _get_user_id


def _require_user_and_kurum(request):
    """
    (kurum_id, user_id, hata_yanıtı) döndürür.

    Oturum yoksa 401 verilir: bu uçlar arayüzde sürekli yoklandığı için 400
    dönmek hem istemcinin "oturum bitti" akışını tetiklemiyor hem de log'da
    gerçek hata gibi görünüyordu.
    """
    user_id = _get_user_id(request)
    if not user_id:
        return None, None, JsonResponse(
            {
                'success': False,
                'error': 'Oturum açmanız gerekiyor.',
                'code': 'not_authenticated',
            },
            status=401,
        )
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return None, None, JsonResponse(
            {'success': False, 'error': 'Kurum seçilmedi.', 'code': 'kurum_required'},
            status=400,
        )
    return kurum_id, user_id, None


def serialize_notification(n):
    return {
        'id': str(n.id),
        'baslik': n.baslik,
        'mesaj': n.mesaj,
        'ikon': n.ikon,
        'renk': n.renk,
        'url': n.url,
        'event_id': str(n.event_id) if n.event_id else None,
        'is_read': n.is_read,
        'ekran_mesaji': n.ekran_mesaji,
        'read_at': n.read_at.isoformat() if n.read_at else None,
        'created_at': n.created_at.isoformat() if n.created_at else None,
        'alici_tip': n.alici_tip,
    }


def serialize_log(log):
    return {
        'id': str(log.id),
        'event_id': str(log.event_id) if log.event_id else None,
        'user_id': log.user_id,
        'alici_tip': log.alici_tip,
        'kanal': log.kanal,
        'durum': log.durum,
        'baslik': log.baslik,
        'mesaj': log.mesaj[:100],
        'hata_mesaji': log.hata_mesaji,
        'deneme_sayisi': log.deneme_sayisi,
        'sent_at': log.sent_at.isoformat() if log.sent_at else None,
        'created_at': log.created_at.isoformat() if log.created_at else None,
    }


# ══════════════════════════════════════════════════════════
# BİLDİRİMLER (kullanıcı tarafı)
# ══════════════════════════════════════════════════════════

@csrf_exempt
def api_notification_list(request):
    """Kullanıcı bildirimlerini listele"""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id, user_id, err = _require_user_and_kurum(request)
    if err:
        return err

    unread_only = request.GET.get('unread_only') == 'true'
    limit = min(int(request.GET.get('limit', 50)), 100)

    service = AppNotificationService()
    notifications = service.get_notifications(user_id, kurum_id, unread_only, limit)

    return JsonResponse({
        'success': True,
        'data': [serialize_notification(n) for n in notifications],
    })


@csrf_exempt
def api_notification_summary(request):
    """Bildirim özeti — header badge için"""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id, user_id, err = _require_user_and_kurum(request)
    if err:
        return err

    service = AppNotificationService()
    summary = service.get_summary(user_id, kurum_id)

    return JsonResponse({
        'success': True,
        'data': {
            'unread_count': summary['unread_count'],
            'recent': [serialize_notification(n) for n in summary['recent']],
        },
    })


@csrf_exempt
def api_notification_screen(request):
    """Okunmamış ekran mesajı bildirimleri — giriş banner'ı için."""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id, user_id, err = _require_user_and_kurum(request)
    if err:
        return err

    limit = min(int(request.GET.get('limit', 5)), 10)
    service = AppNotificationService()
    notifications = service.get_screen_messages(user_id, kurum_id, limit)

    return JsonResponse({
        'success': True,
        'data': [serialize_notification(n) for n in notifications],
    })


@csrf_exempt
def api_notification_mark_screen_shown(request, pk):
    """Ekran mesajı banner'ı gösterildi olarak işaretle."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    _kurum_id, _user_id, err = _require_user_and_kurum(request)
    if err:
        return err

    service = AppNotificationService()
    service.mark_ekran_gosterildi(pk)
    return JsonResponse({'success': True, 'message': 'Ekran mesajı kapatıldı'})


@csrf_exempt
def api_notification_mark_read(request, pk):
    """Bildirimi okundu işaretle"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    service = AppNotificationService()
    service.mark_as_read(pk)

    return JsonResponse({'success': True, 'message': 'Bildirim okundu olarak işaretlendi'})


@csrf_exempt
def api_notification_mark_all_read(request):
    """Tüm bildirimleri okundu işaretle"""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id, user_id, err = _require_user_and_kurum(request)
    if err:
        return err

    service = AppNotificationService()
    service.mark_all_as_read(user_id, kurum_id)

    return JsonResponse({'success': True, 'message': 'Tüm bildirimler okundu'})


# ══════════════════════════════════════════════════════════
# BİLDİRİM LOGLARI (admin tarafı)
# ══════════════════════════════════════════════════════════

@csrf_exempt
def api_notification_logs(request):
    """Bildirim logları — admin paneli için"""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    event_id = request.GET.get('event_id')
    service = NotificationLogService()

    if event_id:
        logs = service.get_event_logs(event_id)
    else:
        from apps.takvim.domain.models import NotificationLog
        logs = NotificationLog.objects.filter(kurum_id=kurum_id).order_by('-created_at')[:100]

    return JsonResponse({
        'success': True,
        'data': [serialize_log(l) for l in logs],
    })


@csrf_exempt
def api_notification_stats(request):
    """Bildirim istatistikleri"""
    if request.method != 'GET':
        return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)

    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    days = int(request.GET.get('days', 30))
    service = NotificationLogService()
    stats = service.get_stats(kurum_id, days)

    return JsonResponse({
        'success': True,
        'data': stats,
    })
