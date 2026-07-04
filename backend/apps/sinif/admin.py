from django.contrib import admin
from apps.sinif.domain.models import Sinif


@admin.register(Sinif)
class SinifAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kurum', 'sube', 'egitim_yili', 'mevcutluk', 'kapasite', 'aktif_mi']
    list_filter = ['aktif_mi', 'egitim_yili', 'kurum', 'sube', 'sinif_seviyesi', 'alan']
    search_fields = ['ad', 'kod']
    raw_id_fields = ['kurum', 'sube', 'egitim_yili']
    readonly_fields = ['mevcutluk', 'doluluk_orani', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('ad', 'kod', 'kapasite')
        }),
        ('Tenant Bilgileri', {
            'fields': ('kurum', 'sube', 'egitim_yili')
        }),
        ('Eğitim Bilgileri', {
            'fields': ('sinif_seviyesi', 'alan')
        }),
        ('İstatistikler', {
            'fields': ('mevcutluk', 'doluluk_orani')
        }),
        ('Durum', {
            'fields': ('aktif_mi', 'created_at', 'updated_at')
        }),
    )
