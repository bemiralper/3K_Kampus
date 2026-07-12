"""
Main application views
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.egitim_yili.domain.models import EgitimYili
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.personel.domain.models import Personel


def index(request):
    """Ana sayfa - Login olmayanlar için"""
    context = {
        'total_kurumlar': Kurum.objects.count(),
        'total_ogrenciler': Ogrenci.objects.count(),
        'total_siniflar': Sinif.objects.count(),
    }
    return render(request, 'index.html', context)


def legacy_index_api(request):
    """Legacy ana sayfa için özet API"""
    return JsonResponse({
        'total_kurumlar': Kurum.objects.count(),
        'total_ogrenciler': Ogrenci.objects.count(),
        'total_siniflar': Sinif.objects.count(),
    })


@login_required
def dashboard(request):
    """Dashboard - Ana kontrol paneli"""
    
    # İstatistikler
    context = {
        'total_kurumlar': Kurum.objects.count(),
        'total_subeler': Sube.objects.count(),
        'total_egitim_yillari': EgitimYili.objects.count(),
        'total_ogrenciler': Ogrenci.objects.count(),
        'total_siniflar': Sinif.objects.count(),
        'total_personel': Personel.objects.count(),
        
        # Aktif eğitim yılı
        'aktif_egitim_yili': EgitimYili.objects.filter(aktif_mi=True).first(),
        
        # Son eklenen kurumlar
        'recent_kurumlar': Kurum.objects.order_by('-id')[:5],
        
        # Son kayıtlar
        'recent_ogrenci_kayitlar': OgrenciKayit.objects.select_related(
            'ogrenci', 'sinif', 'egitim_yili'
        ).order_by('-id')[:10],
    }
    
    return render(request, 'dashboard.html', context)


@login_required
def legacy_dashboard_api(request):
    """Legacy dashboard için özet API"""
    aktif_egitim_yili = EgitimYili.objects.filter(aktif_mi=True).first()
    recent_kurumlar = Kurum.objects.order_by('-id')[:5]
    recent_ogrenci_kayitlar = OgrenciKayit.objects.select_related(
        'ogrenci', 'sinif', 'egitim_yili'
    ).order_by('-id')[:10]

    return JsonResponse({
        'total_kurumlar': Kurum.objects.count(),
        'total_subeler': Sube.objects.count(),
        'total_egitim_yillari': EgitimYili.objects.count(),
        'total_ogrenciler': Ogrenci.objects.count(),
        'total_siniflar': Sinif.objects.count(),
        'total_personel': Personel.objects.count(),
        'aktif_egitim_yili': (
            {
                'id': aktif_egitim_yili.id,
                'baslangic_yil': aktif_egitim_yili.baslangic_yil,
                'bitis_yil': aktif_egitim_yili.bitis_yil,
            }
            if aktif_egitim_yili
            else None
        ),
        'recent_kurumlar': [
            {
                'id': kurum.id,
                'kod': kurum.kod or '',
                'ad': kurum.ad,
                'aktif_mi': kurum.aktif_mi,
            }
            for kurum in recent_kurumlar
        ],
        'recent_ogrenci_kayitlar': [
            {
                'id': kayit.id,
                'ogrenci': {
                    'ad': kayit.ogrenci.ad if kayit.ogrenci else '',
                    'soyad': kayit.ogrenci.soyad if kayit.ogrenci else '',
                },
                'sinif': {
                    'ad': kayit.sinif.ad if kayit.sinif else '',
                },
                'egitim_yili': {
                    'baslangic_yil': kayit.egitim_yili.baslangic_yil if kayit.egitim_yili else None,
                    'bitis_yil': kayit.egitim_yili.bitis_yil if kayit.egitim_yili else None,
                },
            }
            for kayit in recent_ogrenci_kayitlar
        ],
    })
