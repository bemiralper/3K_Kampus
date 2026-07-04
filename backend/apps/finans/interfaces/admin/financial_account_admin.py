"""
Mali Hesap Django Admin
"""
from django.contrib import admin

from apps.finans.domain.financial_account import MaliHesap


@admin.register(MaliHesap)
class MaliHesapAdmin(admin.ModelAdmin):
    list_display = ['ad', 'tip', 'sube', 'banka', 'banka_adi', 'baslangic_bakiye', 'para_birimi', 'aktif_mi', 'silindi_mi']
    list_filter = ['tip', 'aktif_mi', 'silindi_mi', 'para_birimi', 'banka', 'sube__kurum']
    search_fields = ['ad', 'iban', 'banka_adi', 'aciklama']
    ordering = ['sube', 'siralama', 'ad']
    list_editable = ['aktif_mi', 'siralama']
    readonly_fields = ['created_at', 'updated_at', 'silinme_tarihi']

    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('sube', 'ad', 'tip', 'aciklama'),
        }),
        ('Banka Bilgileri', {
            'fields': ('banka', 'banka_adi', 'iban', 'hesap_no'),
            'description': 'POS ve banka hesapları için banka seçimi zorunludur; IBAN opsiyoneldir.',
        }),
        ('Finansal Bilgiler', {
            'fields': ('baslangic_bakiye', 'para_birimi'),
        }),
        ('Durum', {
            'fields': ('aktif_mi', 'siralama', 'silindi_mi', 'silinme_tarihi'),
        }),
        ('Tarihler', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',),
        }),
    )

    def get_queryset(self, request):
        """Admin'de silinmiş kayıtlar dahil tüm kayıtları göster."""
        return MaliHesap.all_objects.all()
