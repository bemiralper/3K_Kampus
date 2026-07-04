"""
Egitim Tanimlari Views
Presentation layer - TAB-based logic
"""
from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.urls import reverse
from apps.egitim_tanimlari.application.service import (
    SinifSeviyesiService, AlanService, DersService, BransService
)


@login_required
def tanimlar(request):
    """
    Eğitim Tanımlamaları - TAB-based view
    Handles: sinif_seviyeleri | alanlar | dersler
    """
    # Get active tab from query param
    active_tab = request.GET.get('tab', 'sinif_seviyeleri')
    
    # Initialize services
    sinif_seviyesi_service = SinifSeviyesiService()
    alan_service = AlanService()
    ders_service = DersService()
    brans_service = BransService()
    
    # Get all data
    sinif_seviyeleri = sinif_seviyesi_service.get_all_sinif_seviyeleri()
    alanlar = alan_service.get_all_alanlar()
    dersler = ders_service.get_all_dersler()
    branslar = brans_service.get_all_branslar()
    
    context = {
        'active_tab': active_tab,
        'sinif_seviyeleri': sinif_seviyeleri,
        'alanlar': alanlar,
        'dersler': dersler,
        'branslar': branslar,
    }
    
    return render(request, 'egitim_tanimlari/tanimlar.html', context)


def legacy_tanimlar_api(request):
    """Legacy eğitim tanımları sayfası için API"""
    active_tab = request.GET.get('tab', 'sinif_seviyeleri')

    sinif_seviyesi_service = SinifSeviyesiService()
    alan_service = AlanService()
    ders_service = DersService()
    brans_service = BransService()

    sinif_seviyeleri = sinif_seviyesi_service.get_all_sinif_seviyeleri()
    alanlar = alan_service.get_all_alanlar()
    dersler = ders_service.get_all_dersler()
    branslar = brans_service.get_all_branslar()

    return JsonResponse({
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
                    'created_at': seviye.created_at.isoformat() if seviye.created_at else '',
                }
                for seviye in sinif_seviyeleri
            ],
            'alanlar': [
                {
                    'id': alan.id,
                    'ad': alan.ad,
                    'kod': alan.kod,
                    'aciklama': alan.aciklama or '',
                    'aktif_mi': alan.aktif_mi,
                    'created_at': alan.created_at.isoformat() if alan.created_at else '',
                }
                for alan in alanlar
            ],
            'dersler': [
                {
                    'id': ders.id,
                    'ad': ders.ad,
                    'kod': ders.kod,
                    'aciklama': ders.aciklama or '',
                    'aktif_mi': ders.aktif_mi,
                    'created_at': ders.created_at.isoformat() if ders.created_at else '',
                }
                for ders in dersler
            ],
            'branslar': [
                {
                    'id': brans.id,
                    'ad': brans.ad,
                    'kod': brans.kod,
                    'aciklama': brans.aciklama or '',
                    'aktif_mi': brans.aktif_mi,
                    'created_at': brans.created_at.isoformat() if brans.created_at else '',
                }
                for brans in branslar
            ],
        }
    })


@csrf_exempt
def sinif_seviyeleri_list_api(request):
    """
    Sınıf seviyeleri listesi API
    GET /egitim-tanimlari/api/sinif-seviyeleri/
    """
    sinif_seviyesi_service = SinifSeviyesiService()
    sinif_seviyeleri = sinif_seviyesi_service.get_all_sinif_seviyeleri()
    
    return JsonResponse({
        'sinif_seviyeleri': [
            {
                'id': seviye.id,
                'ad': seviye.ad,
                'kod': seviye.kod,
                'sira': seviye.sira,
                'aktif_mi': seviye.aktif_mi,
            }
            for seviye in sinif_seviyeleri if seviye.aktif_mi
        ]
    })


@csrf_exempt
def dersler_list_api(request):
    """
    Dersler listesi API
    GET /egitim-tanimlari/api/dersler/
    """
    ders_service = DersService()
    dersler = ders_service.get_all_dersler()
    
    return JsonResponse({
        'success': True,
        'data': [
            {
                'id': ders.id,
                'ad': ders.ad,
                'kod': ders.kod,
            }
            for ders in dersler if ders.aktif_mi
        ]
    })


# Sinif Seviyesi CRUD
@login_required
def sinif_seviyesi_create(request):
    """Create new grade level"""
    if request.method == 'POST':
        service = SinifSeviyesiService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        alanlar = request.POST.getlist('alanlar')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'sira': int(request.POST.get('sira', 0)),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
            'alanlar': alanlar,
        }
        
        try:
            seviye = service.create_sinif_seviyesi(data)
            messages.success(request, f'{seviye.ad} başarıyla eklendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=sinif_seviyeleri')


@login_required
def sinif_seviyesi_edit(request, seviye_id):
    """Edit grade level"""
    if request.method == 'POST':
        service = SinifSeviyesiService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        alanlar = request.POST.getlist('alanlar')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'sira': int(request.POST.get('sira', 0)),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
            'alanlar': alanlar,
        }
        
        try:
            seviye = service.update_sinif_seviyesi(seviye_id, data)
            if seviye:
                messages.success(request, f'{seviye.ad} başarıyla güncellendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=sinif_seviyeleri')


@login_required
def sinif_seviyesi_delete(request, seviye_id):
    """Delete grade level"""
    if request.method == 'POST':
        service = SinifSeviyesiService()
        if service.delete_sinif_seviyesi(seviye_id):
            messages.success(request, 'Sınıf seviyesi başarıyla silindi.')
        else:
            messages.error(request, 'Sınıf seviyesi silinemedi.')
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=sinif_seviyeleri')


# Alan CRUD
@login_required
def alan_create(request):
    """Create new field"""
    if request.method == 'POST':
        service = AlanService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            alan = service.create_alan(data)
            messages.success(request, f'{alan.ad} başarıyla eklendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=alanlar')


@login_required
def alan_edit(request, alan_id):
    """Edit field"""
    if request.method == 'POST':
        service = AlanService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            alan = service.update_alan(alan_id, data)
            if alan:
                messages.success(request, f'{alan.ad} başarıyla güncellendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=alanlar')


@login_required
def alan_delete(request, alan_id):
    """Delete field"""
    if request.method == 'POST':
        service = AlanService()
        if service.delete_alan(alan_id):
            messages.success(request, 'Alan başarıyla silindi.')
        else:
            messages.error(request, 'Alan silinemedi.')
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=alanlar')


# Ders CRUD
@login_required
def ders_create(request):
    """Create new course"""
    if request.method == 'POST':
        service = DersService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        sinif_seviyeleri = request.POST.getlist('sinif_seviyeleri')
        alanlar = request.POST.getlist('alanlar')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
            'sinif_seviyeleri': sinif_seviyeleri,
            'alanlar': alanlar,
        }
        
        try:
            ders = service.create_ders(data)
            messages.success(request, f'{ders.ad} başarıyla eklendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=dersler')


@login_required
def ders_edit(request, ders_id):
    """Edit course"""
    if request.method == 'POST':
        service = DersService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        sinif_seviyeleri = request.POST.getlist('sinif_seviyeleri')
        alanlar = request.POST.getlist('alanlar')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
            'sinif_seviyeleri': sinif_seviyeleri,
            'alanlar': alanlar,
        }
        
        try:
            ders = service.update_ders(ders_id, data)
            if ders:
                messages.success(request, f'{ders.ad} başarıyla güncellendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=dersler')


@login_required
def ders_delete(request, ders_id):
    """Delete course"""
    if request.method == 'POST':
        service = DersService()
        if service.delete_ders(ders_id):
            messages.success(request, 'Ders başarıyla silindi.')
        else:
            messages.error(request, 'Ders silinemedi.')
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=dersler')


# API Endpoints for AJAX (for edit drawer population)
@login_required
def sinif_seviyesi_api(request, seviye_id):
    """Get sinif seviyesi data as JSON"""
    service = SinifSeviyesiService()
    seviye = service.get_sinif_seviyesi_by_id(seviye_id)
    if seviye:
        return JsonResponse({
            'id': seviye.id,
            'ad': seviye.ad,
            'kod': seviye.kod,
            'sira': seviye.sira,
            'aciklama': seviye.aciklama,
            'aktif_mi': seviye.aktif_mi,
            'alanlar_ids': list(seviye.alanlar.values_list('id', flat=True)),
        })
    return JsonResponse({'error': 'Not found'}, status=404)


@login_required
def alan_api(request, alan_id):
    """Get alan data as JSON"""
    service = AlanService()
    alan = service.get_alan_by_id(alan_id)
    if alan:
        return JsonResponse({
            'id': alan.id,
            'ad': alan.ad,
            'kod': alan.kod,
            'aciklama': alan.aciklama,
            'aktif_mi': alan.aktif_mi,
        })
    return JsonResponse({'error': 'Not found'}, status=404)


@login_required
def ders_api(request, ders_id):
    """Get ders data as JSON"""
    service = DersService()
    ders = service.get_ders_by_id(ders_id)
    if ders:
        return JsonResponse({
            'id': ders.id,
            'ad': ders.ad,
            'kod': ders.kod,
            'aciklama': ders.aciklama,
            'aktif_mi': ders.aktif_mi,
            'sinif_seviyeleri_ids': list(ders.sinif_seviyeleri.values_list('id', flat=True)),
            'alanlar_ids': list(ders.alanlar.values_list('id', flat=True)),
        })
    return JsonResponse({'error': 'Not found'}, status=404)


# Brans CRUD
@login_required
def brans_create(request):
    """Create new branch"""
    if request.method == 'POST':
        service = BransService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            brans = service.create_brans(data)
            messages.success(request, f'{brans.ad} başarıyla eklendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=branslar')


@login_required
def brans_edit(request, brans_id):
    """Edit branch"""
    if request.method == 'POST':
        service = BransService()
        
        aktif_mi = request.POST.get('aktif_mi') == 'on'
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': aktif_mi,
        }
        
        try:
            brans = service.update_brans(brans_id, data)
            if brans:
                messages.success(request, f'{brans.ad} başarıyla güncellendi.')
        except Exception as e:
            messages.error(request, str(e))
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=branslar')


@login_required
def brans_delete(request, brans_id):
    """Delete branch"""
    if request.method == 'POST':
        service = BransService()
        if service.delete_brans(brans_id):
            messages.success(request, 'Branş başarıyla silindi.')
        else:
            messages.error(request, 'Branş silinemedi.')
    
    return redirect(reverse('egitim_tanimlari:tanimlar') + '?tab=branslar')


@login_required
def brans_api(request, brans_id):
    """Get brans data as JSON"""
    service = BransService()
    brans = service.get_brans_by_id(brans_id)
    if brans:
        return JsonResponse({
            'id': brans.id,
            'ad': brans.ad,
            'kod': brans.kod,
            'aciklama': brans.aciklama,
            'aktif_mi': brans.aktif_mi,
        })
    return JsonResponse({'error': 'Not found'}, status=404)


# ============================================
# JSON API Endpoints (for React Frontend)
# ============================================

import json
from django.views.decorators.csrf import csrf_exempt


# Sinif Seviyesi JSON API
@csrf_exempt
def sinif_seviyesi_list_create_api(request):
    """List all or create new sinif seviyesi"""
    service = SinifSeviyesiService()
    
    if request.method == 'GET':
        seviyeleri = service.get_all_sinif_seviyeleri()
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': s.id,
                    'ad': s.ad,
                    'kod': s.kod,
                    'sira': s.sira,
                    'aktif_mi': s.aktif_mi,
                }
                for s in seviyeleri
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            seviye = service.create_sinif_seviyesi({
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
                'sira': data.get('sira', 0),
            })
            return JsonResponse({
                'success': True,
                'data': {'id': seviye.id, 'ad': seviye.ad, 'kod': seviye.kod}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def sinif_seviyesi_detail_api(request, seviye_id):
    """Get, update or delete sinif seviyesi"""
    service = SinifSeviyesiService()
    
    if request.method == 'GET':
        seviye = service.get_sinif_seviyesi_by_id(seviye_id)
        if seviye:
            return JsonResponse({
                'success': True,
                'data': {
                    'id': seviye.id,
                    'ad': seviye.ad,
                    'kod': seviye.kod,
                    'sira': seviye.sira,
                    'aktif_mi': seviye.aktif_mi,
                }
            })
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            seviye = service.update_sinif_seviyesi(seviye_id, {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
                'sira': data.get('sira', 0),
            })
            if seviye:
                return JsonResponse({
                    'success': True,
                    'data': {'id': seviye.id, 'ad': seviye.ad}
                })
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        if service.delete_sinif_seviyesi(seviye_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def sinif_seviyesi_delete_info_api(request, seviye_id):
    """Get delete info for sinif seviyesi (usage count)"""
    service = SinifSeviyesiService()
    seviye = service.get_sinif_seviyesi_by_id(seviye_id)
    
    if not seviye:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    # Kullanım sayısını hesapla (derslerle ilişkileri)
    kullanim_sayisi = seviye.dersler.count() if hasattr(seviye, 'dersler') else 0
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': seviye.id,
            'ad': seviye.ad,
            'kullanim_sayisi': kullanim_sayisi,
        }
    })


# Alan JSON API
@csrf_exempt
def alan_list_create_api(request):
    """List all or create new alan"""
    service = AlanService()
    
    if request.method == 'GET':
        alanlar = service.get_all_alanlar()
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': a.id,
                    'ad': a.ad,
                    'kod': a.kod,
                    'aktif_mi': a.aktif_mi,
                }
                for a in alanlar
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            alan = service.create_alan({
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
            })
            return JsonResponse({
                'success': True,
                'data': {'id': alan.id, 'ad': alan.ad, 'kod': alan.kod}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def alan_detail_api(request, alan_id):
    """Get, update or delete alan"""
    service = AlanService()
    
    if request.method == 'GET':
        alan = service.get_alan_by_id(alan_id)
        if alan:
            return JsonResponse({
                'success': True,
                'data': {
                    'id': alan.id,
                    'ad': alan.ad,
                    'kod': alan.kod,
                    'aktif_mi': alan.aktif_mi,
                }
            })
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            alan = service.update_alan(alan_id, {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
            })
            if alan:
                return JsonResponse({
                    'success': True,
                    'data': {'id': alan.id, 'ad': alan.ad}
                })
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        if service.delete_alan(alan_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def alan_delete_info_api(request, alan_id):
    """Get delete info for alan (usage count)"""
    service = AlanService()
    alan = service.get_alan_by_id(alan_id)
    
    if not alan:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    # Kullanım sayısını hesapla (dersler ve sinif seviyeleri ile ilişkiler)
    kullanim_sayisi = 0
    if hasattr(alan, 'dersler'):
        kullanim_sayisi += alan.dersler.count()
    if hasattr(alan, 'sinif_seviyeleri'):
        kullanim_sayisi += alan.sinif_seviyeleri.count()
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': alan.id,
            'ad': alan.ad,
            'kullanim_sayisi': kullanim_sayisi,
        }
    })


# Ders JSON API
@csrf_exempt
def ders_list_create_api(request):
    """List all or create new ders"""
    service = DersService()
    
    if request.method == 'GET':
        dersler = service.get_all_dersler()
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': d.id,
                    'ad': d.ad,
                    'kod': d.kod,
                    'aktif_mi': d.aktif_mi,
                }
                for d in dersler
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            ders = service.create_ders({
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
            })
            return JsonResponse({
                'success': True,
                'data': {'id': ders.id, 'ad': ders.ad, 'kod': ders.kod}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def ders_detail_api(request, ders_id):
    """Get, update or delete ders"""
    service = DersService()
    
    if request.method == 'GET':
        ders = service.get_ders_by_id(ders_id)
        if ders:
            return JsonResponse({
                'success': True,
                'data': {
                    'id': ders.id,
                    'ad': ders.ad,
                    'kod': ders.kod,
                    'aktif_mi': ders.aktif_mi,
                }
            })
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            ders = service.update_ders(ders_id, {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
            })
            if ders:
                return JsonResponse({
                    'success': True,
                    'data': {'id': ders.id, 'ad': ders.ad}
                })
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        if service.delete_ders(ders_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def ders_delete_info_api(request, ders_id):
    """Get delete info for ders (usage count)"""
    service = DersService()
    ders = service.get_ders_by_id(ders_id)
    
    if not ders:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    # Kullanım sayısını hesapla (eğitim paketleri gibi ilişkiler)
    kullanim_sayisi = 0
    # Burada ders ile ilişkili diğer modellerin sayısı eklenebilir
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': ders.id,
            'ad': ders.ad,
            'kullanim_sayisi': kullanim_sayisi,
        }
    })


# Branş JSON API
@csrf_exempt
def brans_list_create_api(request):
    """List all or create new brans"""
    service = BransService()
    
    if request.method == 'GET':
        branslar = service.get_all_branslar()
        return JsonResponse({
            'success': True,
            'data': [
                {
                    'id': b.id,
                    'ad': b.ad,
                    'kod': b.kod,
                    'aktif_mi': b.aktif_mi,
                }
                for b in branslar
            ]
        })
    
    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            brans = service.create_brans({
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
            })
            return JsonResponse({
                'success': True,
                'data': {'id': brans.id, 'ad': brans.ad, 'kod': brans.kod}
            })
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


@csrf_exempt
def brans_detail_api(request, brans_id):
    """Get, update or delete brans"""
    service = BransService()
    
    if request.method == 'GET':
        brans = service.get_brans_by_id(brans_id)
        if brans:
            return JsonResponse({
                'success': True,
                'data': {
                    'id': brans.id,
                    'ad': brans.ad,
                    'kod': brans.kod,
                    'aktif_mi': brans.aktif_mi,
                }
            })
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    elif request.method == 'PUT':
        try:
            data = json.loads(request.body)
            brans = service.update_brans(brans_id, {
                'ad': data.get('ad'),
                'kod': data.get('kod'),
                'aktif_mi': data.get('aktif_mi', True),
                'aciklama': data.get('aciklama', ''),
            })
            if brans:
                return JsonResponse({
                    'success': True,
                    'data': {'id': brans.id, 'ad': brans.ad}
                })
            return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)
    
    elif request.method == 'DELETE':
        if service.delete_brans(brans_id):
            return JsonResponse({'success': True})
        return JsonResponse({'success': False, 'error': 'Silinemedi'}, status=400)
    
    return JsonResponse({'success': False, 'error': 'Method not allowed'}, status=405)


def brans_delete_info_api(request, brans_id):
    """Get delete info for brans (usage count)"""
    service = BransService()
    brans = service.get_brans_by_id(brans_id)
    
    if not brans:
        return JsonResponse({'success': False, 'error': 'Bulunamadı'}, status=404)
    
    # Kullanım sayısını hesapla (personel ile ilişkiler)
    kullanim_sayisi = 0
    # Burada brans ile ilişkili personel sayısı eklenebilir
    
    return JsonResponse({
        'success': True,
        'data': {
            'id': brans.id,
            'ad': brans.ad,
            'kullanim_sayisi': kullanim_sayisi,
        }
    })

