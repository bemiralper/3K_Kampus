"""
Gider Kategorisi Serializers
CRUD operasyonları için ayrı serializer'lar.
"""
from rest_framework import serializers

from apps.finans.domain.gider_kategorisi import GiderKategorisi


class GiderKategorisiAltListSerializer(serializers.ModelSerializer):
    """Alt kategori listesi — ana kategori içinde nested gösterim."""

    class Meta:
        model = GiderKategorisi
        fields = [
            'id', 'ad', 'ikon', 'renk', 'aciklama',
            'siralama', 'aktif_mi', 'parent_id',
            'created_at', 'updated_at',
        ]


class GiderKategorisiListSerializer(serializers.ModelSerializer):
    """Liste view'ı için — ana kategoriler + alt kategorileri."""
    alt_kategoriler = GiderKategorisiAltListSerializer(many=True, read_only=True)
    alt_kategori_sayisi = serializers.SerializerMethodField()
    kurum_ad = serializers.CharField(source='kurum.ad', read_only=True)

    class Meta:
        model = GiderKategorisi
        fields = [
            'id', 'ad', 'ikon', 'renk', 'aciklama',
            'siralama', 'aktif_mi', 'kurum_ad',
            'alt_kategoriler', 'alt_kategori_sayisi',
            'created_at', 'updated_at',
        ]

    def get_alt_kategori_sayisi(self, obj):
        if hasattr(obj, '_alt_kategori_count'):
            return obj._alt_kategori_count
        return obj.alt_kategoriler.filter(silindi_mi=False).count()


class GiderKategorisiDetailSerializer(serializers.ModelSerializer):
    """Detay view'ı için — tüm alanlar."""
    parent_ad = serializers.CharField(source='parent.ad', read_only=True, default=None)
    kurum_ad = serializers.CharField(source='kurum.ad', read_only=True)

    class Meta:
        model = GiderKategorisi
        fields = [
            'id', 'kurum', 'kurum_ad', 'parent', 'parent_ad',
            'ad', 'ikon', 'renk', 'aciklama',
            'siralama', 'aktif_mi',
            'silindi_mi', 'silinme_tarihi',
            'created_at', 'updated_at',
        ]


class GiderKategorisiCreateSerializer(serializers.Serializer):
    """Create işlemi için input serializer."""
    sube_id = serializers.IntegerField(required=True)
    ad = serializers.CharField(max_length=150)
    parent_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    ikon = serializers.CharField(max_length=10, required=False, allow_blank=True, default='')
    renk = serializers.CharField(max_length=7, required=False, allow_blank=True, default='')
    aciklama = serializers.CharField(required=False, allow_blank=True, default='', allow_null=True)
    siralama = serializers.IntegerField(default=0, min_value=0)
    aktif_mi = serializers.BooleanField(default=True)


class GiderKategorisiUpdateSerializer(serializers.Serializer):
    """Update işlemi için input serializer — tüm alanlar optional."""
    ad = serializers.CharField(max_length=150, required=False)
    ikon = serializers.CharField(max_length=10, required=False, allow_blank=True)
    renk = serializers.CharField(max_length=7, required=False, allow_blank=True)
    aciklama = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    siralama = serializers.IntegerField(required=False, min_value=0)
    aktif_mi = serializers.BooleanField(required=False)
