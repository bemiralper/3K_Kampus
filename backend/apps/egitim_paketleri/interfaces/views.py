"""
Egitim Paketleri Views
"""
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib import messages
from django.http import JsonResponse, HttpResponseRedirect
from django.urls import reverse


from apps.egitim_paketleri.application.services import (
    GrupDersiService, OzelDersService, DenemeService
)
from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders
from apps.egitim_yili.domain.models import EgitimYili
from shared.context import get_secili_egitim_yili_id


def redirect_with_tab(tab_name):
    """Tab parametresiyle redirect helper"""
    return HttpResponseRedirect(reverse('egitim_paketleri:paketler') + f'?tab={tab_name}')


@login_required
def paketler(request):
    """Ana Eğitim Paketleri sayfası"""
    grup_dersi_service = GrupDersiService()
    ozel_ders_service = OzelDersService()
    deneme_service = DenemeService()
    
    # Seçili eğitim yılını al
    egitim_yili_id = get_secili_egitim_yili_id(request)
    
    context = {
        'grup_dersleri': grup_dersi_service.get_all(egitim_yili_id),
        'ozel_dersler': ozel_ders_service.get_all(egitim_yili_id),
        'denemeler': deneme_service.get_all(egitim_yili_id),
        'sinif_seviyeleri': SinifSeviyesi.objects.filter(aktif_mi=True).order_by('sira', 'ad'),
        'alanlar': Alan.objects.filter(aktif_mi=True).order_by('sira', 'ad'),
        'dersler': Ders.objects.filter(aktif_mi=True).order_by('ad'),
        'egitim_yillari': EgitimYili.objects.filter(aktif_mi=True).order_by('-baslangic_yil'),
    }
    return render(request, 'egitim_paketleri/paketler.html', context)


@login_required
def legacy_paketler_api(request):
    grup_dersi_service = GrupDersiService()
    ozel_ders_service = OzelDersService()
    deneme_service = DenemeService()
    
    # Seçili eğitim yılını al
    egitim_yili_id = get_secili_egitim_yili_id(request)

    grup_dersleri = grup_dersi_service.get_all(egitim_yili_id)
    ozel_dersler = ozel_ders_service.get_all(egitim_yili_id)
    denemeler = deneme_service.get_all(egitim_yili_id)

    sinif_seviyeleri = SinifSeviyesi.objects.filter(aktif_mi=True).order_by('sira', 'ad')
    alanlar = Alan.objects.filter(aktif_mi=True).order_by('sira', 'ad')
    dersler = Ders.objects.filter(aktif_mi=True).order_by('ad')

    def ders_list(ders_qs):
        return [{'id': d.id, 'ad': d.ad} for d in ders_qs]

    def seviye_list(seviye_qs):
        return [{'id': s.id, 'ad': s.ad} for s in seviye_qs]

    return JsonResponse({
        'grup_dersleri': [
            {
                'id': paket.id,
                'ad': paket.ad,
                'kod': paket.kod,
                'fiyat': float(paket.fiyat) if paket.fiyat is not None else 0,
                'aktif_mi': paket.aktif_mi,
                'sinif_seviyesi': {
                    'id': paket.sinif_seviyesi_id,
                    'ad': paket.sinif_seviyesi.ad,
                },
                'alan': (
                    {
                        'id': paket.alan_id,
                        'ad': paket.alan.ad,
                    }
                    if paket.alan_id
                    else None
                ),
                'dersler': {
                    'all': ders_list(paket.dersler.all()),
                    'count': paket.dersler.count(),
                },
            }
            for paket in grup_dersleri
        ],
        'ozel_dersler': [
            {
                'id': paket.id,
                'ad': paket.ad,
                'kod': paket.kod,
                'fiyat': float(paket.fiyat) if paket.fiyat is not None else 0,
                'aktif_mi': paket.aktif_mi,
                'alan': (
                    {
                        'id': paket.alan_id,
                        'ad': paket.alan.ad,
                    }
                    if paket.alan_id
                    else None
                ),
                'sinif_seviyeleri': {
                    'all': seviye_list(paket.sinif_seviyeleri.all()),
                    'count': paket.sinif_seviyeleri.count(),
                },
                'dersler': {
                    'all': ders_list(paket.dersler.all()),
                    'count': paket.dersler.count(),
                },
            }
            for paket in ozel_dersler
        ],
        'denemeler': [
            {
                'id': deneme.id,
                'ad': deneme.ad,
                'kod': deneme.kod,
                'deneme_sayisi': deneme.deneme_sayisi,
                'fiyat': float(deneme.fiyat) if deneme.fiyat is not None else 0,
                'aktif_mi': deneme.aktif_mi,
                'sinif_seviyeleri': {
                    'all': seviye_list(deneme.sinif_seviyeleri.all()),
                    'count': deneme.sinif_seviyeleri.count(),
                },
            }
            for deneme in denemeler
        ],
        'sinif_seviyeleri': [
            {'id': seviye.id, 'ad': seviye.ad}
            for seviye in sinif_seviyeleri
        ],
        'alanlar': [
            {'id': alan.id, 'ad': alan.ad}
            for alan in alanlar
        ],
        'dersler': [
            {'id': ders.id, 'ad': ders.ad}
            for ders in dersler
        ],
    })


# ==================== GRUP DERSİ ====================
@login_required
def grup_dersi_create(request):
    if request.method == 'POST':
        service = GrupDersiService()
        
        dersler_ids = request.POST.getlist('dersler')
        egitim_yili_id = get_secili_egitim_yili_id(request)
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'egitim_yili_id': egitim_yili_id,
            'sinif_seviyesi_id': int(request.POST.get('sinif_seviyesi')) if request.POST.get('sinif_seviyesi') else None,
            'alan_id': int(request.POST.get('alan')) if request.POST.get('alan') else None,
            'dersler_ids': [int(d) for d in dersler_ids] if dersler_ids else [],
            'brut_fiyat': int(request.POST.get('fiyat', '0') or '0'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        grup_dersi, errors = service.create(data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Grup dersi başarıyla eklendi.')
        
        return redirect('egitim_paketleri:paketler')
    
    return redirect('egitim_paketleri:paketler')


@login_required
def grup_dersi_edit(request, pk):
    if request.method == 'POST':
        service = GrupDersiService()
        
        dersler_ids = request.POST.getlist('dersler')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'sinif_seviyesi_id': int(request.POST.get('sinif_seviyesi')) if request.POST.get('sinif_seviyesi') else None,
            'alan_id': int(request.POST.get('alan')) if request.POST.get('alan') else None,
            'dersler_ids': [int(d) for d in dersler_ids] if dersler_ids else [],
            'brut_fiyat': int(request.POST.get('fiyat', '0') or '0'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        grup_dersi, errors = service.update(pk, data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Grup dersi başarıyla güncellendi.')
        
        return redirect('egitim_paketleri:paketler')
    
    return redirect('egitim_paketleri:paketler')


@login_required
def grup_dersi_delete(request, pk):
    if request.method == 'POST':
        service = GrupDersiService()
        success, errors = service.delete(pk)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Grup dersi başarıyla silindi.')
    
    return redirect('egitim_paketleri:paketler')


@login_required
def grup_dersi_api(request, pk):
    service = GrupDersiService()
    grup_dersi = service.get_by_id(pk)
    
    if grup_dersi:
        return JsonResponse({
            'id': grup_dersi.id,
            'ad': grup_dersi.ad,
            'kod': grup_dersi.kod,
            'sinif_seviyesi_id': grup_dersi.sinif_seviyesi_id,
            'alan_id': grup_dersi.alan_id,
            'dersler_ids': list(grup_dersi.dersler.values_list('id', flat=True)),
            'fiyat': str(grup_dersi.fiyat),
            'aciklama': grup_dersi.aciklama,
            'aktif_mi': grup_dersi.aktif_mi,
        })
    return JsonResponse({'error': 'Not found'}, status=404)


# ==================== ÖZEL DERS ====================
@login_required
def ozel_ders_create(request):
    if request.method == 'POST':
        service = OzelDersService()
        
        dersler_ids = request.POST.getlist('dersler')
        sinif_seviyeleri_ids = request.POST.getlist('sinif_seviyeleri')
        egitim_yili_id = get_secili_egitim_yili_id(request)
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'egitim_yili_id': egitim_yili_id,
            'sinif_seviyeleri_ids': [int(s) for s in sinif_seviyeleri_ids] if sinif_seviyeleri_ids else [],
            'alan_id': int(request.POST.get('alan')) if request.POST.get('alan') else None,
            'dersler_ids': [int(d) for d in dersler_ids] if dersler_ids else [],
            'brut_fiyat': int(request.POST.get('fiyat', '0') or '0'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        ozel_ders, errors = service.create(data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Özel ders başarıyla eklendi.')
        
        return redirect_with_tab('ozel_dersler')
    
    return redirect('egitim_paketleri:paketler')


@login_required
def ozel_ders_edit(request, pk):
    if request.method == 'POST':
        service = OzelDersService()
        
        dersler_ids = request.POST.getlist('dersler')
        sinif_seviyeleri_ids = request.POST.getlist('sinif_seviyeleri')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'sinif_seviyeleri_ids': [int(s) for s in sinif_seviyeleri_ids] if sinif_seviyeleri_ids else [],
            'alan_id': int(request.POST.get('alan')) if request.POST.get('alan') else None,
            'dersler_ids': [int(d) for d in dersler_ids] if dersler_ids else [],
            'brut_fiyat': int(request.POST.get('fiyat', '0') or '0'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        ozel_ders, errors = service.update(pk, data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Özel ders başarıyla güncellendi.')
        
        return redirect_with_tab('ozel_dersler')
    
    return redirect('egitim_paketleri:paketler')


@login_required
def ozel_ders_delete(request, pk):
    if request.method == 'POST':
        service = OzelDersService()
        success, errors = service.delete(pk)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Özel ders başarıyla silindi.')
    
    return redirect_with_tab('ozel_dersler')


@login_required
def ozel_ders_api(request, pk):
    service = OzelDersService()
    ozel_ders = service.get_by_id(pk)
    
    if ozel_ders:
        return JsonResponse({
            'id': ozel_ders.id,
            'ad': ozel_ders.ad,
            'kod': ozel_ders.kod,
            'sinif_seviyeleri_ids': list(ozel_ders.sinif_seviyeleri.values_list('id', flat=True)),
            'alan_id': ozel_ders.alan_id,
            'dersler_ids': list(ozel_ders.dersler.values_list('id', flat=True)),
            'fiyat': str(ozel_ders.fiyat),
            'aciklama': ozel_ders.aciklama,
            'aktif_mi': ozel_ders.aktif_mi,
        })
    return JsonResponse({'error': 'Not found'}, status=404)


# ==================== DENEME ====================
@login_required
def deneme_create(request):
    if request.method == 'POST':
        service = DenemeService()
        
        sinif_seviyeleri_ids = request.POST.getlist('sinif_seviyeleri')
        egitim_yili_id = get_secili_egitim_yili_id(request)
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'egitim_yili_id': egitim_yili_id,
            'deneme_sayisi': int(request.POST.get('deneme_sayisi', '1') or '1'),
            'sinif_seviyeleri_ids': [int(s) for s in sinif_seviyeleri_ids] if sinif_seviyeleri_ids else [],
            'brut_fiyat': int(request.POST.get('fiyat', '0') or '0'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        deneme, errors = service.create(data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Deneme başarıyla eklendi.')
        
        return redirect_with_tab('denemeler')
    
    return redirect_with_tab('denemeler')


@login_required
def deneme_edit(request, pk):
    if request.method == 'POST':
        service = DenemeService()
        
        sinif_seviyeleri_ids = request.POST.getlist('sinif_seviyeleri')
        
        data = {
            'ad': request.POST.get('ad'),
            'kod': request.POST.get('kod'),
            'deneme_sayisi': int(request.POST.get('deneme_sayisi', '1') or '1'),
            'sinif_seviyeleri_ids': [int(s) for s in sinif_seviyeleri_ids] if sinif_seviyeleri_ids else [],
            'brut_fiyat': int(request.POST.get('fiyat', '0') or '0'),
            'aciklama': request.POST.get('aciklama', ''),
            'aktif_mi': request.POST.get('aktif_mi') == 'on',
        }
        
        deneme, errors = service.update(pk, data)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Deneme başarıyla güncellendi.')
        
        return redirect_with_tab('denemeler')
    
    return redirect_with_tab('denemeler')


@login_required
def deneme_delete(request, pk):
    if request.method == 'POST':
        service = DenemeService()
        success, errors = service.delete(pk)
        
        if errors:
            messages.error(request, f'Hata: {errors}')
        else:
            messages.success(request, 'Deneme başarıyla silindi.')
    
    return redirect_with_tab('denemeler')


@login_required
def deneme_api(request, pk):
    service = DenemeService()
    deneme = service.get_by_id(pk)
    
    if deneme:
        return JsonResponse({
            'id': deneme.id,
            'ad': deneme.ad,
            'kod': deneme.kod,
            'deneme_sayisi': deneme.deneme_sayisi,
            'sinif_seviyeleri_ids': list(deneme.sinif_seviyeleri.values_list('id', flat=True)),
            'fiyat': str(deneme.fiyat),
            'aciklama': deneme.aciklama,
            'aktif_mi': deneme.aktif_mi,
        })
    return JsonResponse({'error': 'Not found'}, status=404)


# ==================== API: Dersler by Seviye/Alan ====================
@login_required
def dersler_by_seviye_alan(request):
    """Sınıf seviyesi ve alana göre dersleri getir"""
    sinif_seviyesi_id = request.GET.get('sinif_seviyesi')
    alan_id = request.GET.get('alan')
    
    dersler = Ders.objects.filter(aktif_mi=True)
    
    if sinif_seviyesi_id:
        dersler = dersler.filter(sinif_seviyeleri__id=sinif_seviyesi_id)
    
    if alan_id:
        dersler = dersler.filter(alanlar__id=alan_id)
    
    dersler = dersler.distinct().order_by('ad')
    
    return JsonResponse({
        'dersler': [{'id': d.id, 'ad': d.ad} for d in dersler]
    })


@login_required
def alanlar_by_seviyeler(request):
    """Seçilen sınıf seviyelerinin ORTAK alanlarını getir"""
    seviye_ids = request.GET.getlist('seviye_ids[]')
    
    if not seviye_ids:
        # Hiç seviye seçilmemişse boş döndür
        return JsonResponse({'alanlar': []})
    
    # Seviyeleri integer'a çevir
    seviye_ids = [int(s) for s in seviye_ids if s]
    
    if not seviye_ids:
        return JsonResponse({'alanlar': []})
    
    # Her seviyenin alanlarını al
    seviyeler = SinifSeviyesi.objects.filter(id__in=seviye_ids, aktif_mi=True)
    
    if not seviyeler.exists():
        return JsonResponse({'alanlar': []})
    
    # İlk seviyenin alanlarını başlangıç set'i olarak al
    ortak_alanlar = None
    for seviye in seviyeler:
        seviye_alanlari = set(seviye.alanlar.filter(aktif_mi=True).values_list('id', flat=True))
        if ortak_alanlar is None:
            ortak_alanlar = seviye_alanlari
        else:
            # Kesişimi al (ortak olanlar)
            ortak_alanlar = ortak_alanlar.intersection(seviye_alanlari)
    
    # Ortak alanları döndür
    if ortak_alanlar:
        alanlar = Alan.objects.filter(id__in=ortak_alanlar, aktif_mi=True).order_by('sira', 'ad')
        return JsonResponse({
            'alanlar': [{'id': a.id, 'ad': a.ad} for a in alanlar]
        })
    
    return JsonResponse({'alanlar': []})
