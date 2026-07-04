"""
Örnek View İmplementasyonları

Tenant-aware view örnekleri.
"""

from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.db import connection
from apps.kurum_yonetimi.middleware import set_active_tenant
from apps.kurum_yonetimi.models import Kurum, Sube, EgitimYili
import json


def tenant_selector_view(request):
    """
    Tenant seçici view.
    Kullanıcı kurum, şube ve eğitim yılı seçer.
    """
    if request.method == 'POST':
        kurum_id = request.POST.get('kurum_id')
        sube_id = request.POST.get('sube_id')
        egitim_yili_id = request.POST.get('egitim_yili_id')
        
        # Tenant bilgilerini session'a kaydet
        set_active_tenant(
            request,
            kurum_id=int(kurum_id) if kurum_id else None,
            sube_id=int(sube_id) if sube_id else None,
            egitim_yili_id=int(egitim_yili_id) if egitim_yili_id else None
        )
        
        return JsonResponse({'status': 'success', 'message': 'Tenant değiştirildi'})
    
    # GET request - form göster
    kurumlar = Kurum.objects.filter(aktif_mi=True)
    context = {
        'kurumlar': kurumlar
    }
    return render(request, 'kurum_yonetimi/tenant_selector.html', context)


def get_subeler_ajax(request, kurum_id):
    """
    AJAX ile şubeleri getir.
    """
    subeler = Sube.objects.filter(
        kurum_id=kurum_id,
        aktif_mi=True
    ).values('id', 'ad', 'kod')
    
    return JsonResponse({'subeler': list(subeler)})


def get_egitim_yillari_ajax(request, sube_id):
    """
    AJAX ile eğitim yıllarını getir.
    """
    egitim_yillari = EgitimYili.objects.filter(
        sube_id=sube_id
    ).values('id', 'yil', 'aktif_mi').order_by('-yil')
    
    return JsonResponse({'egitim_yillari': list(egitim_yillari)})


@require_http_methods(["GET"])
def ogrenci_listesi_view(request):
    """
    Aktif eğitim yılındaki öğrencileri listele.
    
    ZORUNLU: request.egitim_yili_id dolu olmalı!
    """
    if not request.egitim_yili_id:
        return JsonResponse(
            {'error': 'Önce bir eğitim yılı seçmelisiniz!'},
            status=400
        )
    
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        cursor.execute(f'''
            SELECT 
                id,
                tc_kimlik_no,
                ad,
                soyad,
                telefon,
                email,
                aktif_mi,
                created_at
            FROM "{schema_adi}".ogrenciler
            WHERE egitim_yili_id = %s
            AND aktif_mi = TRUE
            ORDER BY soyad, ad
        ''', [request.egitim_yili_id])
        
        columns = [col[0] for col in cursor.description]
        ogrenciler = [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    return JsonResponse({'ogrenciler': ogrenciler}, safe=False)


@require_http_methods(["POST"])
def ogrenci_ekle_view(request):
    """
    Yeni öğrenci ekle.
    
    ZORUNLU: request.kurum_id, sube_id, egitim_yili_id dolu olmalı!
    """
    if not all([request.kurum_id, request.sube_id, request.egitim_yili_id]):
        return JsonResponse(
            {'error': 'Tenant bilgileri eksik!'},
            status=400
        )
    
    # Form verilerini al
    data = json.loads(request.body)
    
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    try:
        with connection.cursor() as cursor:
            cursor.execute(f'''
                INSERT INTO "{schema_adi}".ogrenciler
                (kurum_id, sube_id, egitim_yili_id, tc_kimlik_no, ad, soyad, 
                 dogum_tarihi, cinsiyet, telefon, email, adres, aktif_mi)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            ''', [
                request.kurum_id,
                request.sube_id,
                request.egitim_yili_id,
                data.get('tc_kimlik_no'),
                data.get('ad'),
                data.get('soyad'),
                data.get('dogum_tarihi'),
                data.get('cinsiyet'),
                data.get('telefon'),
                data.get('email'),
                data.get('adres'),
                True
            ])
            
            ogrenci_id = cursor.fetchone()[0]
        
        return JsonResponse({
            'status': 'success',
            'message': 'Öğrenci başarıyla eklendi',
            'ogrenci_id': ogrenci_id
        })
        
    except Exception as e:
        return JsonResponse(
            {'error': f'Öğrenci eklenirken hata: {str(e)}'},
            status=500
        )


@require_http_methods(["GET"])
def sinif_listesi_view(request):
    """
    Aktif eğitim yılındaki sınıfları listele.
    """
    if not request.egitim_yili_id:
        return JsonResponse(
            {'error': 'Önce bir eğitim yılı seçmelisiniz!'},
            status=400
        )
    
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        cursor.execute(f'''
            SELECT 
                id,
                ad,
                kod,
                kapasite,
                aktif_mi,
                (
                    SELECT COUNT(*) 
                    FROM "{schema_adi}".ogrenci_sinif_atamalari 
                    WHERE sinif_id = siniflar.id AND aktif_mi = TRUE
                ) as mevcutt
            FROM "{schema_adi}".siniflar
            WHERE egitim_yili_id = %s
            AND aktif_mi = TRUE
            ORDER BY ad
        ''', [request.egitim_yili_id])
        
        columns = [col[0] for col in cursor.description]
        siniflar = [dict(zip(columns, row)) for row in cursor.fetchall()]
    
    return JsonResponse({'siniflar': siniflar}, safe=False)


@require_http_methods(["GET"])
def dashboard_view(request):
    """
    Dashboard - özet bilgiler.
    """
    if not request.egitim_yili_id:
        return render(request, 'kurum_yonetimi/select_tenant.html')
    
    schema_adi = request.aktif_egitim_yili.schema_adi
    
    with connection.cursor() as cursor:
        # Toplam öğrenci sayısı
        cursor.execute(f'''
            SELECT COUNT(*) 
            FROM "{schema_adi}".ogrenciler
            WHERE egitim_yili_id = %s AND aktif_mi = TRUE
        ''', [request.egitim_yili_id])
        toplam_ogrenci = cursor.fetchone()[0]
        
        # Toplam sınıf sayısı
        cursor.execute(f'''
            SELECT COUNT(*) 
            FROM "{schema_adi}".siniflar
            WHERE egitim_yili_id = %s AND aktif_mi = TRUE
        ''', [request.egitim_yili_id])
        toplam_sinif = cursor.fetchone()[0]
        
        # Bugünkü yoklama sayısı
        cursor.execute(f'''
            SELECT COUNT(*) 
            FROM "{schema_adi}".yoklamalar
            WHERE egitim_yili_id = %s AND tarih = CURRENT_DATE
        ''', [request.egitim_yili_id])
        bugunki_yoklama = cursor.fetchone()[0]
    
    context = {
        'toplam_ogrenci': toplam_ogrenci,
        'toplam_sinif': toplam_sinif,
        'bugunki_yoklama': bugunki_yoklama,
    }
    
    return render(request, 'kurum_yonetimi/dashboard.html', context)
