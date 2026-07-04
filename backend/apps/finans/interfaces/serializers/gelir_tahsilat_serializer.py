"""
Gelir Tahsilat Serializers — API giriş/çıkış dönüşüm katmanı
"""
from rest_framework import serializers
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.interfaces.serializers.islem_masrafi_serializer import IslemMasrafiInputSerializer
from apps.finans.application.islem_masrafi_service import IslemMasrafiService


class GelirTahsilatListSerializer(serializers.ModelSerializer):
    """Tahsilat listesi."""
    cari_hesap_adi = serializers.CharField(
        source='gelir_kaydi.cari_hesap.gorunen_ad', read_only=True
    )
    fatura_no = serializers.CharField(
        source='gelir_kaydi.fatura_no', read_only=True
    )
    odeme_yontemi_adi = serializers.SerializerMethodField()
    mali_hesap_adi = serializers.SerializerMethodField()
    durum_display = serializers.CharField(
        source='get_durum_display', read_only=True
    )
    islem_yapan_adi = serializers.SerializerMethodField()

    class Meta:
        model = GelirTahsilat
        fields = [
            'id', 'gelir_kaydi_id',
            'cari_hesap_adi', 'fatura_no',
            'odeme_yontemi_id', 'odeme_yontemi_adi',
            'mali_hesap_id', 'mali_hesap_adi',
            'tutar', 'tahsilat_tarihi', 'aciklama',
            'durum', 'durum_display',
            'islem_yapan_adi',
            'created_at',
        ]

    def get_odeme_yontemi_adi(self, obj):
        return obj.odeme_yontemi.ad if obj.odeme_yontemi else None

    def get_mali_hesap_adi(self, obj):
        return obj.mali_hesap.ad if obj.mali_hesap else None

    def get_islem_yapan_adi(self, obj):
        if obj.islem_yapan:
            return obj.islem_yapan.get_full_name() or obj.islem_yapan.username
        return None


class GelirTahsilatCreateSerializer(IslemMasrafiInputSerializer):
    """Tahsilat oluşturma serializer'ı."""
    gelir_kaydi_id = serializers.IntegerField()
    odeme_yontemi_id = serializers.IntegerField()
    mali_hesap_id = serializers.IntegerField()
    tutar = serializers.DecimalField(max_digits=15, decimal_places=2)
    tahsilat_tarihi = serializers.DateField()
    aciklama = serializers.CharField(required=False, allow_blank=True, default='')


class GelirTahsilatDetailSerializer(GelirTahsilatListSerializer):
    """Tahsilat detayı — işlem masrafı dahil."""
    islem_masrafi = serializers.SerializerMethodField()

    class Meta(GelirTahsilatListSerializer.Meta):
        fields = GelirTahsilatListSerializer.Meta.fields + ['islem_masrafi']

    def get_islem_masrafi(self, obj):
        from apps.finans.domain.islem_masrafi import IslemMasrafiKaynakTipi
        masraf = IslemMasrafiService.get_by_kaynak(
            IslemMasrafiKaynakTipi.GELIR_TAHSILAT, obj.pk,
        )
        return IslemMasrafiService.serialize_masraf(masraf)
