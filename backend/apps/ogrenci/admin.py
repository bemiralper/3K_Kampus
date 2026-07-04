from django.contrib import admin
from apps.ogrenci.domain.models import (
    Ogrenci, OgrenciKayit, OgrenciAdres, OgrenciVeli, OgrenciEgitimPaketi, OgrenciEkHizmet
)


@admin.register(Ogrenci)
class OgrenciAdmin(admin.ModelAdmin):
    list_display = ['tam_ad', 'tc_kimlik_no', 'kurum', 'sube', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'cinsiyet', 'kurum', 'sube', 'created_at']
    search_fields = ['ad', 'soyad', 'tc_kimlik_no', 'telefon']
    raw_id_fields = ['kurum', 'sube']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('kurum', 'sube', 'ad', 'soyad', 'tc_kimlik_no', 'dogum_tarihi', 'cinsiyet')
        }),
        ('İletişim', {
            'fields': ('telefon', 'email', 'adres')
        }),
        ('Veli Bilgileri', {
            'fields': ('veli_ad_soyad', 'veli_telefon')
        }),
        ('Durum', {
            'fields': ('aktif_mi', 'created_at', 'updated_at')
        }),
    )


@admin.register(OgrenciKayit)
class OgrenciKayitAdmin(admin.ModelAdmin):
    list_display = ['ogrenci', 'sinif', 'egitim_yili', 'kurum', 'sube', 'aktif_mi', 'kayit_tarihi']
    list_filter = ['aktif_mi', 'egitim_yili', 'kurum', 'sube', 'kayit_tarihi']
    search_fields = ['ogrenci__ad', 'ogrenci__soyad', 'sinif__ad']
    raw_id_fields = ['ogrenci', 'sinif', 'kurum', 'sube', 'egitim_yili']
    readonly_fields = ['kayit_tarihi', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Kayıt Bilgileri', {
            'fields': ('ogrenci', 'sinif', 'egitim_yili')
        }),
        ('Tenant Bilgileri', {
            'fields': ('kurum', 'sube')
        }),
        ('Durum', {
            'fields': ('aktif_mi', 'kayit_tarihi', 'created_at', 'updated_at')
        }),
    )


@admin.register(OgrenciAdres)
class OgrenciAdresAdmin(admin.ModelAdmin):
    list_display = ['ogrenci', 'adres_turu', 'il', 'ilce', 'varsayilan']
    list_filter = ['adres_turu', 'varsayilan', 'il']
    search_fields = ['ogrenci__ad', 'ogrenci__soyad', 'adres', 'il', 'ilce']
    raw_id_fields = ['ogrenci']


@admin.register(OgrenciVeli)
class OgrenciVeliAdmin(admin.ModelAdmin):
    list_display = ['tam_ad', 'veli_turu', 'ogrenci', 'telefon', 'varsayilan']
    list_filter = ['veli_turu', 'varsayilan', 'ogrenci_kendi_velisi']
    search_fields = ['ad', 'soyad', 'tc_kimlik_no', 'ogrenci__ad', 'ogrenci__soyad']
    raw_id_fields = ['ogrenci']


@admin.register(OgrenciEgitimPaketi)
class OgrenciEgitimPaketiAdmin(admin.ModelAdmin):
    list_display = ['ogrenci', 'paket_turu', 'paket_adi', 'kayit_tarihi', 'aktif_mi']
    list_filter = ['aktif_mi', 'paket_turu', 'kayit_tarihi']
    search_fields = ['ogrenci__ad', 'ogrenci__soyad', 'paket_adi']
    raw_id_fields = ['ogrenci']


@admin.register(OgrenciEkHizmet)
class OgrenciEkHizmetAdmin(admin.ModelAdmin):
    list_display = ['ogrenci', 'ek_hizmet', 'fiyat', 'dahil_mi', 'egitim_yili', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'dahil_mi', 'ek_hizmet__hizmet_turu', 'egitim_yili']
    search_fields = ['ogrenci__ad', 'ogrenci__soyad', 'ek_hizmet__ad']
    raw_id_fields = ['ogrenci', 'ek_hizmet']
    readonly_fields = ['created_at', 'updated_at']
