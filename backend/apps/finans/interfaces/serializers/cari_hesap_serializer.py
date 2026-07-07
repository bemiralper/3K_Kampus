"""
Cari Hesap Serializers — API giriş/çıkış dönüşüm katmanı
"""
from rest_framework import serializers
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.constants.cari_types import CariHesapTuru


class CariHesapListSerializer(serializers.ModelSerializer):
    """Liste görünümü — minimal alanlar + işlem türü kırılımı."""
    hesap_turu_display = serializers.CharField(read_only=True)
    bakiye = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    bakiye_durumu = serializers.CharField(read_only=True)
    gorunen_ad = serializers.CharField(read_only=True)
    toplam_satis = serializers.SerializerMethodField()
    toplam_alis = serializers.SerializerMethodField()
    toplam_tahsilat = serializers.SerializerMethodField()
    toplam_odeme = serializers.SerializerMethodField()
    toplam_iade = serializers.SerializerMethodField()
    toplam_mahsup = serializers.SerializerMethodField()
    son_islem_tarihi = serializers.SerializerMethodField()

    class Meta:
        model = CariHesap
        fields = [
            'id', 'unvan', 'kisa_ad', 'gorunen_ad',
            'hesap_turu', 'hesap_turu_display', 'hesap_kodu',
            'vergi_no', 'telefon', 'email',
            'yetkili_kisi', 'il', 'ilce',
            'toplam_borc', 'toplam_alacak', 'bakiye', 'bakiye_durumu',
            'toplam_satis', 'toplam_alis', 'toplam_tahsilat', 'toplam_odeme',
            'toplam_iade', 'toplam_mahsup',
            'son_islem_tarihi',
            'aktif_mi', 'created_at',
        ]

    def _islem(self, obj):
        return self.context.get('islem_totals', {}).get(obj.pk, {})

    def get_toplam_satis(self, obj):
        return self._islem(obj).get('satis', 0)

    def get_toplam_alis(self, obj):
        return self._islem(obj).get('alis', 0)

    def get_toplam_tahsilat(self, obj):
        return self._islem(obj).get('tahsilat', 0)

    def get_toplam_odeme(self, obj):
        return self._islem(obj).get('odeme', 0)

    def get_toplam_iade(self, obj):
        return self._islem(obj).get('iade', 0)

    def get_toplam_mahsup(self, obj):
        return self._islem(obj).get('mahsup', 0)

    def get_son_islem_tarihi(self, obj):
        son = self.context.get('son_hareket_map', {}).get(obj.pk)
        return son.islem_tarihi.isoformat() if son else None


class CariHesapDetailSerializer(serializers.ModelSerializer):
    """Detay görünümü — tüm alanlar."""
    hesap_turu_display = serializers.CharField(read_only=True)
    bakiye = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True)
    bakiye_durumu = serializers.CharField(read_only=True)
    gorunen_ad = serializers.CharField(read_only=True)
    gider_kategorileri = serializers.SerializerMethodField()
    gelir_kategorileri = serializers.SerializerMethodField()
    serbest_bakiye = serializers.SerializerMethodField()
    gider_borcu = serializers.SerializerMethodField()
    toplam_gider = serializers.SerializerMethodField()
    toplam_gelir = serializers.SerializerMethodField()
    gelir_alacagi = serializers.SerializerMethodField()
    tahsil_edilen_gelir = serializers.SerializerMethodField()
    gider_kayit_sayisi = serializers.SerializerMethodField()
    gelir_kayit_sayisi = serializers.SerializerMethodField()

    class Meta:
        model = CariHesap
        fields = [
            'id', 'kurum_id', 'unvan', 'kisa_ad', 'gorunen_ad',
            'hesap_turu', 'hesap_turu_display', 'hesap_kodu',
            'gider_kategorileri',
            'gelir_kategorileri',
            'vergi_no', 'vergi_dairesi',
            'telefon', 'email', 'adres', 'il', 'ilce',
            'yetkili_kisi', 'yetkili_telefon',
            'banka_adi', 'iban', 'hesap_sahibi',
            'toplam_borc', 'toplam_alacak', 'bakiye', 'bakiye_durumu',
            'serbest_bakiye', 'gider_borcu', 'toplam_gider',
            'toplam_gelir', 'gelir_alacagi', 'tahsil_edilen_gelir',
            'gider_kayit_sayisi', 'gelir_kayit_sayisi',
            'notlar', 'aktif_mi',
            'created_at', 'updated_at',
        ]

    def get_gider_kategorileri(self, obj):
        return list(obj.gider_kategorileri.values('id', 'ad'))

    def get_gelir_kategorileri(self, obj):
        return list(obj.gelir_kategorileri.values('id', 'ad'))

    def get_serbest_bakiye(self, obj):
        """
        Serbest bakiye = serbest ödemeler - serbest iptal - mahsuplar.
        Mahsup için kullanılabilir tutar.
        """
        from django.db.models import Sum
        qs = obj.hareketler.all()
        serbest = qs.filter(
            kaynak_tip='SerbestOdeme', islem_turu='odeme'
        ).aggregate(t=Sum('tutar'))['t'] or 0
        iptaller = qs.filter(
            kaynak_tip='SerbestOdemeIptal'
        ).aggregate(t=Sum('tutar'))['t'] or 0
        mahsuplar = qs.filter(
            islem_turu='mahsup'
        ).aggregate(t=Sum('tutar'))['t'] or 0
        return float(serbest - iptaller - mahsuplar)

    def get_gider_borcu(self, obj):
        """Ödenmemiş gider toplamı (net_tutar - odenen_toplam)."""
        from django.db.models import Sum, F
        from apps.finans.domain.gider_kaydi import GiderKaydi
        result = GiderKaydi.objects.filter(
            cari_hesap=obj,
            durum__in=['onaylandi', 'kismi_odendi'],
        ).aggregate(
            kalan=Sum(F('net_tutar') - F('odenen_toplam'))
        )
        return float(result['kalan'] or 0)

    def get_toplam_gider(self, obj):
        """Onaylı giderlerin toplam net tutarı."""
        from django.db.models import Sum
        from apps.finans.domain.gider_kaydi import GiderKaydi
        result = GiderKaydi.objects.filter(
            cari_hesap=obj,
            durum__in=['onaylandi', 'kismi_odendi', 'odendi'],
        ).aggregate(t=Sum('net_tutar'))
        return float(result['t'] or 0)

    def get_toplam_gelir(self, obj):
        """Onaylı gelirlerin toplam net tutarı."""
        from django.db.models import Sum
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        result = GelirKaydi.objects.filter(
            cari_hesap=obj,
            durum__in=['onaylandi', 'kismi_tahsil', 'tahsil_edildi'],
        ).aggregate(t=Sum('net_tutar'))
        return float(result['t'] or 0)

    def get_gelir_alacagi(self, obj):
        """Tahsil edilmemiş gelir toplamı."""
        from django.db.models import Sum, F
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        result = GelirKaydi.objects.filter(
            cari_hesap=obj,
            durum__in=['onaylandi', 'kismi_tahsil'],
        ).aggregate(kalan=Sum(F('net_tutar') - F('tahsil_edilen')))
        return float(result['kalan'] or 0)

    def get_tahsil_edilen_gelir(self, obj):
        """Tahsil edilmiş gelir toplamı."""
        from django.db.models import Sum
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        result = GelirKaydi.objects.filter(
            cari_hesap=obj,
            durum__in=['onaylandi', 'kismi_tahsil', 'tahsil_edildi'],
        ).aggregate(t=Sum('tahsil_edilen'))
        return float(result['t'] or 0)

    def get_gider_kayit_sayisi(self, obj):
        from apps.finans.domain.gider_kaydi import GiderKaydi
        return GiderKaydi.objects.filter(cari_hesap=obj).exclude(
            durum='iptal'
        ).count()

    def get_gelir_kayit_sayisi(self, obj):
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        return GelirKaydi.objects.filter(cari_hesap=obj).exclude(
            durum='iptal'
        ).count()


class CariHesapCreateSerializer(serializers.Serializer):
    """Oluşturma serializer'ı."""
    unvan = serializers.CharField(max_length=300)
    kisa_ad = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    hesap_turu = serializers.ChoiceField(choices=CariHesapTuru.CHOICES)
    hesap_kodu = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')

    gider_kategorileri = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        default=[],
    )
    gelir_kategorileri = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        default=[],
    )

    vergi_no = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    vergi_dairesi = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')

    telefon = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    adres = serializers.CharField(required=False, allow_blank=True, default='')
    il = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    ilce = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    yetkili_kisi = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    yetkili_telefon = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')

    banka_adi = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    iban = serializers.CharField(max_length=34, required=False, allow_blank=True, default='')
    hesap_sahibi = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')

    notlar = serializers.CharField(required=False, allow_blank=True, default='')


class CariHesapUpdateSerializer(serializers.Serializer):
    """Güncelleme serializer'ı — tüm alanlar opsiyonel."""
    unvan = serializers.CharField(max_length=300, required=False)
    kisa_ad = serializers.CharField(max_length=100, required=False, allow_blank=True)
    hesap_turu = serializers.ChoiceField(choices=CariHesapTuru.CHOICES, required=False)
    hesap_kodu = serializers.CharField(max_length=50, required=False, allow_blank=True)

    gider_kategorileri = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )
    gelir_kategorileri = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
    )

    vergi_no = serializers.CharField(max_length=20, required=False, allow_blank=True)
    vergi_dairesi = serializers.CharField(max_length=100, required=False, allow_blank=True)

    telefon = serializers.CharField(max_length=20, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    adres = serializers.CharField(required=False, allow_blank=True)
    il = serializers.CharField(max_length=50, required=False, allow_blank=True)
    ilce = serializers.CharField(max_length=50, required=False, allow_blank=True)
    yetkili_kisi = serializers.CharField(max_length=200, required=False, allow_blank=True)
    yetkili_telefon = serializers.CharField(max_length=20, required=False, allow_blank=True)

    banka_adi = serializers.CharField(max_length=100, required=False, allow_blank=True)
    iban = serializers.CharField(max_length=34, required=False, allow_blank=True)
    hesap_sahibi = serializers.CharField(max_length=200, required=False, allow_blank=True)

    notlar = serializers.CharField(required=False, allow_blank=True)
    aktif_mi = serializers.BooleanField(required=False)


class CariHesapDropdownSerializer(serializers.ModelSerializer):
    """Dropdown için minimal."""
    gorunen_ad = serializers.CharField(read_only=True)
    gider_kategorileri = serializers.SerializerMethodField()
    gelir_kategorileri = serializers.SerializerMethodField()

    class Meta:
        model = CariHesap
        fields = ['id', 'unvan', 'kisa_ad', 'gorunen_ad', 'hesap_turu', 'gider_kategorileri', 'gelir_kategorileri']

    def get_gider_kategorileri(self, obj):
        return list(obj.gider_kategorileri.values_list('id', flat=True))

    def get_gelir_kategorileri(self, obj):
        return list(obj.gelir_kategorileri.values_list('id', flat=True))


# ─── Cari Hareket Serializers ───────────────────

from apps.finans.application.cari_hareket_enrichment import build_cari_hareket_meta


class CariHareketListSerializer(serializers.ModelSerializer):
    """Cari hareket listesi."""
    cari_hesap_unvan = serializers.CharField(source='cari_hesap.gorunen_ad', read_only=True)
    islem_turu_display = serializers.CharField(source='get_islem_turu_display', read_only=True)
    yon_display = serializers.CharField(source='get_yon_display', read_only=True)
    bakiye_oncesi = serializers.SerializerMethodField()
    bakiye_sonrasi = serializers.SerializerMethodField()
    islem_yapan_adi = serializers.SerializerMethodField()
    kategori_adi = serializers.SerializerMethodField()
    odeme_yontemi_adi = serializers.SerializerMethodField()
    odeme_yontemi_tip = serializers.SerializerMethodField()

    class Meta:
        model = CariHareket
        fields = [
            'id', 'cari_hesap_id', 'cari_hesap_unvan',
            'islem_turu', 'islem_turu_display',
            'yon', 'yon_display', 'tutar',
            'borc_oncesi', 'alacak_oncesi',
            'borc_sonrasi', 'alacak_sonrasi',
            'bakiye_oncesi', 'bakiye_sonrasi',
            'kaynak_tip', 'kaynak_id',
            'kategori_adi', 'odeme_yontemi_adi', 'odeme_yontemi_tip',
            'aciklama', 'belge_no', 'islem_tarihi',
            'islem_yapan_adi',
            'created_at',
        ]

    def _kaynak_meta(self, obj):
        return self.context.get('kaynak_meta', {}).get((obj.kaynak_tip, obj.kaynak_id), {})

    def get_kategori_adi(self, obj):
        return self._kaynak_meta(obj).get('kategori_adi') or None

    def get_odeme_yontemi_adi(self, obj):
        return self._kaynak_meta(obj).get('odeme_yontemi_adi') or None

    def get_odeme_yontemi_tip(self, obj):
        return self._kaynak_meta(obj).get('odeme_yontemi_tip') or None

    def get_bakiye_oncesi(self, obj):
        return obj.borc_oncesi - obj.alacak_oncesi

    def get_bakiye_sonrasi(self, obj):
        return obj.borc_sonrasi - obj.alacak_sonrasi

    def get_islem_yapan_adi(self, obj):
        if obj.islem_yapan:
            return obj.islem_yapan.get_full_name() or obj.islem_yapan.username
        return None
