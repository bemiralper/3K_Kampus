from django.contrib import admin
from apps.kurum_yonetimi.models import Kurum, Sube, EgitimYili


@admin.register(Kurum)
class KurumAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'aktif_mi', 'created_at']
    list_filter = ['aktif_mi', 'created_at']
    search_fields = ['ad', 'kod']
    ordering = ['ad']


@admin.register(Sube)
class SubeAdmin(admin.ModelAdmin):
    list_display = ['ad', 'kod', 'kurum', 'aktif_mi', 'telefon']
    list_filter = ['aktif_mi', 'kurum', 'created_at']
    search_fields = ['ad', 'kod', 'kurum__ad']
    ordering = ['kurum', 'ad']
    raw_id_fields = ['kurum']


@admin.register(EgitimYili)
class EgitimYiliAdmin(admin.ModelAdmin):
    list_display = ['yil', 'kurum', 'sube', 'schema_adi', 'aktif_mi', 'baslangic_tarihi', 'bitis_tarihi']
    list_filter = ['aktif_mi', 'kurum', 'sube', 'yil']
    search_fields = ['yil', 'schema_adi', 'kurum__ad', 'sube__ad']
    ordering = ['-yil']
    raw_id_fields = ['kurum', 'sube']
    readonly_fields = ['schema_adi', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Temel Bilgiler', {
            'fields': ('kurum', 'sube', 'yil')
        }),
        ('Tarihler', {
            'fields': ('baslangic_tarihi', 'bitis_tarihi')
        }),
        ('Teknik Bilgiler', {
            'fields': ('schema_adi', 'aktif_mi')
        }),
        ('Sistem', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )
    
    def save_model(self, request, obj, form, change):
        """
        Yeni eğitim yılı kaydedilirken schema oluşturma uyarısı.
        Gerçek uygulamada YeniEgitimYiliServisi kullanılmalı!
        """
        super().save_model(request, obj, form, change)
        if not change:  # Yeni kayıt
            self.message_user(
                request,
                f"⚠️ Eğitim yılı kaydı oluşturuldu. Schema oluşturmak için "
                f"YeniEgitimYiliServisi.yeni_egitim_yili_baslat() kullanın!",
                level='WARNING'
            )
