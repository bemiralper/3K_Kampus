"""
Cari v2 — Giriş/çıkış serializer'ları.
Mevcut CariHesap detay serializer'ını genişletir; yeni alanları
(kategori, risk_limiti, vade, etiketler, açılış bakiyesi) ekler.
"""
from rest_framework import serializers

from apps.finans.constants.cari_types import CariHareketYonu, CariHesapTuru
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.interfaces.serializers.cari_hesap_serializer import (
    CariHesapDetailSerializer,
)


class CariV2DetailSerializer(CariHesapDetailSerializer):
    """Detay + v2 alanları."""
    etiketler = serializers.SerializerMethodField()
    acik_borc = serializers.SerializerMethodField()
    acik_alacak = serializers.SerializerMethodField()

    class Meta(CariHesapDetailSerializer.Meta):
        fields = CariHesapDetailSerializer.Meta.fields + [
            'kategori', 'risk_limiti', 'varsayilan_vade_gun', 'para_birimi',
            'etiketler', 'acik_borc', 'acik_alacak',
        ]

    def get_etiketler(self, obj):
        return [
            {'id': e.id, 'ad': e.ad, 'renk': e.renk}
            for e in obj.etiketler.all()
        ]

    def get_acik_borc(self, obj):
        return float(obj.acik_borc)

    def get_acik_alacak(self, obj):
        return float(obj.acik_alacak)


class CariV2CreateSerializer(serializers.Serializer):
    unvan = serializers.CharField(max_length=300)
    kisa_ad = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    hesap_turu = serializers.ChoiceField(choices=CariHesapTuru.CHOICES)
    hesap_kodu = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')

    kategori = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    risk_limiti = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, default=0,
    )
    varsayilan_vade_gun = serializers.IntegerField(required=False, default=0, min_value=0)
    para_birimi = serializers.CharField(max_length=3, required=False, default='TRY')

    gider_kategorileri = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True, default=[],
    )
    gelir_kategorileri = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True, default=[],
    )
    etiketler = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True, default=[],
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

    # Açılış bakiyesi (opsiyonel)
    acilis_bakiye = serializers.DecimalField(
        max_digits=15, decimal_places=2, required=False, default=0,
    )
    acilis_yon = serializers.ChoiceField(
        choices=CariHareketYonu.CHOICES, required=False, default=CariHareketYonu.BORC,
    )


class CariV2UpdateSerializer(serializers.Serializer):
    unvan = serializers.CharField(max_length=300, required=False)
    kisa_ad = serializers.CharField(max_length=100, required=False, allow_blank=True)
    hesap_turu = serializers.ChoiceField(choices=CariHesapTuru.CHOICES, required=False)
    hesap_kodu = serializers.CharField(max_length=50, required=False, allow_blank=True)

    kategori = serializers.CharField(max_length=100, required=False, allow_blank=True)
    risk_limiti = serializers.DecimalField(max_digits=15, decimal_places=2, required=False)
    varsayilan_vade_gun = serializers.IntegerField(required=False, min_value=0)
    para_birimi = serializers.CharField(max_length=3, required=False)

    gider_kategorileri = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
    )
    gelir_kategorileri = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
    )
    etiketler = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
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
