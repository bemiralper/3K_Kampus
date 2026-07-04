"""
Gider Ödeme Serializers — API giriş/çıkış dönüşüm katmanı
"""
from rest_framework import serializers
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.interfaces.serializers.islem_masrafi_serializer import IslemMasrafiInputSerializer
from apps.finans.application.islem_masrafi_service import IslemMasrafiService


class GiderOdemeListSerializer(serializers.ModelSerializer):
    """Ödeme listesi."""
    cari_hesap_adi = serializers.CharField(source='gider_kaydi.cari_hesap.gorunen_ad', read_only=True)
    fatura_no = serializers.CharField(source='gider_kaydi.fatura_no', read_only=True)
    odeme_yontemi_adi = serializers.SerializerMethodField()
    mali_hesap_adi = serializers.SerializerMethodField()
    durum_display = serializers.CharField(source='get_durum_display', read_only=True)
    taksit_no = serializers.SerializerMethodField()
    islem_yapan_adi = serializers.SerializerMethodField()

    class Meta:
        model = GiderOdeme
        fields = [
            'id', 'gider_kaydi_id', 'gider_taksit_id', 'taksit_no',
            'cari_hesap_adi', 'fatura_no',
            'odeme_yontemi_id', 'odeme_yontemi_adi',
            'mali_hesap_id', 'mali_hesap_adi',
            'tutar', 'odeme_tarihi', 'aciklama',
            'durum', 'durum_display',
            'bakiyeden_mahsup',
            'islem_yapan_adi',
            'created_at',
        ]

    def get_taksit_no(self, obj):
        if obj.gider_taksit:
            return obj.gider_taksit.taksit_no
        return None

    def get_odeme_yontemi_adi(self, obj):
        if obj.odeme_yontemi:
            return obj.odeme_yontemi.ad
        return 'Bakiyeden Mahsup' if obj.bakiyeden_mahsup else None

    def get_mali_hesap_adi(self, obj):
        if obj.mali_hesap:
            return obj.mali_hesap.ad
        return 'Cari Bakiye' if obj.bakiyeden_mahsup else None

    def get_islem_yapan_adi(self, obj):
        if obj.islem_yapan:
            return obj.islem_yapan.get_full_name() or obj.islem_yapan.username
        return None


class GiderOdemeCreateSerializer(IslemMasrafiInputSerializer):
    """Ödeme oluşturma serializer'ı."""
    gider_kaydi_id = serializers.IntegerField()
    gider_taksit_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    tutar = serializers.DecimalField(max_digits=15, decimal_places=2)
    odeme_tarihi = serializers.DateField()
    aciklama = serializers.CharField(required=False, allow_blank=True, default='')
    bakiyeden_mahsup = serializers.BooleanField(required=False, default=False)
