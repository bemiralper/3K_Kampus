"""
Takvim modülü — Etkinlik Türü API View'ları
"""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.takvim.application.service import EventTypeService
from apps.takvim.helpers import _get_kurum_id, _get_user_id, serialize_event_type


@csrf_exempt
def api_event_type_list_create(request):
    """Etkinlik türlerini listele veya oluştur"""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    service = EventTypeService()

    if request.method == 'GET':
        types = service.list_types(kurum_id)
        if not any(t.kategori == 'GOREV' for t in types):
            EventTypeService.seed_defaults(kurum_id)
            types = service.list_types(kurum_id)
        return JsonResponse({
            'success': True,
            'data': [serialize_event_type(t, include_count=True) for t in types],
        })

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            event_type = service.create_type(kurum_id, data)
            return JsonResponse({
                'success': True,
                'data': serialize_event_type(event_type),
                'message': 'Etkinlik türü oluşturuldu',
            }, status=201)
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def api_event_type_detail(request, pk):
    """Etkinlik türü detay / güncelleme / silme"""
    service = EventTypeService()

    if request.method == 'GET':
        et = service.repo.get_by_id(pk)
        if not et:
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        return JsonResponse({'success': True, 'data': serialize_event_type(et)})

    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            et = service.update_type(pk, data)
            return JsonResponse({
                'success': True,
                'data': serialize_event_type(et),
                'message': 'Etkinlik türü güncellendi',
            })
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    elif request.method == 'DELETE':
        try:
            service.delete_type(pk)
            return JsonResponse({'success': True, 'message': 'Etkinlik türü silindi'})
        except (ValueError, Exception) as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def api_event_type_seed(request):
    """Varsayılan etkinlik türlerini oluştur (GET)"""
    kurum_id = _get_kurum_id(request)
    if not kurum_id:
        return JsonResponse({'success': False, 'error': 'Kurum seçilmedi'}, status=400)

    created = EventTypeService.seed_defaults(kurum_id)
    return JsonResponse({
        'success': True,
        'data': [serialize_event_type(t) for t in created],
        'message': f'{len(created)} varsayılan tür oluşturuldu',
    })
