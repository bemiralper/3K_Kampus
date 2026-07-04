from django.contrib import admin
from apps.egitim_yili.domain.models import EgitimYili


@admin.register(EgitimYili)
class EgitimYiliAdmin(admin.ModelAdmin):
    list_display = ['yil_str', 'baslangic_yil', 'bitis_yil', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'baslangic_yil', 'created_at']
    search_fields = ['baslangic_yil', 'bitis_yil']
    readonly_fields = ['created_at', 'updated_at']

