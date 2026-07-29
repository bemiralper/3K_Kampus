from django.contrib import admin

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHaftalikSlot,
    BirebirHakedis,
    BirebirOgrenciProgrami,
    PremiumPaketDersKota,
    UcretKurali,
)


@admin.register(BirebirOgrenciProgrami)
class BirebirOgrenciProgramiAdmin(admin.ModelAdmin):
    list_display = ('id', 'ogrenci', 'sube', 'durum', 'baslangic_tarihi', 'bitis_tarihi')
    list_filter = ('durum', 'kurum', 'sube')


@admin.register(BirebirHaftalikSlot)
class BirebirHaftalikSlotAdmin(admin.ModelAdmin):
    list_display = ('id', 'program', 'gun', 'baslangic', 'bitis', 'ders', 'ogretmen', 'aktif')


@admin.register(BirebirDersOturumu)
class BirebirDersOturumuAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'session_date', 'start_time', 'ogrenci', 'ders', 'ogretmen', 'durum', 'oturum_turu',
    )
    list_filter = ('durum', 'oturum_turu', 'kurum', 'sube')


@admin.register(BirebirHakedis)
class BirebirHakedisAdmin(admin.ModelAdmin):
    list_display = ('id', 'ogretmen', 'tarih', 'tutar', 'durum')
    list_filter = ('durum',)


@admin.register(UcretKurali)
class UcretKuraliAdmin(admin.ModelAdmin):
    list_display = ('id', 'kurum', 'sube', 'oturum_turu', 'sozlesme_turu', 'mesai_modu', 'aktif')


@admin.register(PremiumPaketDersKota)
class PremiumPaketDersKotaAdmin(admin.ModelAdmin):
    list_display = ('id', 'premium_paket', 'ders', 'haftalik_adet', 'varsayilan_sure_dk')
