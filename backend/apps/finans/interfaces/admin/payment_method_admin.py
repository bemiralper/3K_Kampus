"""
Ödeme Yöntemi Django Admin
"""
from django.contrib import admin

from apps.finans.domain.payment_method import OdemeYontemi


@admin.register(OdemeYontemi)
class OdemeYontemiAdmin(admin.ModelAdmin):
    list_display = ['ad', 'tip', 'mali_hesap', 'kurum', 'komisyon_orani', 'valor_gun', 'aktif_mi', 'silindi_mi']
    list_filter = ['tip', 'aktif_mi', 'silindi_mi', 'kurum']
    search_fields = ['ad', 'aciklama']
    ordering = ['kurum', 'siralama', 'ad']
    list_editable = ['aktif_mi', 'siralama']
    readonly_fields = ['kurum', 'created_at', 'updated_at', 'silinme_tarihi']

    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('mali_hesap', 'kurum', 'ad', 'tip', 'aciklama'),
        }),
        ('Finansal Parametreler', {
            'fields': ('komisyon_orani', 'valor_gun'),
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
        return OdemeYontemi.all_objects.all()
