"""
Kurum Admin
"""
from django.contrib import admin
from apps.kurum.domain.models import Kurum


@admin.register(Kurum)
class KurumAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'created_at']
    search_fields = ['ad', 'kod', 'yetkili_ad_soyad', 'vergi_no']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('ad', 'kod', 'aktif_mi')
        }),
        ('İletişim', {
            'fields': ('telefon_sabit', 'telefon_cep', 'yetkili_ad_soyad', 'adres')
        }),
        ('Mali Bilgiler', {
            'fields': ('vergi_no', 'vergi_dairesi')
        }),
        ('Zaman Bilgisi', {
            'fields': ('created_at', 'updated_at')
        }),
    )
