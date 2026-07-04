from django.contrib import admin

from apps.gorev.domain.models import Gorev, GorevAtama, GorevTipi, GorevTekrarSablonu


@admin.register(GorevTipi)
class GorevTipiAdmin(admin.ModelAdmin):
    list_display = ('ad', 'kod', 'kurum_id', 'renk', 'is_active', 'is_system')
    list_filter = ('is_active', 'is_system')


class GorevAtamaInline(admin.TabularInline):
    model = GorevAtama
    extra = 0


@admin.register(Gorev)
class GorevAdmin(admin.ModelAdmin):
    list_display = ('baslik', 'oncelik', 'son_tarih', 'hedef_tipi', 'kurum_id')
    list_filter = ('oncelik', 'hedef_tipi', 'is_deleted')
    inlines = [GorevAtamaInline]


@admin.register(GorevAtama)
class GorevAtamaAdmin(admin.ModelAdmin):
    list_display = ('gorev', 'atanan_user_id', 'durum')
    list_filter = ('durum',)


@admin.register(GorevTekrarSablonu)
class GorevTekrarSablonuAdmin(admin.ModelAdmin):
    list_display = ('baslik', 'tekrar_tipi', 'sonraki_uretim_tarihi', 'aktif', 'kurum_id')
    list_filter = ('aktif', 'tekrar_tipi')
