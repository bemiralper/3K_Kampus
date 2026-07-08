"""
Gider Kaydı & Taksit Serializers — API giriş/çıkış dönüşüm katmanı
"""
from rest_framework import serializers
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_taksit import GiderTaksit
from apps.finans.constants.gider_types import KdvOrani, TekrarSikligi, GiderTaksitDurum


# ─── Taksit Serializers ─────────────────────────

class GiderTaksitListSerializer(serializers.ModelSerializer):
    """Taksit listesi — gider detay ve geciken/yaklaşan listelerde kullanılır."""
    durum_display = serializers.CharField(source='get_durum_display', read_only=True)
    kalan_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    gider_kaydi_id = serializers.IntegerField(source='gider_kaydi.id', read_only=True)
    cari_hesap_adi = serializers.CharField(source='gider_kaydi.cari_hesap.gorunen_ad', read_only=True, default='')
    fatura_no = serializers.CharField(source='gider_kaydi.fatura_no', read_only=True, default='')
    aciklama = serializers.CharField(source='gider_kaydi.aciklama', read_only=True, default='')
    odeme_yontemi_adi = serializers.SerializerMethodField()
    odeme_yontemi_tip = serializers.SerializerMethodField()

    class Meta:
        model = GiderTaksit
        fields = [
            'id', 'gider_kaydi_id', 'taksit_no', 'vade_tarihi', 'tutar', 'odenen_tutar',
            'kalan_tutar', 'aciklama', 'durum', 'durum_display',
            'cari_hesap_adi', 'fatura_no', 'aciklama',
            'odeme_yontemi_id', 'odeme_yontemi_adi', 'odeme_yontemi_tip',
        ]

    def get_odeme_yontemi_adi(self, obj):
        if obj.odeme_yontemi_id:
            return obj.odeme_yontemi.ad
        gider_yontem = getattr(obj.gider_kaydi, 'odeme_yontemi', None)
        return gider_yontem.ad if gider_yontem else ''

    def get_odeme_yontemi_tip(self, obj):
        if obj.odeme_yontemi_id:
            return obj.odeme_yontemi.tip
        gider_yontem = getattr(obj.gider_kaydi, 'odeme_yontemi', None)
        return gider_yontem.tip if gider_yontem else ''


# ─── Gider Kaydı Serializers ────────────────────

class GiderKaydiListSerializer(serializers.ModelSerializer):
    """Liste görünümü — minimal alanlar."""
    cari_hesap_adi = serializers.CharField(source='cari_hesap.gorunen_ad', read_only=True)
    kategori_adi = serializers.CharField(source='gider_kategorisi.ad', read_only=True)
    sube_adi = serializers.CharField(source='sube.ad', read_only=True, default=None)
    durum_display = serializers.CharField(source='get_durum_display', read_only=True)
    kalan_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    odeme_yuzdesi = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    olusturan_adi = serializers.SerializerMethodField()
    odeme_yontemi_adi = serializers.CharField(source='odeme_yontemi.ad', read_only=True, default=None)
    odeme_yontemi_tip = serializers.CharField(source='odeme_yontemi.tip', read_only=True, default=None)

    class Meta:
        model = GiderKaydi
        fields = [
            'id', 'cari_hesap_id', 'cari_hesap_adi',
            'gider_kategorisi_id', 'kategori_adi',
            'sube_id', 'sube_adi',
            'odeme_yontemi_id', 'odeme_yontemi_adi', 'odeme_yontemi_tip',
            'fatura_no', 'fatura_tarihi', 'vade_tarihi', 'aciklama',
            'brut_tutar', 'kdv_orani', 'kdv_tutar', 'net_tutar',
            'odenen_toplam', 'kalan_tutar', 'odeme_yuzdesi',
            'taksit_sayisi', 'durum', 'durum_display',
            'tekrar_mi', 'olusturan_adi', 'created_at',
        ]

    def get_olusturan_adi(self, obj):
        if obj.olusturan:
            return obj.olusturan.get_full_name() or obj.olusturan.username
        return None


class GiderKaydiDetailSerializer(serializers.ModelSerializer):
    """Detay görünümü — taksitler ve tüm alanlar dahil."""
    cari_hesap_adi = serializers.CharField(source='cari_hesap.gorunen_ad', read_only=True)
    kategori_adi = serializers.CharField(source='gider_kategorisi.ad', read_only=True)
    sube_adi = serializers.CharField(source='sube.ad', read_only=True, default=None)
    mali_hesap_adi = serializers.CharField(source='mali_hesap.hesap_adi', read_only=True, default=None)
    odeme_yontemi_adi = serializers.CharField(source='odeme_yontemi.ad', read_only=True, default=None)
    durum_display = serializers.CharField(source='get_durum_display', read_only=True)
    kalan_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    odeme_yuzdesi = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    odenebilir_mi = serializers.BooleanField(read_only=True)
    iptal_edilebilir_mi = serializers.BooleanField(read_only=True)
    duzenlenebilir_mi = serializers.BooleanField(read_only=True)
    olusturan_adi = serializers.SerializerMethodField()
    onaylayan_adi = serializers.SerializerMethodField()
    taksitler = GiderTaksitListSerializer(many=True, read_only=True)

    class Meta:
        model = GiderKaydi
        fields = [
            'id', 'kurum_id', 'sube_id', 'sube_adi',
            'cari_hesap_id', 'cari_hesap_adi',
            'gider_kategorisi_id', 'kategori_adi',
            'mali_hesap_id', 'mali_hesap_adi',
            'odeme_yontemi_id', 'odeme_yontemi_adi',
            'egitim_yili_id',
            'fatura_no', 'fatura_tarihi', 'vade_tarihi', 'aciklama',
            'brut_tutar', 'kdv_orani', 'kdv_tutar', 'net_tutar',
            'odenen_toplam', 'kalan_tutar', 'odeme_yuzdesi',
            'taksit_sayisi', 'tekrar_mi', 'tekrar_sikligi', 'tekrar_bitis_tarihi',
            'durum', 'durum_display',
            'odenebilir_mi', 'iptal_edilebilir_mi', 'duzenlenebilir_mi',
            'olusturan_adi', 'onaylayan_adi', 'onay_tarihi',
            'belge',
            'taksitler',
            'created_at', 'updated_at',
        ]

    def get_olusturan_adi(self, obj):
        if obj.olusturan:
            return obj.olusturan.get_full_name() or obj.olusturan.username
        return None

    def get_onaylayan_adi(self, obj):
        if obj.onaylayan:
            return obj.onaylayan.get_full_name() or obj.onaylayan.username
        return None


class GiderKaydiCreateSerializer(serializers.Serializer):
    """Oluşturma serializer'ı."""
    cari_hesap_id = serializers.IntegerField()
    gider_kategorisi_id = serializers.IntegerField()
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
    taksit_sayisi = serializers.IntegerField(min_value=1, max_value=60, default=1)

    # Özel taksit planı (opsiyonel) — [{taksit_no, vade_tarihi, tutar}]
    taksit_plani = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True,
        default=None,
    )

    tekrar_mi = serializers.BooleanField(required=False, default=False)
    tekrar_sikligi = serializers.ChoiceField(
        choices=TekrarSikligi.CHOICES, required=False, allow_blank=True, default=''
    )
    tekrar_bitis_tarihi = serializers.DateField(required=False, allow_null=True)


class GiderKaydiUpdateSerializer(serializers.Serializer):
    """Güncelleme serializer'ı — tüm alanlar opsiyonel."""
    cari_hesap_id = serializers.IntegerField(required=False)
    gider_kategorisi_id = serializers.IntegerField(required=False)
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
    taksit_sayisi = serializers.IntegerField(min_value=1, max_value=60, required=False)

    tekrar_mi = serializers.BooleanField(required=False)
    tekrar_sikligi = serializers.ChoiceField(
        choices=TekrarSikligi.CHOICES, required=False, allow_blank=True
    )
    tekrar_bitis_tarihi = serializers.DateField(required=False, allow_null=True)
