"""
Mali Hesap Yetkilisi Serializers
Bilgilendirme amaçlı yetkili/sorumlu kişi CRUD işlemleri için.
"""
from rest_framework import serializers

from apps.finans.domain.mali_hesap_yetkilisi import MaliHesapYetkilisi


class MaliHesapYetkilisiSerializer(serializers.ModelSerializer):
    """Liste/detay için — tüm alanlar."""
    personel_ad = serializers.SerializerMethodField()

    class Meta:
        model = MaliHesapYetkilisi
        fields = [
            'id', 'mali_hesap', 'personel', 'personel_ad',
            'ad_soyad', 'rol', 'telefon', 'email', 'notlar',
            'siralama', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_personel_ad(self, obj):
        if obj.personel_id:
            return f'{obj.personel.ad} {obj.personel.soyad}'.strip()
        return None


class MaliHesapYetkilisiCreateSerializer(serializers.Serializer):
    """Create/Update işlemi için input serializer."""
    personel_id = serializers.IntegerField(required=False, allow_null=True)
    ad_soyad = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    rol = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    telefon = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')
    email = serializers.EmailField(required=False, allow_blank=True, default='')
    notlar = serializers.CharField(required=False, allow_blank=True, default='')
    siralama = serializers.IntegerField(default=0, min_value=0)

    def validate(self, attrs):
        if not attrs.get('personel_id') and not (attrs.get('ad_soyad') or '').strip():
            raise serializers.ValidationError(
                {'ad_soyad': 'Personel seçmediyseniz en az bir isim girmelisiniz.'}
            )
        return attrs
