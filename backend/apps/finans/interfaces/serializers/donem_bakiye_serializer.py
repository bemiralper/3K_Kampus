"""
Dönem Bakiye Serializers
REST API çıktı formatları.
"""
from rest_framework import serializers

from apps.finans.domain.donem_bakiye import DonemBakiye
from apps.finans.constants.hareket_types import DonemDurum


class DonemBakiyeListSerializer(serializers.ModelSerializer):
    """Dönem bakiye listesi — şube/kurum özeti."""
    mali_hesap_ad = serializers.CharField(source='mali_hesap.ad', read_only=True)
    mali_hesap_tip = serializers.CharField(source='mali_hesap.tip', read_only=True)
    egitim_yili_str = serializers.SerializerMethodField()
    durum_label = serializers.SerializerMethodField()
    net_kar = serializers.IntegerField(read_only=True)
    gider_gelir_orani = serializers.FloatField(read_only=True)

    class Meta:
        model = DonemBakiye
        fields = [
            'id', 'mali_hesap', 'mali_hesap_ad', 'mali_hesap_tip',
            'egitim_yili', 'egitim_yili_str',
            'donem_basi_bakiye', 'toplam_gelir', 'toplam_gider',
            'donem_sonu_bakiye', 'devir_tutari',
            'durum', 'durum_label',
            'net_kar', 'gider_gelir_orani',
            'kapanma_tarihi', 'devir_tarihi',
        ]

    def get_egitim_yili_str(self, obj):
        return str(obj.egitim_yili) if obj.egitim_yili else ''

    def get_durum_label(self, obj):
        return DonemDurum.get_label(obj.durum)


class DonemBakiyeDetailSerializer(serializers.ModelSerializer):
    """Dönem bakiye detayı — tam bilgi."""
    mali_hesap_ad = serializers.CharField(source='mali_hesap.ad', read_only=True)
    mali_hesap_tip = serializers.CharField(source='mali_hesap.tip', read_only=True)
    sube_ad = serializers.SerializerMethodField()
    egitim_yili_str = serializers.SerializerMethodField()
    durum_label = serializers.SerializerMethodField()
    kapatan_ad = serializers.SerializerMethodField()
    net_kar = serializers.IntegerField(read_only=True)
    gider_gelir_orani = serializers.FloatField(read_only=True)

    class Meta:
        model = DonemBakiye
        fields = [
            'id', 'mali_hesap', 'mali_hesap_ad', 'mali_hesap_tip',
            'kurum', 'sube', 'sube_ad',
            'egitim_yili', 'egitim_yili_str',
            'donem_basi_bakiye', 'toplam_gelir', 'toplam_gider',
            'donem_sonu_bakiye', 'devir_tutari',
            'durum', 'durum_label',
            'net_kar', 'gider_gelir_orani',
            'kapanma_tarihi', 'devir_tarihi',
            'kapatan_kullanici', 'kapatan_ad',
            'notlar', 'created_at', 'updated_at',
        ]

    def get_sube_ad(self, obj):
        return obj.sube.ad if obj.sube else ''

    def get_egitim_yili_str(self, obj):
        return str(obj.egitim_yili) if obj.egitim_yili else ''

    def get_durum_label(self, obj):
        return DonemDurum.get_label(obj.durum)

    def get_kapatan_ad(self, obj):
        if obj.kapatan_kullanici:
            return obj.kapatan_kullanici.get_full_name() or obj.kapatan_kullanici.username
        return ''
