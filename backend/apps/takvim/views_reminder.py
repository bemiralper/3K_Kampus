"""
Takvim modülü — Hatırlatma Ayarları API View'ları
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.takvim.application.service import ReminderSettingService
from apps.takvim.helpers import _get_kurum_id, serialize_reminder_setting


@csrf_exempt
def api_reminder_setting_list_create(request):
    """Hatırlatma ayarlarını listele veya oluştur"""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    service = ReminderSettingService()

    if request.method == 'GET':
        settings = service.list_settings(kurum_id)
        return JsonResponse({
            'success': True,
            'data': [serialize_reminder_setting(s) for s in settings],
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            setting = service.create_setting(kurum_id, data)
            return JsonResponse({
                'success': True,
                'data': serialize_reminder_setting(setting),
                'message': 'Hatırlatma ayarı oluşturuldu',
            }, status=201)
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_reminder_setting_detail(request, pk):
    """Hatırlatma ayarı güncelle / sil"""
    service = ReminderSettingService()

    if request.method == 'PUT':
        try:
            data = json.loads(request.body)
            setting = service.update_setting(pk, data)
            return JsonResponse({
                'success': True,
                'data': serialize_reminder_setting(setting),
                'message': 'Hatırlatma ayarı güncellendi',
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            service.delete_setting(pk)
            return JsonResponse({'success': True, 'message': 'Hatırlatma ayarı silindi'})
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)
