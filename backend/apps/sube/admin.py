from django.contrib import admin
from apps.sube.domain.models import Sube

@admin.register(Sube)
class SubeAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kurum', 'kod', 'eposta', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'kurum', 'created_at']
    search_fields = ['ad', 'kod', 'resmi_ad', 'eposta', 'ticari_unvan']
    raw_id_fields = ['kurum']
    readonly_fields = ['created_at', 'updated_at']
    fieldsets = (
        ('Genel', {'fields': ('kurum', 'ad', 'kod', 'resmi_ad', 'aktif_mi')}),
        ('İletişim', {'fields': ('web_adresi', 'eposta', 'telefon', 'adres')}),
        ('Ticari', {'fields': ('ticari_unvan', 'vergi_dairesi', 'vergi_no', 'ticaret_sicil_no')}),
        ('Yönetim', {'fields': ('kurs_muduru', 'kurs_muduru_telefon')}),
        ('Sistem', {'fields': ('created_at', 'updated_at')}),
    )
