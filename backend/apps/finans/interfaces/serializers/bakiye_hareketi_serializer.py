"""
Bakiye Hareketi Serializers
REST API çıktı formatları.
"""
from rest_framework import serializers

from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.constants.hareket_types import HareketYonu, HareketKaynagi


class BakiyeHareketiListSerializer(serializers.ModelSerializer):
    """Liste görünümü — kompakt."""
    mali_hesap_ad = serializers.CharField(source='mali_hesap.ad', read_only=True)
    yon_label = serializers.SerializerMethodField()
    kaynak_label = serializers.SerializerMethodField()
    islem_yapan_ad = serializers.SerializerMethodField()
    signed_tutar = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, coerce_to_string=False)

    class Meta:
        model = BakiyeHareketi
        extra_kwargs = {name: {'coerce_to_string': False} for name in ['tutar', 'bakiye_oncesi', 'bakiye_sonrasi']}
        fields = [
            'id', 'mali_hesap', 'mali_hesap_ad',
            'yon', 'yon_label', 'tutar', 'signed_tutar',
            'kaynak', 'kaynak_label', 'kaynak_tip', 'kaynak_id',
            'bakiye_oncesi', 'bakiye_sonrasi',
            'islem_tarihi', 'aciklama',
            'islem_yapan_ad', 'created_at',
        ]

    def get_yon_label(self, obj):
        return HareketYonu.get_label(obj.yon)

    def get_kaynak_label(self, obj):
        return HareketKaynagi.get_label(obj.kaynak)

    def get_islem_yapan_ad(self, obj):
        if obj.islem_yapan:
            return obj.islem_yapan.get_full_name() or obj.islem_yapan.username
        return ''


class BakiyeHareketiDetailSerializer(serializers.ModelSerializer):
    """Detay görünümü — tam bilgi."""
    mali_hesap_ad = serializers.CharField(source='mali_hesap.ad', read_only=True)
    mali_hesap_tip = serializers.CharField(source='mali_hesap.tip', read_only=True)
    sube_ad = serializers.SerializerMethodField()
    egitim_yili_str = serializers.SerializerMethodField()
    yon_label = serializers.SerializerMethodField()
    kaynak_label = serializers.SerializerMethodField()
    islem_yapan_ad = serializers.SerializerMethodField()
    signed_tutar = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True, coerce_to_string=False)

    class Meta:
        model = BakiyeHareketi
        extra_kwargs = {name: {'coerce_to_string': False} for name in ['tutar', 'bakiye_oncesi', 'bakiye_sonrasi']}
        fields = [
            'id', 'mali_hesap', 'mali_hesap_ad', 'mali_hesap_tip',
            'kurum', 'sube', 'sube_ad',
            'egitim_yili', 'egitim_yili_str',
            'yon', 'yon_label', 'tutar', 'signed_tutar',
            'kaynak', 'kaynak_label', 'kaynak_tip', 'kaynak_id',
            'bakiye_oncesi', 'bakiye_sonrasi',
            'islem_tarihi', 'aciklama',
            'islem_yapan', 'islem_yapan_ad',
            'created_at',
        ]

    def get_sube_ad(self, obj):
        return obj.sube.ad if obj.sube else ''

    def get_egitim_yili_str(self, obj):
        return str(obj.egitim_yili) if obj.egitim_yili else ''

    def get_yon_label(self, obj):
        return HareketYonu.get_label(obj.yon)

    def get_kaynak_label(self, obj):
        return HareketKaynagi.get_label(obj.kaynak)

    def get_islem_yapan_ad(self, obj):
        if obj.islem_yapan:
            return obj.islem_yapan.get_full_name() or obj.islem_yapan.username
        return ''
