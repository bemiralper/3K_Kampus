from django.contrib import admin
from .models import DavranisPaketi, Deneme, EkHizmet, GrupDersi, OzelDers


@admin.register(EkHizmet)
class EkHizmetAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'hizmet_turu', 'fiyat', 'aktif_mi', 'egitim_yili', 'created_at')
    list_filter = ('aktif_mi', 'hizmet_turu', 'sinif_seviyeleri', 'egitim_yili')
    search_fields = ('ad', 'kod')
    filter_horizontal = ('sinif_seviyeleri',)
    ordering = ('hizmet_turu', 'ad')


@admin.register(GrupDersi)
class GrupDersiAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'alan', 'fiyat', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi', 'sinif_seviyeleri', 'alan')
    search_fields = ('ad', 'kod')
    filter_horizontal = ('sinif_seviyeleri', 'dersler', 'dahil_ek_hizmetler', 'dahil_denemeler',)
    ordering = ('ad',)


@admin.register(OzelDers)
class OzelDersAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'alan', 'fiyat', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi', 'sinif_seviyeleri', 'alan')
    search_fields = ('ad', 'kod')
    filter_horizontal = ('sinif_seviyeleri', 'dersler',)
    ordering = ('ad',)


@admin.register(Deneme)
class DenemeAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'deneme_sayisi', 'fiyat', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi', 'sinif_seviyeleri')
    search_fields = ('ad', 'kod')
    filter_horizontal = ('sinif_seviyeleri',)
    ordering = ('ad',)


@admin.register(DavranisPaketi)
class DavranisPaketiAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'fiyat', 'aktif_mi', 'created_at')
    list_filter = ('aktif_mi', 'sinif_seviyeleri')
    search_fields = ('ad', 'kod')
    filter_horizontal = ('sinif_seviyeleri',)
    ordering = ('ad',)
