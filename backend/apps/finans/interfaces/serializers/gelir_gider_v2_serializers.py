"""
Gelir & Gider v2 — DRF serializer'ları (DTO).

Yalnızca giriş doğrulaması yapar; iş kuralları servis katmanındadır.
"""
from rest_framework import serializers

from apps.finans.constants.gider_types import KdvOrani

KDV_MOD_CHOICES = ['haric', 'dahil', 'muaf']


class _EtiketMixin(serializers.Serializer):
    etiket_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, allow_empty=True,
    )


class GelirV2CreateSerializer(_EtiketMixin):
    cari_hesap_id = serializers.IntegerField()
    gelir_kategorisi_id = serializers.IntegerField()
    gelir_kaynagi_id = serializers.IntegerField(required=False, allow_null=True)
    proje_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    egitim_yili_id = serializers.IntegerField(required=False, allow_null=True)
    fatura_no = serializers.CharField(required=False, allow_blank=True, max_length=50)
    fatura_tarihi = serializers.DateField()
    vade_tarihi = serializers.DateField()
    aciklama = serializers.CharField(required=False, allow_blank=True)
    brut_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=0)
    kdv_orani = serializers.ChoiceField(choices=KdvOrani.CHOICES, default=KdvOrani.YIRMI)
    kdv_mod = serializers.ChoiceField(choices=KDV_MOD_CHOICES, default='haric', required=False)


class GelirV2UpdateSerializer(_EtiketMixin):
    cari_hesap_id = serializers.IntegerField(required=False)
    gelir_kategorisi_id = serializers.IntegerField(required=False)
    gelir_kaynagi_id = serializers.IntegerField(required=False, allow_null=True)
    proje_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    fatura_no = serializers.CharField(required=False, allow_blank=True, max_length=50)
    fatura_tarihi = serializers.DateField(required=False)
    vade_tarihi = serializers.DateField(required=False)
    aciklama = serializers.CharField(required=False, allow_blank=True)
    brut_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=0, required=False)
    kdv_orani = serializers.ChoiceField(choices=KdvOrani.CHOICES, required=False)
    kdv_mod = serializers.ChoiceField(choices=KDV_MOD_CHOICES, required=False)


class GiderV2CreateSerializer(_EtiketMixin):
    cari_hesap_id = serializers.IntegerField()
    gider_kategorisi_id = serializers.IntegerField()
    maliyet_merkezi_id = serializers.IntegerField(required=False, allow_null=True)
    proje_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    egitim_yili_id = serializers.IntegerField(required=False, allow_null=True)
    fatura_no = serializers.CharField(required=False, allow_blank=True, max_length=50)
    fatura_tarihi = serializers.DateField()
    vade_tarihi = serializers.DateField()
    aciklama = serializers.CharField(required=False, allow_blank=True)
    brut_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=0)
    kdv_orani = serializers.ChoiceField(choices=KdvOrani.CHOICES, default=KdvOrani.YIRMI)
    kdv_mod = serializers.ChoiceField(choices=KDV_MOD_CHOICES, default='haric', required=False)
    taksit_sayisi = serializers.IntegerField(required=False, min_value=1, max_value=60, default=1)
    taksit_plani = serializers.JSONField(required=False, allow_null=True)


class GiderV2UpdateSerializer(_EtiketMixin):
    cari_hesap_id = serializers.IntegerField(required=False)
    gider_kategorisi_id = serializers.IntegerField(required=False)
    maliyet_merkezi_id = serializers.IntegerField(required=False, allow_null=True)
    proje_id = serializers.IntegerField(required=False, allow_null=True)
    mali_hesap_id = serializers.IntegerField(required=False, allow_null=True)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    fatura_no = serializers.CharField(required=False, allow_blank=True, max_length=50)
    fatura_tarihi = serializers.DateField(required=False)
    vade_tarihi = serializers.DateField(required=False)
    aciklama = serializers.CharField(required=False, allow_blank=True)
    brut_tutar = serializers.DecimalField(max_digits=15, decimal_places=2, min_value=0, required=False)
    kdv_orani = serializers.ChoiceField(choices=KdvOrani.CHOICES, required=False)
    kdv_mod = serializers.ChoiceField(choices=KDV_MOD_CHOICES, required=False)
    taksit_sayisi = serializers.IntegerField(required=False, min_value=1, max_value=60)
    taksit_plani = serializers.JSONField(required=False, allow_null=True)
