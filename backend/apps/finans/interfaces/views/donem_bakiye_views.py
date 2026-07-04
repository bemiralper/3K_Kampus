"""
Dönem Bakiye Views
API endpoint'leri — dönem özeti, kapanış, devir ve yıllar arası karşılaştırma.
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.donem_bakiye_service import DonemBakiyeService
from apps.finans.interfaces.views.sube_context import (
    assert_record_sube_access,
    resolve_mandatory_finans_sube,
)
from apps.finans.application.selectors.donem_bakiye_selector import DonemBakiyeSelector
from apps.finans.interfaces.serializers.donem_bakiye_serializer import (
    DonemBakiyeListSerializer,
    DonemBakiyeDetailSerializer,
)


class DonemBakiyeListView(APIView):
    """
    GET /finans/api/donem-bakiye/?sube_id=X&egitim_yili_id=Y
    veya
    GET /finans/api/donem-bakiye/?kurum_id=X&egitim_yili_id=Y
    Dönem bakiye listesi — şube veya kurum özeti.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        egitim_yili_id = request.query_params.get('egitim_yili_id')

        if not egitim_yili_id:
            return Response(
                {'error': 'egitim_yili_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = DonemBakiyeSelector()
        ozet = selector.get_sube_ozet(sube_id, int(egitim_yili_id))
        return Response(ozet)


class DonemBakiyeDetailView(APIView):
    """
    GET /finans/api/donem-bakiye/<pk>/
    Tek bir dönem bakiye kaydının detayı.
    """

    def get(self, request, pk):
        selector = DonemBakiyeSelector()
        donem = selector.get_by_id(pk)

        if not donem:
            return Response(
                {'error': 'Dönem bakiye kaydı bulunamadı.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        err = assert_record_sube_access(
            request, donem.kurum_id, donem.sube_id, allow_null_sube=True,
        )
        if err:
            return err

        serializer = DonemBakiyeDetailSerializer(donem)
        return Response(serializer.data)


class DonemAcView(APIView):
    """
    POST /finans/api/donem-bakiye/ac/
    Body: { kurum_id, sube_id, egitim_yili_id }
    Şubenin tüm aktif mali hesapları için dönem bakiye kayıtları oluşturur.
    """

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        sube_id = request.data.get('sube_id')
        egitim_yili_id = request.data.get('egitim_yili_id')

        if not all([kurum_id, sube_id, egitim_yili_id]):
            return Response(
                {'error': 'kurum_id, sube_id ve egitim_yili_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DonemBakiyeService()
        try:
            result = service.donem_ac(int(kurum_id), int(sube_id), int(egitim_yili_id))
            return Response(result, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DonemKapatView(APIView):
    """
    POST /finans/api/donem-bakiye/kapat/
    Body: { sube_id, egitim_yili_id, notlar? }
    Şubenin belirli dönemini kapatır.
    """

    def post(self, request):
        sube_id = request.data.get('sube_id')
        egitim_yili_id = request.data.get('egitim_yili_id')
        notlar = request.data.get('notlar', '')

        if not all([sube_id, egitim_yili_id]):
            return Response(
                {'error': 'sube_id ve egitim_yili_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DonemBakiyeService()
        try:
            result = service.donem_kapat(
                sube_id=int(sube_id),
                egitim_yili_id=int(egitim_yili_id),
                kullanici=request.user if request.user.is_authenticated else None,
                notlar=notlar,
            )
            return Response(result)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DonemDevretView(APIView):
    """
    POST /finans/api/donem-bakiye/devret/
    Body: { kurum_id, sube_id, eski_egitim_yili_id, yeni_egitim_yili_id }
    Eski dönem bakiyelerini yeni döneme devreder.
    """

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        sube_id = request.data.get('sube_id')
        eski_yil_id = request.data.get('eski_egitim_yili_id')
        yeni_yil_id = request.data.get('yeni_egitim_yili_id')

        if not all([kurum_id, sube_id, eski_yil_id, yeni_yil_id]):
            return Response(
                {'error': 'kurum_id, sube_id, eski_egitim_yili_id ve yeni_egitim_yili_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DonemBakiyeService()
        try:
            result = service.donem_devret(
                sube_id=int(sube_id),
                eski_egitim_yili_id=int(eski_yil_id),
                yeni_egitim_yili_id=int(yeni_yil_id),
                kurum_id=int(kurum_id),
                kullanici=request.user if request.user.is_authenticated else None,
            )
            return Response(result)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class YillarArasiKarsilastirmaView(APIView):
    """
    GET /finans/api/donem-bakiye/karsilastirma/?kurum_id=X
    Kurum bazında yıllar arası gelir/gider/net kar karşılaştırması.
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')

        if not kurum_id:
            return Response(
                {'error': 'kurum_id parametresi zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selector = DonemBakiyeSelector()
        karsilastirma = selector.get_yillar_arasi_karsilastirma(int(kurum_id))
        return Response({
            'yillar': karsilastirma,
            'toplam_yil': len(karsilastirma),
        })


class BakiyeYenidenHesaplaView(APIView):
    """
    POST /finans/api/donem-bakiye/yeniden-hesapla/
    Body: { mali_hesap_id, egitim_yili_id }
    Tutarsızlık durumunda bakiyeyi hareketlerden yeniden hesaplar.
    """

    def post(self, request):
        mali_hesap_id = request.data.get('mali_hesap_id')
        egitim_yili_id = request.data.get('egitim_yili_id')

        if not all([mali_hesap_id, egitim_yili_id]):
            return Response(
                {'error': 'mali_hesap_id ve egitim_yili_id zorunludur.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = DonemBakiyeService()
        try:
            result = service.bakiye_yeniden_hesapla(int(mali_hesap_id), int(egitim_yili_id))
            return Response(result)
        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
