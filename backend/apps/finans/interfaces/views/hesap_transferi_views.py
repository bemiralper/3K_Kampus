"""
Hesap Transferi Views — Kasa/Banka arası virman ve transfer API endpoint'leri
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import serializers

from apps.finans.application.hesap_transferi_service import HesapTransferiService
from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube


class HesapTransferiCreateSerializer(serializers.Serializer):
    """Transfer oluşturma validasyonu."""
    kaynak_hesap_id = serializers.IntegerField()
    hedef_hesap_id = serializers.IntegerField()
    tutar = serializers.IntegerField(min_value=1)
    transfer_tarihi = serializers.DateField()
    transfer_turu = serializers.CharField(required=False, allow_blank=True)
    egitim_yili_id = serializers.IntegerField(required=False, allow_null=True)
    aciklama = serializers.CharField(required=False, allow_blank=True, max_length=500)
    odeme_yontemi_id = serializers.IntegerField(required=False, allow_null=True)
    kesinti_turu = serializers.CharField(required=False, allow_blank=True)
    kesinti_tutar = serializers.DecimalField(
        required=False, allow_null=True, max_digits=15, decimal_places=2,
    )
    kesinti_aciklama = serializers.CharField(required=False, allow_blank=True, max_length=500)
    islem_masrafi = serializers.DictField(required=False)


def _serialize_transfer(t):
    return {
        'id': t.id,
        'kaynak_hesap': {'id': t.kaynak_hesap_id, 'ad': t.kaynak_hesap.ad if t.kaynak_hesap_id else ''},
        'hedef_hesap': {'id': t.hedef_hesap_id, 'ad': t.hedef_hesap.ad if t.hedef_hesap_id else ''},
        'tutar': int(t.tutar),
        'transfer_turu': t.transfer_turu,
        'transfer_turu_label': t.get_transfer_turu_display(),
        'transfer_tarihi': str(t.transfer_tarihi),
        'aciklama': t.aciklama or '',
        'islem_yapan': t.islem_yapan.get_full_name() if t.islem_yapan else None,
        'created_at': t.created_at.isoformat() if t.created_at else None,
    }


class HesapTransferiListCreateView(APIView):
    """
    GET  → Kuruma ait transfer listesi (filtreli)
    POST → Yeni transfer / virman oluştur
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        filtreler = {}
        for key in ('mali_hesap_id', 'transfer_turu', 'baslangic', 'bitis'):
            val = request.query_params.get(key)
            if val:
                filtreler[key] = val

        service = HesapTransferiService()
        transferler = service.get_all(
            kurum_id,
            sube_id=sube_id,
            egitim_yili_id=request.query_params.get('egitim_yili_id'),
            filters=filtreler if filtreler else None,
        )
        return Response([_serialize_transfer(t) for t in transferler])

    def post(self, request):
        serializer = HesapTransferiCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        service = HesapTransferiService()
        transfer, errors = service.transfer_yap(
            data,
            user=request.user if request.user.is_authenticated else None,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(_serialize_transfer(transfer), status=status.HTTP_201_CREATED)
