from django.contrib import admin
from apps.website.models import (
    SiteSettings, SiteSocialLink, SiteFooterLink, HeroSlide, Duyuru,
    SinavTakvim, NedenKart, BasariIstatistik, OgrenciYorumu, SSS,
    YasalMetin, IletisimMesaji,
)


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = ('kurum', 'telefon', 'eposta')


@admin.register(Duyuru)
class DuyuruAdmin(admin.ModelAdmin):
    list_display = ('baslik', 'kurum', 'yayin_tarihi', 'aktif')
    prepopulated_fields = {'slug': ('baslik',)}


admin.site.register(SiteSocialLink)
admin.site.register(SiteFooterLink)
admin.site.register(HeroSlide)
admin.site.register(SinavTakvim)
admin.site.register(NedenKart)
admin.site.register(BasariIstatistik)
admin.site.register(OgrenciYorumu)
admin.site.register(SSS)
admin.site.register(YasalMetin)
admin.site.register(IletisimMesaji)
