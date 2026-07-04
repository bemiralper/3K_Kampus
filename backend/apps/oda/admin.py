from django.contrib import admin
from .domain.models import Oda


@admin.register(Oda)
class OdaAdmin(admin.ModelAdmin):
    list_display = ['ad', 'sube', 'kapasite', 'oda_turu', 'aktif_mi', 'created_at']
    list_filter = ['sube', 'oda_turu', 'aktif_mi']
    search_fields = ['ad', 'sube__ad']
    ordering = ['sube', 'ad']
