from django.contrib import admin

from apps.kimlik.domain.models import Kisi


@admin.register(Kisi)
class KisiAdmin(admin.ModelAdmin):
    list_display = ['tam_ad', 'tc_kimlik_no', 'telefon', 'kurum', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'kurum']
    search_fields = ['ad', 'soyad', 'tc_kimlik_no', 'telefon']
    raw_id_fields = ['kurum']
