"""
Ödeme Yöntemi Serializers
CRUD operasyonları için ayrı serializer'lar.
"""
from decimal import Decimal

from rest_framework import serializers

from apps.finans.domain.payment_method import OdemeYontemi
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.application.finans_tanim_usage import is_odeme_yontemi_in_use


class OdemeYontemiListSerializer(serializers.ModelSerializer):
    """Liste view'ı için — hafif serializer."""
    tip_display = serializers.SerializerMethodField()
    kurum_ad = serializers.CharField(source='kurum.ad', read_only=True)
    mali_hesap_ad = serializers.CharField(source='mali_hesap.ad', read_only=True, default=None)
    silinebilir = serializers.SerializerMethodField()
    kullanimda = serializers.SerializerMethodField()

    class Meta:
        model = OdemeYontemi
        fields = [
            'id', 'ad', 'tip', 'tip_display', 'komisyon_orani',
            'valor_gun', 'siralama', 'aktif_mi', 'kurum_ad',
            'mali_hesap', 'mali_hesap_ad',
            'silinebilir', 'kullanimda',
        ]

    def get_silinebilir(self, obj):
        return not is_odeme_yontemi_in_use(obj.id)

    def get_kullanimda(self, obj):
        return is_odeme_yontemi_in_use(obj.id)

    def get_tip_display(self, obj):
        return OdemeYontemiTipi.get_label(obj.tip)


class OdemeYontemiDetailSerializer(serializers.ModelSerializer):
    """Detay view'ı için — tüm alanlar."""
    tip_display = serializers.SerializerMethodField()
    kurum_ad = serializers.CharField(source='kurum.ad', read_only=True)
    mali_hesap_ad = serializers.CharField(source='mali_hesap.ad', read_only=True, default=None)

    silinebilir = serializers.SerializerMethodField()
    kullanimda = serializers.SerializerMethodField()

    class Meta:
        model = OdemeYontemi
        fields = [
            'id', 'kurum', 'kurum_ad', 'ad', 'tip', 'tip_display',
            'komisyon_orani', 'valor_gun', 'siralama', 'aktif_mi',
            'mali_hesap', 'mali_hesap_ad',
            'aciklama', 'silindi_mi', 'silinme_tarihi',
            'silinebilir', 'kullanimda',
            'created_at', 'updated_at',
        ]

    def get_silinebilir(self, obj):
        return not is_odeme_yontemi_in_use(obj.id)

    def get_kullanimda(self, obj):
        return is_odeme_yontemi_in_use(obj.id)

    def get_tip_display(self, obj):
        return OdemeYontemiTipi.get_label(obj.tip)


class OdemeYontemiCreateSerializer(serializers.Serializer):
    """Create işlemi için input serializer."""
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    ad = serializers.CharField(max_length=150)
    tip = serializers.ChoiceField(
        choices=OdemeYontemiTipi.CHOICES,
        default=OdemeYontemiTipi.NAKIT,
    )
    komisyon_orani = serializers.DecimalField(
        max_digits=5, decimal_places=2, default=0,
        min_value=Decimal('0'), max_value=Decimal('100'), allow_null=True,
    )
    valor_gun = serializers.IntegerField(default=0, min_value=0, allow_null=True)
    siralama = serializers.IntegerField(default=0, min_value=0)
    aktif_mi = serializers.BooleanField(default=True)
    aciklama = serializers.CharField(required=False, allow_blank=True, default='', allow_null=True)


class OdemeYontemiUpdateSerializer(serializers.Serializer):
    """Update işlemi için input serializer — tüm alanlar optional."""
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    ad = serializers.CharField(max_length=150, required=False)
    tip = serializers.ChoiceField(
        choices=OdemeYontemiTipi.CHOICES,
        required=False,
    )
    komisyon_orani = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False,
        min_value=Decimal('0'), max_value=Decimal('100'), allow_null=True,
    )
    valor_gun = serializers.IntegerField(required=False, min_value=0, allow_null=True)
    siralama = serializers.IntegerField(required=False, min_value=0)
    aktif_mi = serializers.BooleanField(required=False)
    aciklama = serializers.CharField(required=False, allow_blank=True, allow_null=True)
