"""
Egitim Tanimlari Admin
"""
from django.contrib import admin
from apps.egitim_tanimlari.models import SinifSeviyesi, Alan, Ders, Brans


@admin.register(SinifSeviyesi)
class SinifSeviyesiAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'sira', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi',)
    search_fields = ('ad', 'kod')
    ordering = ('sira',)


@admin.register(Alan)
class AlanAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi',)
    search_fields = ('ad', 'kod')
    ordering = ('ad',)


@admin.register(Ders)
class DersAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi',)
    search_fields = ('ad', 'kod')
    filter_horizontal = ('sinif_seviyeleri', 'alanlar')
    ordering = ('ad',)


@admin.register(Brans)
class BransAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi',)
    search_fields = ('ad', 'kod')
    ordering = ('ad',)
