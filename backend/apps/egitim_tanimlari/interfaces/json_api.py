"""JSON API — şube kapsamlı eğitim tanımları."""
import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from apps.egitim_tanimlari.application.service import (
    SinifSeviyesiService,
    AlanService,
    DersService,
    BransService,
)
from apps.egitim_tanimlari.interfaces.sube_context import (
    assert_tanim_record_access,
    mandatory_tanim_context,
)


def _tenant_fields(ctx):
    return {'kurum_id': ctx['kurum_id'], 'sube_id': ctx['sube_id']}


def _gate_record(request, ctx, record):
    if not record:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    denied = assert_tanim_record_access(request, ctx['kurum_id'], record.sube_id)
    if denied:
        return denied
    return None


@csrf_exempt
def legacy_tanimlar_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err

    sinif_seviyesi_service = SinifSeviyesiService()
    alan_service = AlanService()
    ders_service = DersService()
    brans_service = BransService()
    sube_id = ctx['sube_id']

    sinif_seviyeleri = sinif_seviyesi_service.get_all_sinif_seviyeleri(sube_id)
    alanlar = alan_service.get_all_alanlar(sube_id)
    dersler = ders_service.get_all_dersler(sube_id)
    branslar = brans_service.get_all_branslar(sube_id)
    active_tab = request.GET.get('tab', 'sinif_seviyeleri')

    response = JsonResponse({
        'success': True,
        'data': {
            'active_tab': active_tab,
            'sinif_seviyeleri': [
                {
                    'id': seviye.id,
                    'ad': seviye.ad,
                    'kod': seviye.kod,
                    'sira': seviye.sira,
                    'aciklama': seviye.aciklama or '',
                    'aktif_mi': seviye.aktif_mi,
                }
                for seviye in sinif_seviyeleri
            ],
            'alanlar': [
                {'id': a.id, 'ad': a.ad, 'kod': a.kod, 'aciklama': a.aciklama or '', 'aktif_mi': a.aktif_mi}
                for a in alanlar
            ],
            'dersler': [
                {'id': d.id, 'ad': d.ad, 'kod': d.kod, 'aciklama': d.aciklama or '', 'aktif_mi': d.aktif_mi}
                for d in dersler
            ],
            'branslar': [
                {'id': b.id, 'ad': b.ad, 'kod': b.kod, 'aciklama': b.aciklama or '', 'aktif_mi': b.aktif_mi}
                for b in branslar
            ],
        },
    })
    response['Cache-Control'] = 'no-store'
    response['Vary'] = 'X-Sube-ID'
    return response


@csrf_exempt
def sinif_seviyeleri_list_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    seviyeler = SinifSeviyesiService().get_all_sinif_seviyeleri(ctx['sube_id'])
    return JsonResponse({
        'sinif_seviyeleri': [
            {'id': s.id, 'ad': s.ad, 'kod': s.kod, 'sira': s.sira, 'aktif_mi': s.aktif_mi}
            for s in seviyeler if s.aktif_mi
        ],
    })


@csrf_exempt
def dersler_list_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    dersler = DersService().get_all_dersler(ctx['sube_id'])
    return JsonResponse({
        'success': True,
        'data': [{'id': d.id, 'ad': d.ad, 'kod': d.kod} for d in dersler if d.aktif_mi],
    })


@csrf_exempt
def sinif_seviyesi_list_create_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = SinifSeviyesiService()

    if request.method == 'GET':
        items = service.get_all_sinif_seviyeleri(ctx['sube_id'])
        return JsonResponse({
            'success': True,
            'data': [
                {'id': s.id, 'ad': s.ad, 'kod': s.kod, 'sira': s.sira, 'aktif_mi': s.aktif_mi}
                for s in items
            ],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            seviye = service.create_sinif_seviyesi({
                **_tenant_fields(ctx),
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
                'sira': data.get('sira', 0),
            })
            return JsonResponse({'success': True, 'data': {'id': seviye.id, 'ad': seviye.ad, 'kod': seviye.kod}})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def sinif_seviyesi_detail_api(request, seviye_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = SinifSeviyesiService()
    sube_id = ctx['sube_id']

    if request.method == 'GET':
        seviye = service.get_sinif_seviyesi_by_id(seviye_id, sube_id)
        denied = _gate_record(request, ctx, seviye)
        if denied:
            return denied
        return JsonResponse({
            'success': True,
            'data': {
                'id': seviye.id, 'ad': seviye.ad, 'kod': seviye.kod,
                'sira': seviye.sira, 'aktif_mi': seviye.aktif_mi,
            },
        })

    if request.method == 'PUT':
        try:
            seviye = service.get_sinif_seviyesi_by_id(seviye_id, sube_id)
            denied = _gate_record(request, ctx, seviye)
            if denied:
                return denied
            data = json.loads(request.body)
            updated = service.update_sinif_seviyesi(seviye_id, {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
                'sira': data.get('sira', 0),
            }, sube_id)
            if updated:
                return JsonResponse({'success': True, 'data': {'id': updated.id, 'ad': updated.ad}})
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        if service.delete_sinif_seviyesi(seviye_id, sube_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def sinif_seviyesi_delete_info_api(request, seviye_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    seviye = SinifSeviyesiService().get_sinif_seviyesi_by_id(seviye_id, ctx['sube_id'])
    denied = _gate_record(request, ctx, seviye)
    if denied:
        return denied
    return JsonResponse({
        'success': True,
        'data': {'id': seviye.id, 'ad': seviye.ad, 'kullanim_sayisi': seviye.dersler.count()},
    })


@csrf_exempt
def alan_list_create_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = AlanService()

    if request.method == 'GET':
        items = service.get_all_alanlar(ctx['sube_id'])
        return JsonResponse({
            'success': True,
            'data': [{'id': a.id, 'ad': a.ad, 'kod': a.kod, 'aktif_mi': a.aktif_mi} for a in items],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            alan = service.create_alan({**_tenant_fields(ctx), **{
                'ad': data.get('ad'), 'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True), 'aciklama': data.get('aciklama', ''),
            }})
            return JsonResponse({'success': True, 'data': {'id': alan.id, 'ad': alan.ad, 'kod': alan.kod}})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def alan_detail_api(request, alan_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = AlanService()
    sube_id = ctx['sube_id']

    if request.method == 'GET':
        alan = service.get_alan_by_id(alan_id, sube_id)
        denied = _gate_record(request, ctx, alan)
        if denied:
            return denied
        return JsonResponse({'success': True, 'data': {'id': alan.id, 'ad': alan.ad, 'kod': alan.kod, 'aktif_mi': alan.aktif_mi}})

    if request.method == 'PUT':
        try:
            alan = service.get_alan_by_id(alan_id, sube_id)
            denied = _gate_record(request, ctx, alan)
            if denied:
                return denied
            data = json.loads(request.body)
            updated = service.update_alan(alan_id, {
                'ad': data.get('ad'), 'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True), 'aciklama': data.get('aciklama', ''),
            }, sube_id)
            if updated:
                return JsonResponse({'success': True, 'data': {'id': updated.id, 'ad': updated.ad}})
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        if service.delete_alan(alan_id, sube_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def alan_delete_info_api(request, alan_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    alan = AlanService().get_alan_by_id(alan_id, ctx['sube_id'])
    denied = _gate_record(request, ctx, alan)
    if denied:
        return denied
    kullanim = alan.dersler.count() + alan.sinif_seviyeleri.count()
    return JsonResponse({'success': True, 'data': {'id': alan.id, 'ad': alan.ad, 'kullanim_sayisi': kullanim}})


@csrf_exempt
def ders_list_create_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = DersService()

    if request.method == 'GET':
        items = service.get_all_dersler(ctx['sube_id'])
        return JsonResponse({
            'success': True,
            'data': [{'id': d.id, 'ad': d.ad, 'kod': d.kod, 'aktif_mi': d.aktif_mi} for d in items],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            ders = service.create_ders({**_tenant_fields(ctx), **{
                'ad': data.get('ad'), 'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True), 'aciklama': data.get('aciklama', ''),
            }})
            return JsonResponse({'success': True, 'data': {'id': ders.id, 'ad': ders.ad, 'kod': ders.kod}})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def ders_detail_api(request, ders_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = DersService()
    sube_id = ctx['sube_id']

    if request.method == 'GET':
        ders = service.get_ders_by_id(ders_id, sube_id)
        denied = _gate_record(request, ctx, ders)
        if denied:
            return denied
        return JsonResponse({'success': True, 'data': {'id': ders.id, 'ad': ders.ad, 'kod': ders.kod, 'aktif_mi': ders.aktif_mi}})

    if request.method == 'PUT':
        try:
            ders = service.get_ders_by_id(ders_id, sube_id)
            denied = _gate_record(request, ctx, ders)
            if denied:
                return denied
            data = json.loads(request.body)
            updated = service.update_ders(ders_id, {
                'ad': data.get('ad'), 'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True), 'aciklama': data.get('aciklama', ''),
            }, sube_id)
            if updated:
                return JsonResponse({'success': True, 'data': {'id': updated.id, 'ad': updated.ad}})
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        if service.delete_ders(ders_id, sube_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def ders_delete_info_api(request, ders_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    ders = DersService().get_ders_by_id(ders_id, ctx['sube_id'])
    denied = _gate_record(request, ctx, ders)
    if denied:
        return denied
    return JsonResponse({'success': True, 'data': {'id': ders.id, 'ad': ders.ad, 'kullanim_sayisi': 0}})


@csrf_exempt
def brans_list_create_api(request):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = BransService()

    if request.method == 'GET':
        items = service.get_all_branslar(ctx['sube_id'])
        return JsonResponse({
            'success': True,
            'data': [{'id': b.id, 'ad': b.ad, 'kod': b.kod, 'aktif_mi': b.aktif_mi} for b in items],
        })

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            brans = service.create_brans({**_tenant_fields(ctx), **{
                'ad': data.get('ad'), 'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True), 'aciklama': data.get('aciklama', ''),
            }})
            return JsonResponse({'success': True, 'data': {'id': brans.id, 'ad': brans.ad, 'kod': brans.kod}})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def brans_detail_api(request, brans_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    service = BransService()
    sube_id = ctx['sube_id']

    if request.method == 'GET':
        brans = service.get_brans_by_id(brans_id, sube_id)
        denied = _gate_record(request, ctx, brans)
        if denied:
            return denied
        return JsonResponse({'success': True, 'data': {'id': brans.id, 'ad': brans.ad, 'kod': brans.kod, 'aktif_mi': brans.aktif_mi}})

    if request.method == 'PUT':
        try:
            brans = service.get_brans_by_id(brans_id, sube_id)
            denied = _gate_record(request, ctx, brans)
            if denied:
                return denied
            data = json.loads(request.body)
            updated = service.update_brans(brans_id, {
                'ad': data.get('ad'), 'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True), 'aciklama': data.get('aciklama', ''),
            }, sube_id)
            if updated:
                return JsonResponse({'success': True, 'data': {'id': updated.id, 'ad': updated.ad}})
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)

    if request.method == 'DELETE':
        if service.delete_brans(brans_id, sube_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)

    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def brans_delete_info_api(request, brans_id):
    ctx, err = mandatory_tanim_context(request)
    if err:
        return err
    brans = BransService().get_brans_by_id(brans_id, ctx['sube_id'])
    denied = _gate_record(request, ctx, brans)
    if denied:
        return denied
    return JsonResponse({'success': True, 'data': {'id': brans.id, 'ad': brans.ad, 'kullanim_sayisi': 0}})
