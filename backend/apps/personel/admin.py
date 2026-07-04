from django.contrib import admin
from apps.personel.domain.models import Personel, PersonelGorevlendirme


@admin.register(Personel)
class PersonelAdmin(admin.ModelAdmin):
    list_display = ['tam_ad', 'tc_kimlik_no', 'cep_telefon', 'email', 'kurum', 'sube', 'aktif_mi', 'has_user_account', 'created_at']
    list_filter = ['aktif_mi', 'cinsiyet', 'kurum', 'sube', 'created_at']
    search_fields = ['ad', 'soyad', 'tc_kimlik_no', 'telefon', 'cep_telefon', 'email']
    raw_id_fields = ['kurum', 'sube', 'user']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('kurum', 'sube', 'ad', 'soyad', 'tc_kimlik_no', 'dogum_tarihi', 'cinsiyet')
        }),
        ('İletişim Bilgileri', {
            'fields': ('telefon', 'cep_telefon', 'email', 'adres', 'il', 'ilce')
        }),
        ('Acil Durum', {
            'fields': ('acil_durum_kisi', 'acil_durum_telefon'),
            'classes': ('collapse',)
        }),
        ('Sistem Hesabı', {
            'fields': ('user',)
        }),
        ('Durum ve Notlar', {
            'fields': ('aktif_mi', 'notlar', 'created_at', 'updated_at')
        }),
    )


@admin.register(PersonelGorevlendirme)
class PersonelGorevlendirmeAdmin(admin.ModelAdmin):
    list_display = ['personel', 'rol', 'gorev_sube', 'egitim_yili', 'brans', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'egitim_yili', 'kurum', 'gorev_sube']
    search_fields = ['personel__ad', 'personel__soyad']
    raw_id_fields = ['personel', 'rol', 'gorev_sube', 'kurum', 'egitim_yili', 'brans']
    readonly_fields = ['created_at', 'updated_at']
    filter_horizontal = ['siniflar']
    
    fieldsets = (
        ('Personel ve Rol', {
            'fields': ('personel', 'rol', 'brans')
        }),
        ('Görev Yeri', {
            'fields': ('gorev_sube', 'egitim_yili', 'kurum')
        }),
        ('Atanan Sınıflar', {
            'fields': ('siniflar',),
            'classes': ('collapse',)
        }),
        ('Görev Tarihleri', {
            'fields': ('gorev_baslangic', 'gorev_bitis'),
            'classes': ('collapse',)
        }),
        ('Durum', {
            'fields': ('aktif_mi', 'notlar', 'created_at', 'updated_at')
        }),
    )
