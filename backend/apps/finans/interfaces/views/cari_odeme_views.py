"""
Cari Ödeme Views — Serbest ödeme (gider bağımsız) API endpoint'leri
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import serializers

from apps.finans.application.cari_odeme_service import CariOdemeService
from apps.finans.interfaces.serializers.islem_masrafi_serializer import IslemMasrafiInputSerializer
from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube


class CariSerbestOdemeSerializer(IslemMasrafiInputSerializer):
    """Serbest ödeme oluşturma validasyonu."""
    cari_hesap_id = serializers.IntegerField()
    kurum_id = serializers.IntegerField()
    tutar = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0.01)
    odeme_tarihi = serializers.DateField()
    mali_hesap_id = serializers.IntegerField()
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    aciklama = serializers.CharField(required=False, allow_blank=True, max_length=500)


class CariSerbestOdemeView(APIView):
    """
    POST → Gider kaydına bağlı olmadan doğrudan cari hesaba ödeme yapar.
    Erken ödeme, avans, serbest ödeme gibi durumlarda kullanılır.
    """

    def post(self, request):
        serializer = CariSerbestOdemeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        kurum_id = data['kurum_id']
        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        data['sube_id'] = sube_id
        data['islem_yapan'] = request.user if request.user.is_authenticated else None

        service = CariOdemeService()
        result, errors = service.serbest_odeme_yap(data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_201_CREATED)


class CariSerbestOdemeIptalView(APIView):
    """POST → Serbest ödemeyi iptal eder (ters kayıtlar oluşturur)."""

    def post(self, request, cari_hareket_id):
        service = CariOdemeService()
        result, errors = service.serbest_odeme_iptal(cari_hareket_id)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)
