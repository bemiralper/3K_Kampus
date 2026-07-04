"""
Mali Hesap Serializers
CRUD operasyonları için ayrı serializer'lar.
"""
from rest_framework import serializers

from apps.finans.domain.financial_account import MaliHesap, ParaBirimi
from apps.finans.constants.account_types import MaliHesapTipi, BankaKodu


class MaliHesapListSerializer(serializers.ModelSerializer):
    """Liste view'ı için — hafif serializer."""
    tip_display = serializers.SerializerMethodField()
    banka_display = serializers.SerializerMethodField()
    sube_ad = serializers.CharField(source='sube.ad', read_only=True)

    class Meta:
        model = MaliHesap
        fields = [
            'id', 'ad', 'tip', 'tip_display', 'banka', 'banka_display', 'iban', 'banka_adi', 'hesap_no',
            'baslangic_bakiye', 'para_birimi', 'siralama',
            'aktif_mi', 'sube_ad',
        ]

    def get_tip_display(self, obj):
        return MaliHesapTipi.get_label(obj.tip)

    def get_banka_display(self, obj):
        return BankaKodu.get_label(obj.banka) if obj.banka else (obj.banka_adi or '')


class MaliHesapDetailSerializer(serializers.ModelSerializer):
    """Detay view'ı için — tüm alanlar."""
    tip_display = serializers.SerializerMethodField()
    banka_display = serializers.SerializerMethodField()
    sube_ad = serializers.CharField(source='sube.ad', read_only=True)

    class Meta:
        model = MaliHesap
        fields = [
            'id', 'sube', 'sube_ad', 'ad', 'tip', 'tip_display',
            'banka', 'banka_display', 'iban', 'banka_adi', 'hesap_no', 'baslangic_bakiye', 'para_birimi',
            'siralama', 'aktif_mi', 'aciklama',
            'silindi_mi', 'silinme_tarihi',
            'created_at', 'updated_at',
        ]

    def get_tip_display(self, obj):
        return MaliHesapTipi.get_label(obj.tip)

    def get_banka_display(self, obj):
        return BankaKodu.get_label(obj.banka) if obj.banka else (obj.banka_adi or '')


class MaliHesapCreateSerializer(serializers.Serializer):
    """Create işlemi için input serializer."""
    ad = serializers.CharField(max_length=200)
    tip = serializers.ChoiceField(
        choices=MaliHesapTipi.CHOICES,
        default=MaliHesapTipi.KASA,
    )
    iban = serializers.CharField(
        max_length=34, required=False, allow_blank=True, default='',
    )
    banka = serializers.ChoiceField(
        choices=BankaKodu.CHOICES,
        required=False,
        allow_blank=True,
        default='',
    )
    banka_adi = serializers.CharField(
        max_length=100, required=False, allow_blank=True, default='',
    )
    hesap_no = serializers.CharField(
        max_length=50, required=False, allow_blank=True, default='',
    )
    baslangic_bakiye = serializers.DecimalField(
        max_digits=15, decimal_places=2, default=0,
    )
    para_birimi = serializers.ChoiceField(
        choices=ParaBirimi.CHOICES,
        default=ParaBirimi.TRY,
    )
    siralama = serializers.IntegerField(default=0, min_value=0)
    aktif_mi = serializers.BooleanField(default=True)
    aciklama = serializers.CharField(required=False, allow_blank=True, default='')


class MaliHesapUpdateSerializer(serializers.Serializer):
    """Update işlemi için input serializer — tüm alanlar optional."""
    ad = serializers.CharField(max_length=200, required=False)
    tip = serializers.ChoiceField(
        choices=MaliHesapTipi.CHOICES,
        required=False,
    )
    iban = serializers.CharField(
        max_length=34, required=False, allow_blank=True,
    )
    banka = serializers.ChoiceField(
        choices=BankaKodu.CHOICES,
        required=False,
        allow_blank=True,
        default='',
    )
    banka_adi = serializers.CharField(
        max_length=100, required=False, allow_blank=True,
    )
    hesap_no = serializers.CharField(
        max_length=50, required=False, allow_blank=True,
    )
    baslangic_bakiye = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False,
    )
    para_birimi = serializers.ChoiceField(
        choices=ParaBirimi.CHOICES,
        required=False,
    )
    siralama = serializers.IntegerField(required=False, min_value=0)
    aktif_mi = serializers.BooleanField(required=False)
    aciklama = serializers.CharField(required=False, allow_blank=True)
