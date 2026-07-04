"""
İşlem masrafı serializer alanları — tahsilat/ödeme create serializer'larında paylaşılır.
"""
from rest_framework import serializers

from apps.finans.constants.kesinti_types import KesintiTuru


class IslemMasrafiInputSerializer(serializers.Serializer):
    """Opsiyonel işlem masrafı alanları."""
    kesinti_turu = serializers.ChoiceField(
        choices=KesintiTuru.CHOICES,
        required=False,
        allow_blank=True,
        allow_null=True,
    )
    kesinti_tutar = serializers.DecimalField(
        max_digits=15,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    kesinti_aciklama = serializers.CharField(
        required=False,
        allow_blank=True,
        default='',
    )
