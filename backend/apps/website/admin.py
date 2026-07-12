from django.contrib import admin
from apps.website.models import (
    SiteSettings, SiteSocialLink, SiteFooterLink, HeroSlide, Duyuru,
    SinavTakvim, NedenKart, BasariIstatistik, OgrenciYorumu, SSS,
    YasalMetin, IletisimMesaji,
    WebPage, WebPageVersion, MediaAsset, NavMenu, NavItem, SiteTheme,
    RedirectRule, ContentEntry, FormDefinition, FormSubmission,
    IntegrationSettings, NotFoundHit,
)


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    list_display = ('kurum', 'telefon', 'eposta')


@admin.register(Duyuru)
class DuyuruAdmin(admin.ModelAdmin):
    list_display = ('baslik', 'kurum', 'yayin_tarihi', 'aktif')
    prepopulated_fields = {'slug': ('baslik',)}


@admin.register(WebPage)
class WebPageAdmin(admin.ModelAdmin):
    list_display = ('title', 'slug', 'kurum', 'status', 'is_homepage', 'updated_at')
    list_filter = ('status', 'is_homepage', 'locale')
    search_fields = ('title', 'slug')
    prepopulated_fields = {'slug': ('title',)}


@admin.register(ContentEntry)
class ContentEntryAdmin(admin.ModelAdmin):
    list_display = ('title', 'kind', 'kurum', 'status', 'is_pinned')
    list_filter = ('kind', 'status')
    prepopulated_fields = {'slug': ('title',)}


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
admin.site.register(WebPageVersion)
admin.site.register(MediaAsset)
admin.site.register(NavMenu)
admin.site.register(NavItem)
admin.site.register(SiteTheme)
admin.site.register(RedirectRule)
admin.site.register(FormDefinition)
admin.site.register(FormSubmission)
admin.site.register(IntegrationSettings)
admin.site.register(NotFoundHit)
