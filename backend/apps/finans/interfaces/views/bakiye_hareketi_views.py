"""
Bakiye Hareketi Views
API endpoint'leri — hareket listeleme ve detay.
Hareketler immutable olduğu için create/update/delete endpoint yok.
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.selectors.bakiye_hareketi_selector import BakiyeHareketiSelector
from apps.finans.interfaces.serializers.bakiye_hareketi_serializer import (
    BakiyeHareketiListSerializer,
    BakiyeHareketiDetailSerializer,
)
from apps.finans.interfaces.views.sube_context import (
    assert_record_sube_access,
    resolve_mandatory_finans_sube,
)


def _assert_mali_hesap_sube_access(request, mali_hesap_id):
    from apps.finans.domain.financial_account import MaliHesap

    mali_hesap = (
        MaliHesap.objects.filter(id=mali_hesap_id, silindi_mi=False)
        .select_related('sube')
        .first()
    )
    if not mali_hesap:
        return Response({'error': 'Mali hesap bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
    return assert_record_sube_access(request, mali_hesap.sube.kurum_id, mali_hesap.sube_id)


class BakiyeHareketiListView(APIView):
    """
    GET /finans/api/bakiye-hareketleri/?mali_hesap_id=X&egitim_yili_id=Y
    Mali hesaba ait bakiye hareketlerini listeler.
    Opsiyonel: kurum_id, sube_id ile filtre.
    """

    def get(self, request):
        mali_hesap_id = request.query_params.get('mali_hesap_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')
        kurum_id = request.query_params.get('kurum_id')
        sube_id = request.query_params.get('sube_id')

        selector = BakiyeHareketiSelector()

        if mali_hesap_id:
            err = _assert_mali_hesap_sube_access(request, int(mali_hesap_id))
            if err:
                return err
            hareketler = selector.get_by_mali_hesap(
                int(mali_hesap_id),
                int(egitim_yili_id) if egitim_yili_id else None,
            )
        elif sube_id or kurum_id:
            if not kurum_id:
                return Response(
                    {'error': 'kurum_id parametresi zorunludur.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            resolved_sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
            if err:
                return err
            hareketler = selector.get_by_sube(
                resolved_sube_id,
                int(egitim_yili_id) if egitim_yili_id else None,
            )
        else:
            return Response(
                {'error': 'mali_hesap_id, sube_id veya kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Sayfalama: son 100 hareket
        limit = int(request.query_params.get('limit', 100))
        hareketler = hareketler[:limit]

        serializer = BakiyeHareketiListSerializer(hareketler, many=True)
        return Response({
            'hareketler': serializer.data,
            'toplam': len(serializer.data),
        })


class BakiyeHareketiDetailView(APIView):
    """
    GET /finans/api/bakiye-hareketleri/<pk>/
    Tek bir hareketin detayı.
    """

    def get(self, request, pk):
        selector = BakiyeHareketiSelector()
        hareket = selector.get_by_id(pk)

        if not hareket:
            return Response(
                {'error': 'Hareket bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        err = assert_record_sube_access(request, hareket.kurum_id, hareket.sube_id)
        if err:
            return err

        serializer = BakiyeHareketiDetailSerializer(hareket)
        return Response(serializer.data)


class BakiyeHareketiOzetView(APIView):
    """
    GET /finans/api/bakiye-hareketleri/ozet/?mali_hesap_id=X&egitim_yili_id=Y
    Mali hesabın dönem özeti: toplam giriş, çıkış, net, hareket sayısı.
    """

    def get(self, request):
        mali_hesap_id = request.query_params.get('mali_hesap_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not mali_hesap_id or not egitim_yili_id:
            return Response(
                {'error': 'mali_hesap_id ve egitim_yili_id parametreleri zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        err = _assert_mali_hesap_sube_access(request, int(mali_hesap_id))
        if err:
            return err

        selector = BakiyeHareketiSelector()
        ozet = selector.get_ozet(int(mali_hesap_id), int(egitim_yili_id))
        return Response(ozet)
