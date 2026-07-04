"""
Gelir Tahsilat Views — API endpoint'leri
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.selectors.gelir_selector import GelirSelector
from apps.finans.infrastructure.gelir_tahsilat_repository import GelirTahsilatRepository
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.interfaces.serializers.gelir_tahsilat_serializer import (
    GelirTahsilatListSerializer,
    GelirTahsilatCreateSerializer,
)


def _gelir_sube_gate(request, gelir_id):
    selector = GelirSelector()
    gelir = selector.get_by_id(gelir_id)
    if not gelir:
        return None, Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

    from apps.finans.interfaces.views.sube_context import assert_record_sube_access

    err = assert_record_sube_access(
        request, gelir.kurum_id, gelir.sube_id,
    )
    if err:
        return None, err
    return gelir, None


class GelirTahsilatListCreateView(APIView):
    """
    GET  → Bir gelir kaydının tahsilat listesi
    POST → Yeni tahsilat yap
    """

    def get(self, request, gelir_id):
        _, err = _gelir_sube_gate(request, gelir_id)
        if err:
            return err

        tahsilatlar = GelirTahsilatRepository.get_by_gelir(gelir_id)
        serializer = GelirTahsilatListSerializer(tahsilatlar, many=True)
        return Response(serializer.data)

    def post(self, request, gelir_id):
        _, err = _gelir_sube_gate(request, gelir_id)
        if err:
            return err

        serializer = GelirTahsilatCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        data['gelir_kaydi_id'] = gelir_id
        data['islem_yapan'] = request.user if request.user.is_authenticated else None

        service = GelirTahsilatService()
        tahsilat, errors = service.tahsilat_yap(data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            GelirTahsilatListSerializer(tahsilat).data,
            status=status.HTTP_201_CREATED,
        )


class GelirTahsilatIptalView(APIView):
    """POST → Tahsilatı iptal et."""

    def post(self, request, pk):
        try:
            tahsilat = GelirTahsilat.objects.select_related('gelir_kaydi').get(pk=pk)
        except GelirTahsilat.DoesNotExist:
            return Response({'detail': 'Tahsilat bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        gelir = tahsilat.gelir_kaydi
        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, gelir.kurum_id, gelir.sube_id,
        )
        if err:
            return err

        service = GelirTahsilatService()
        tahsilat, errors = service.tahsilat_iptal(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'detail': 'Tahsilat iptal edildi.',
            'durum': tahsilat.durum,
        })
