"""
Test Script - Logical Multi-Tenant Architecture

Bu script production-grade SaaS mimarisini test eder:
1. Kurum oluşturur (top-level tenant)
2. Şube oluşturur (second-level tenant)
3. Global eğitim yılı oluşturur
4. Sınıf oluşturur
5. Öğrenci oluşturur ve sınıfa kaydeder
6. Koç atar
"""

import os
import sys
import django
from datetime import date

# Django ayarlarını yükle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from backend.apps.kurum.domain.models import Kurum
from backend.apps.sube.domain.models import Sube
from backend.apps.egitim_yili.domain.models import EgitimYili
from backend.apps.sinif.domain.models import Sinif
from backend.apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from backend.apps.personel.domain.models import Personel, KocAtama
from django.db import connection


def test_system():
    print("=" * 80)
    print("LOGICAL MULTI-TENANT MİMARİ TEST")
    print("=" * 80)
    
    # 1. Kurum oluştur
    print("\n[1] KURUM OLUŞTURMA")
    kurum, created = Kurum.objects.get_or_create(
        kod="ABC",
        defaults={
            'ad': 'ABC Eğitim Kurumları',
            'aktif_mi': True
        }
    )
    if created:
        print(f"✓ Yeni kurum oluşturuldu: {kurum.ad}")
    else:
        print(f"✓ Kurum mevcut: {kurum.ad}")
    
    # 2. Şube oluştur
    print("\n[2] ŞUBE OLUŞTURMA")
    sube, created = Sube.objects.get_or_create(
        kurum=kurum,
        kod="ANK",
        defaults={
            'ad': 'Ankara Şubesi',
            'aktif_mi': True,
            'adres': 'Ankara, Türkiye',
            'telefon': '0312 123 45 67'
        }
    )
    if created:
        print(f"✓ Yeni şube oluşturuldu: {sube.ad}")
    else:
        print(f"✓ Şube mevcut: {sube.ad}")
    
    # 3. Global Eğitim Yılı Oluşturma
    print("\n[3] GLOBAL EĞİTİM YILI OLUŞTURMA")
    egitim_yili, created = EgitimYili.objects.get_or_create(
        baslangic_yil=2024,
        bitis_yil=2025,
        defaults={'aktif_mi': True}
    )
    if created:
        print(f"✓ Yeni eğitim yılı oluşturuldu: {egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}")
    else:
        print(f"✓ Eğitim yılı mevcut: {egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}")
    
    # 4. Tablo kontrolü
    print("\n[4] TABLO KONTROL (public schema)")
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
                AND table_name NOT LIKE 'django_%'
                AND table_name NOT LIKE 'auth_%'
            ORDER BY table_name
        """)
        
        tables = cursor.fetchall()
        print(f"✓ 'public' schema'sındaki uygulama tabloları:")
        for table in tables:
            print(f"  - {table[0]}")
    
    # 5. Sınıf Oluşturma
    print("\n[5] SINIF OLUŞTURMA")
    sinif, created = Sinif.objects.get_or_create(
        kurum=kurum,
        sube=sube,
        egitim_yili=egitim_yili,
        ad='12-A',
        defaults={
            'kod': '12A',
            'kapasite': 30,
            'aktif_mi': True
        }
    )
    if created:
        print(f"✓ Yeni sınıf oluşturuldu: {sinif.ad}")
    else:
        print(f"✓ Sınıf mevcut: {sinif.ad}")
    print(f"  - Kapasite: {sinif.kapasite}")
    print(f"  - Mevcut: {sinif.mevcutluk}")
    print(f"  - Doluluk: %{sinif.doluluk_orani:.1f}")
    
    # 6. Öğrenci Oluşturma (Persistent)
    print("\n[6] ÖĞRENCİ OLUŞTURMA")
    ogrenci, created = Ogrenci.objects.get_or_create(
        kurum=kurum,
        sube=sube,
        tc_kimlik_no='12345678901',
        defaults={
            'ad': 'Ahmet',
            'soyad': 'Yılmaz',
            'telefon': '0532 111 22 33',
            'email': 'ahmet.yilmaz@example.com'
        }
    )
    if created:
        print(f"✓ Yeni öğrenci oluşturuldu: {ogrenci.ad} {ogrenci.soyad}")
    else:
        print(f"✓ Öğrenci mevcut: {ogrenci.ad} {ogrenci.soyad}")
    
    # 7. Öğrenci Kaydı (Yearly)
    print("\n[7] ÖĞRENCİ KAYDI (SINIFA ATAMA)")
    kayit, created = OgrenciKayit.objects.get_or_create(
        ogrenci=ogrenci,
        egitim_yili=egitim_yili,
        defaults={'sinif': sinif}
    )
    if created:
        print(f"✓ Öğrenci sınıfa kaydedildi: {ogrenci.ad} → {sinif.ad}")
    else:
        print(f"✓ Kayıt mevcut: {ogrenci.ad} → {kayit.sinif.ad}")
    print(f"  - Eğitim Yılı: {egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}")
    
    # 8. Koç/Öğretmen Oluşturma
    print("\n[8] KOÇ/ÖĞRETMEN OLUŞTURMA")
    koc, created = Personel.objects.get_or_create(
        kurum=kurum,
        sube=sube,
        tc_kimlik_no='98765432109',
        defaults={
            'ad': 'Mehmet',
            'soyad': 'Demir',
            'gorev_turu': 'KOC',
            'telefon': '0533 444 55 66',
            'email': 'mehmet.demir@example.com'
        }
    )
    if created:
        print(f"✓ Yeni koç oluşturuldu: {koc.ad} {koc.soyad}")
    else:
        print(f"✓ Koç mevcut: {koc.ad} {koc.soyad}")
    
    # 9. Koç Atama (Yearly)
    print("\n[9] KOÇ ATAMA")
    atama, created = KocAtama.objects.get_or_create(
        koc=koc,
        sinif=sinif,
        egitim_yili=egitim_yili
    )
    if created:
        print(f"✓ Koç sınıfa atandı: {koc.ad} {koc.soyad} → {sinif.ad}")
    else:
        print(f"✓ Atama mevcut: {koc.ad} {koc.soyad} → {sinif.ad}")
    
    # 10. Veri Okuma Testi (Logical Filtering)
    print("\n[10] VERİ OKUMA TESTİ (TENANT FİLTRELEME)")
    
    # Sınıf sayısı
    sinif_sayisi = Sinif.objects.filter(
        kurum=kurum,
        sube=sube,
        egitim_yili=egitim_yili,
        aktif_mi=True
    ).count()
    
    # Öğrenci kayıt sayısı
    kayit_sayisi = OgrenciKayit.objects.filter(
        kurum=kurum,
        sube=sube,
        egitim_yili=egitim_yili
    ).count()
    
    # Toplam öğrenci sayısı
    toplam_ogrenci = Ogrenci.objects.filter(
        kurum=kurum,
        sube=sube
    ).count()
    
    # Koç atama sayısı
    atama_sayisi = KocAtama.objects.filter(
        egitim_yili=egitim_yili
    ).count()
    
    print(f"✓ Toplam sınıf (bu yıl): {sinif_sayisi}")
    print(f"✓ Toplam kayıtlı öğrenci (bu yıl): {kayit_sayisi}")
    print(f"✓ Toplam öğrenci (persistent): {toplam_ogrenci}")
    print(f"✓ Toplam koç ataması (bu yıl): {atama_sayisi}")
    
    # 11. Cross-Year Query Test
    print("\n[11] CROSS-YEAR QUERY TESTİ")
    ogrenci_kayitlari = OgrenciKayit.objects.filter(
        ogrenci=ogrenci
    ).select_related('egitim_yili', 'sinif').order_by('egitim_yili__baslangic_yil')
    
    print(f"✓ {ogrenci.ad} {ogrenci.soyad}'ın tüm yıllardaki kayıtları:")
    if ogrenci_kayitlari.exists():
        for kr in ogrenci_kayitlari:
            print(f"  - {kr.egitim_yili.baslangic_yil}-{kr.egitim_yili.bitis_yil}: {kr.sinif.ad}")
    else:
        print(f"  - Henüz kayıt yok")
    
    # Özet
    print("\n" + "=" * 80)
    print("TEST BAŞARIYLA TAMAMLANDI!")
    print("=" * 80)
    print("\nSİSTEM BİLGİLERİ:")
    print(f"  Mimari: Logical Multi-Tenant (Single Database)")
    print(f"  Kurum: {kurum.ad}")
    print(f"  Şube: {sube.ad}")
    print(f"  Eğitim Yılı: {egitim_yili.baslangic_yil}-{egitim_yili.bitis_yil}")
    print(f"  Sınıf Sayısı: {sinif_sayisi}")
    print(f"  Kayıtlı Öğrenci (bu yıl): {kayit_sayisi}")
    print(f"  Toplam Öğrenci (persistent): {toplam_ogrenci}")
    print(f"  Koç Ataması: {atama_sayisi}")
    print("\nADMIN PANEL:")
    print("  URL: http://127.0.0.1:8000/admin/")
    print("  (Superuser oluşturmak için: python manage.py createsuperuser)")
    print("=" * 80)


if __name__ == '__main__':
    test_system()
