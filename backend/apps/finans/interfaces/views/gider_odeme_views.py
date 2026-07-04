"""
Gider Ödeme Views — API endpoint'leri
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.selectors.gider_selector import GiderSelector
from apps.finans.interfaces.serializers.gider_odeme_serializer import (
    GiderOdemeListSerializer,
    GiderOdemeCreateSerializer,
)
from apps.finans.interfaces.views.sube_context import assert_record_sube_access


def _assert_gider_sube_access(request, gider_id):
    selector = GiderSelector()
    gider = selector.get_by_id(gider_id)
    if not gider:
        return None, Response({'error': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id, allow_null_sube=True)
    if err:
        return None, err
    return gider, None


class GiderOdemeListCreateView(APIView):
    """
    GET  → Bir gider kaydının ödeme listesi
    POST → Yeni ödeme yap
    """

    def get(self, request, gider_id):
        gider, err = _assert_gider_sube_access(request, gider_id)
        if err:
            return err

        selector = GiderSelector()
        odemeler = selector.odemeler(gider_id)
        serializer = GiderOdemeListSerializer(odemeler, many=True)
        return Response(serializer.data)

    def post(self, request, gider_id):
        gider, err = _assert_gider_sube_access(request, gider_id)
        if err:
            return err

        serializer = GiderOdemeCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        data['gider_kaydi_id'] = gider_id
        data['islem_yapan'] = request.user if request.user.is_authenticated else None

        service = GiderOdemeService()
        odeme, errors = service.odeme_yap(data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            GiderOdemeListSerializer(odeme).data,
            status=status.HTTP_201_CREATED,
        )


class GiderOdemeIptalView(APIView):
    """POST → Ödemeyi iptal et."""

    def post(self, request, pk):
        service = GiderOdemeService()
        odeme, errors = service.odeme_iptal(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'detail': 'Ödeme iptal edildi.',
            'durum': odeme.durum,
        })


class SonOdemelerView(APIView):
    """GET → Son yapılan ödemeleri listeler."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GiderSelector()
        limit = int(request.query_params.get('limit', 10))
        cari_hesap_id = request.query_params.get('cari_hesap_id')
        odemeler = selector.son_odemeler(kurum_id, limit=limit, cari_hesap_id=cari_hesap_id, sube_id=sube_id)
        serializer = GiderOdemeListSerializer(odemeler, many=True)
        return Response(serializer.data)
