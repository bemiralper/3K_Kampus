"""
Gelir Kaydı Serializers — API giriş/çıkış dönüşüm katmanı
"""
from rest_framework import serializers
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.constants.gider_types import KdvOrani


class GelirKaydiListSerializer(serializers.ModelSerializer):
    """Liste görünümü — minimal alanlar."""
    cari_hesap_adi = serializers.CharField(source='cari_hesap.gorunen_ad', read_only=True)
    kategori_adi = serializers.CharField(source='gelir_kategorisi.ad', read_only=True, default=None)
    sube_adi = serializers.CharField(source='sube.ad', read_only=True, default=None)
    durum_display = serializers.CharField(source='get_durum_display', read_only=True)
    kalan_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    tahsilat_yuzdesi = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    odeme_yontemi_adi = serializers.CharField(source='odeme_yontemi.ad', read_only=True, default=None)
    odeme_yontemi_tip = serializers.CharField(source='odeme_yontemi.tip', read_only=True, default=None)

    class Meta:
        model = GelirKaydi
        fields = [
            'id', 'cari_hesap_id', 'cari_hesap_adi',
            'gelir_kategorisi_id', 'kategori_adi',
            'sube_id', 'sube_adi',
            'odeme_yontemi_id', 'odeme_yontemi_adi', 'odeme_yontemi_tip',
            'fatura_no', 'fatura_tarihi', 'vade_tarihi', 'aciklama',
            'brut_tutar', 'kdv_orani', 'kdv_tutar', 'net_tutar',
            'tahsil_edilen', 'kalan_tutar', 'tahsilat_yuzdesi',
            'durum', 'durum_display',
            'created_at',
        ]


class GelirKaydiDetailSerializer(serializers.ModelSerializer):
    """Detay görünümü — tüm alanlar dahil."""
    cari_hesap_adi = serializers.CharField(source='cari_hesap.gorunen_ad', read_only=True)
    kategori_adi = serializers.CharField(source='gelir_kategorisi.ad', read_only=True, default=None)
    sube_adi = serializers.CharField(source='sube.ad', read_only=True, default=None)
    mali_hesap_adi = serializers.CharField(source='mali_hesap.hesap_adi', read_only=True, default=None)
    odeme_yontemi_adi = serializers.CharField(source='odeme_yontemi.ad', read_only=True, default=None)
    durum_display = serializers.CharField(source='get_durum_display', read_only=True)
    kalan_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    tahsilat_yuzdesi = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    duzenlenebilir_mi = serializers.BooleanField(read_only=True)
    iptal_edilebilir_mi = serializers.BooleanField(read_only=True)
    olusturan_adi = serializers.SerializerMethodField()

    class Meta:
        model = GelirKaydi
        fields = [
            'id', 'kurum_id', 'sube_id', 'sube_adi',
            'cari_hesap_id', 'cari_hesap_adi',
            'gelir_kategorisi_id', 'kategori_adi',
            'mali_hesap_id', 'mali_hesap_adi',
            'odeme_yontemi_id', 'odeme_yontemi_adi',
            'egitim_yili_id',
            'fatura_no', 'fatura_tarihi', 'vade_tarihi', 'aciklama',
            'brut_tutar', 'kdv_orani', 'kdv_tutar', 'net_tutar',
            'tahsil_edilen', 'kalan_tutar', 'tahsilat_yuzdesi',
            'durum', 'durum_display',
            'duzenlenebilir_mi', 'iptal_edilebilir_mi',
            'olusturan_adi',
            'belge',
            'created_at', 'updated_at',
        ]

    def get_olusturan_adi(self, obj):
        if obj.olusturan:
            return obj.olusturan.get_full_name() or obj.olusturan.username
        return None


class GelirKaydiCreateSerializer(serializers.Serializer):
    """Oluşturma serializer'ı."""
    cari_hesap_id = serializers.IntegerField()
    gelir_kategorisi_id = serializers.IntegerField()
    sube_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    egitim_yili_id = serializers.IntegerField(required=False, allow_null=True)

    fatura_no = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    fatura_tarihi = serializers.DateField()
    vade_tarihi = serializers.DateField()
    aciklama = serializers.CharField(required=False, allow_blank=True, default='')

    brut_tutar = serializers.DecimalField(max_digits=15, decimal_places=2)
    kdv_orani = serializers.ChoiceField(choices=KdvOrani.CHOICES, default=KdvOrani.YIRMI)


class GelirKaydiUpdateSerializer(serializers.Serializer):
    """Güncelleme serializer'ı — tüm alanlar opsiyonel."""
    cari_hesap_id = serializers.IntegerField(required=False)
    gelir_kategorisi_id = serializers.IntegerField(required=False)
    sube_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    egitim_yili_id = serializers.IntegerField(required=False, allow_null=True)

    fatura_no = serializers.CharField(max_length=50, required=False, allow_blank=True)
    fatura_tarihi = serializers.DateField(required=False)
    vade_tarihi = serializers.DateField(required=False)
    aciklama = serializers.CharField(required=False, allow_blank=True)

    brut_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    kdv_orani = serializers.ChoiceField(choices=KdvOrani.CHOICES, required=False)
