"""
Oda API Views
CRUD operations for Room management
"""
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json

from apps.oda.domain.models import Oda, OdaTuru
from apps.sube.domain.models import Sube
from shared.api_helpers import require_api_login
from shared.context import get_secili_kurum_id


def get_kurum_id(request):
    """Kurum ID — shared context çözümleyicisini kullan."""
    return get_secili_kurum_id(request)


@require_api_login
@require_http_methods(["GET"])
def oda_list_api(request):
    """
    Oda listesi
    GET /odalar/api/
    Query params: sube_id (optional)
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    # Filtreleme
    odalar = Oda.objects.filter(kurum_id=kurum_id).select_related('sube')
    
    # Şube filtresi
    sube_id = request.GET.get('sube_id')
    if sube_id:
        odalar = odalar.filter(sube_id=sube_id)
    
    # Aktif filtresi
    aktif = request.GET.get('aktif')
    if aktif == 'true':
        odalar = odalar.filter(aktif_mi=True)
    elif aktif == 'false':
        odalar = odalar.filter(aktif_mi=False)
    
    data = [{
        'id': oda.id,
        'ad': oda.ad,
        'kapasite': oda.kapasite,
        'oda_turu': oda.oda_turu,
        'oda_turu_display': oda.oda_turu_display,
        'aciklama': oda.aciklama,
        'aktif_mi': oda.aktif_mi,
        'sube': {
            'id': oda.sube.id,
            'ad': oda.sube.ad
        },
        'created_at': oda.created_at.isoformat() if oda.created_at else None,
    } for oda in odalar]
    
    return JsonResponse({'odalar': data})


@require_api_login
@require_http_methods(["GET"])
def oda_detail_api(request, oda_id):
    """
    Oda detay
    GET /odalar/api/<oda_id>/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        oda = Oda.objects.select_related('sube').get(id=oda_id, kurum_id=kurum_id)
    except Oda.DoesNotExist:
        return JsonResponse({'error': 'Oda bulunamadı'}, status=404)
    
    data = {
        'id': oda.id,
        'ad': oda.ad,
        'kapasite': oda.kapasite,
        'oda_turu': oda.oda_turu,
        'oda_turu_display': oda.oda_turu_display,
        'aciklama': oda.aciklama,
        'aktif_mi': oda.aktif_mi,
        'sube': {
            'id': oda.sube.id,
            'ad': oda.sube.ad
        },
        'created_at': oda.created_at.isoformat() if oda.created_at else None,
        'updated_at': oda.updated_at.isoformat() if oda.updated_at else None,
    }
    
    return JsonResponse(data)


@csrf_exempt
@require_api_login
@require_http_methods(["POST"])
def oda_create_api(request):
    """
    Yeni oda oluştur
    POST /odalar/api/create/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
    
    # Zorunlu alanlar
    sube_id = data.get('sube_id')
    ad = data.get('ad', '').strip()
    
    if not sube_id:
        return JsonResponse({'error': 'Şube seçimi zorunludur'}, status=400)
    if not ad:
        return JsonResponse({'error': 'Oda adı zorunludur'}, status=400)
    
    # Şube kontrolü
    try:
        sube = Sube.objects.get(id=sube_id, kurum_id=kurum_id)
    except Sube.DoesNotExist:
        return JsonResponse({'error': 'Geçersiz şube'}, status=400)
    
    # Aynı şubede aynı isimde oda var mı?
    if Oda.objects.filter(kurum_id=kurum_id, sube=sube, ad=ad).exists():
        return JsonResponse({'error': 'Bu şubede aynı isimde oda zaten var'}, status=400)
    
    # Oda oluştur
    oda = Oda.objects.create(
        kurum_id=kurum_id,
        sube=sube,
        ad=ad,
        kapasite=data.get('kapasite', 30),
        oda_turu=data.get('oda_turu', OdaTuru.DERSLIK),
        aciklama=data.get('aciklama', ''),
        aktif_mi=data.get('aktif_mi', True)
    )
    
    return JsonResponse({
        'success': True,
        'message': 'Oda başarıyla oluşturuldu',
        'oda': {
            'id': oda.id,
            'ad': oda.ad,
            'kapasite': oda.kapasite,
            'oda_turu': oda.oda_turu,
            'oda_turu_display': oda.oda_turu_display,
            'sube': {
                'id': oda.sube.id,
                'ad': oda.sube.ad
            }
        }
    }, status=201)


@csrf_exempt
@require_api_login
@require_http_methods(["PUT", "PATCH"])
def oda_update_api(request, oda_id):
    """
    Oda güncelle
    PUT/PATCH /odalar/api/<oda_id>/update/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        oda = Oda.objects.get(id=oda_id, kurum_id=kurum_id)
    except Oda.DoesNotExist:
        return JsonResponse({'error': 'Oda bulunamadı'}, status=404)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Geçersiz JSON'}, status=400)
    
    # Güncellenebilir alanlar
    if 'ad' in data:
        new_ad = data['ad'].strip()
        if new_ad:
            # Aynı şubede aynı isimde başka oda var mı?
            if Oda.objects.filter(kurum_id=kurum_id, sube=oda.sube, ad=new_ad).exclude(id=oda_id).exists():
                return JsonResponse({'error': 'Bu şubede aynı isimde oda zaten var'}, status=400)
            oda.ad = new_ad
    
    if 'kapasite' in data:
        oda.kapasite = data['kapasite']
    
    if 'oda_turu' in data:
        oda.oda_turu = data['oda_turu']
    
    if 'aciklama' in data:
        oda.aciklama = data['aciklama']
    
    if 'aktif_mi' in data:
        oda.aktif_mi = data['aktif_mi']
    
    # Şube değiştirme (dikkatli ol)
    if 'sube_id' in data:
        try:
            new_sube = Sube.objects.get(id=data['sube_id'], kurum_id=kurum_id)
            # Yeni şubede aynı isimde oda var mı?
            if Oda.objects.filter(kurum_id=kurum_id, sube=new_sube, ad=oda.ad).exclude(id=oda_id).exists():
                return JsonResponse({'error': 'Hedef şubede aynı isimde oda zaten var'}, status=400)
            oda.sube = new_sube
        except Sube.DoesNotExist:
            return JsonResponse({'error': 'Geçersiz şube'}, status=400)
    
    oda.save()
    
    return JsonResponse({
        'success': True,
        'message': 'Oda başarıyla güncellendi',
        'oda': {
            'id': oda.id,
            'ad': oda.ad,
            'kapasite': oda.kapasite,
            'oda_turu': oda.oda_turu,
            'oda_turu_display': oda.oda_turu_display,
            'sube': {
                'id': oda.sube.id,
                'ad': oda.sube.ad
            }
        }
    })


@csrf_exempt
@require_api_login
@require_http_methods(["DELETE"])
def oda_delete_api(request, oda_id):
    """
    Oda sil
    DELETE /odalar/api/<oda_id>/delete/
    """
    kurum_id = get_kurum_id(request)
    
    if not kurum_id:
        return JsonResponse({'error': 'Kurum bilgisi bulunamadı'}, status=400)
    
    try:
        oda = Oda.objects.get(id=oda_id, kurum_id=kurum_id)
    except Oda.DoesNotExist:
        return JsonResponse({'error': 'Oda bulunamadı'}, status=404)
    
    # Odaya bağlı sınıf var mı kontrol et
    sinif_count = oda.siniflar.count() if hasattr(oda, 'siniflar') else 0
    if sinif_count > 0:
        return JsonResponse({
            'error': f'Bu odaya bağlı {sinif_count} sınıf var. Önce sınıfları başka odaya taşıyın.'
        }, status=400)
    
    oda_ad = oda.ad
    oda.delete()
    
    return JsonResponse({
        'success': True,
        'message': f'"{oda_ad}" odası başarıyla silindi'
    })


@require_api_login
@require_http_methods(["GET"])
def oda_turleri_api(request):
    """
    Oda türleri listesi
    GET /odalar/api/turler/
    """
    turler = [{'value': choice[0], 'label': choice[1]} for choice in OdaTuru.choices]
    return JsonResponse({'turler': turler})
