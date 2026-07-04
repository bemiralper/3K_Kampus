"""
Gelir Kaydı Views — API endpoint'leri
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.gelir_service import GelirService
from apps.finans.application.selectors.gelir_selector import GelirSelector
from apps.finans.interfaces.serializers.gelir_serializer import (
    GelirKaydiListSerializer,
    GelirKaydiDetailSerializer,
    GelirKaydiCreateSerializer,
    GelirKaydiUpdateSerializer,
)


class GelirKaydiListCreateView(APIView):
    """
    GET  → Kuruma ait gelir kayıtları listesi (filtreli)
    POST → Yeni gelir kaydı oluştur
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GelirSelector()

        filtreler = {'sube_id': sube_id}
        if request.query_params.get('durum'):
            filtreler['durum'] = request.query_params['durum']
        if request.query_params.get('cari_hesap_id'):
            filtreler['cari_hesap_id'] = request.query_params['cari_hesap_id']
        if request.query_params.get('kategori_id'):
            filtreler['kategori_id'] = request.query_params['kategori_id']
        if request.query_params.get('odeme_yontemi_id'):
            filtreler['odeme_yontemi_id'] = request.query_params['odeme_yontemi_id']
        if request.query_params.get('baslangic'):
            filtreler['baslangic'] = request.query_params['baslangic']
        if request.query_params.get('bitis'):
            filtreler['bitis'] = request.query_params['bitis']
        if request.query_params.get('arama'):
            filtreler['arama'] = request.query_params['arama'].strip()

        gelirler = selector.list_by_kurum(kurum_id, filtreler=filtreler if filtreler else None)
        serializer = GelirKaydiListSerializer(gelirler, many=True)
        return Response(serializer.data)

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        serializer = GelirKaydiCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        data['kurum_id'] = kurum_id
        data['sube_id'] = sube_id
        data['olusturan'] = request.user if request.user.is_authenticated else None

        service = GelirService()
        gelir, errors = service.create(data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            GelirKaydiDetailSerializer(gelir).data,
            status=status.HTTP_201_CREATED,
        )


class GelirKaydiDetailView(APIView):
    """
    GET    → Gelir kaydı detay
    PUT    → Gelir kaydı güncelle
    DELETE → Gelir kaydı sil (soft delete)
    """

    def get(self, request, pk):
        selector = GelirSelector()
        gelir = selector.get_by_id(pk)
        if not gelir:
            return Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, gelir.kurum_id, gelir.sube_id,
        )
        if err:
            return err

        serializer = GelirKaydiDetailSerializer(gelir)
        return Response(serializer.data)

    def put(self, request, pk):
        selector = GelirSelector()
        gelir = selector.get_by_id(pk)
        if not gelir:
            return Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, gelir.kurum_id, gelir.sube_id,
        )
        if err:
            return err

        serializer = GelirKaydiUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        service = GelirService()
        gelir, errors = service.update(pk, serializer.validated_data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(GelirKaydiDetailSerializer(gelir).data)

    def delete(self, request, pk):
        selector = GelirSelector()
        gelir = selector.get_by_id(pk)
        if not gelir:
            return Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, gelir.kurum_id, gelir.sube_id,
        )
        if err:
            return err

        service = GelirService()
        gelir, errors = service.soft_delete(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Gelir kaydı silindi.'}, status=status.HTTP_200_OK)


class GelirOnaylaView(APIView):
    """POST → Gelir kaydını onayla."""

    def post(self, request, pk):
        selector = GelirSelector()
        gelir = selector.get_by_id(pk)
        if not gelir:
            return Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, gelir.kurum_id, gelir.sube_id,
        )
        if err:
            return err

        service = GelirService()
        gelir, errors = service.onayla(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'detail': 'Gelir kaydı onaylandı.',
            'durum': gelir.durum,
        })


class GelirIptalView(APIView):
    """POST → Gelir kaydını iptal et."""

    def post(self, request, pk):
        selector = GelirSelector()
        gelir = selector.get_by_id(pk)
        if not gelir:
            return Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(
            request, gelir.kurum_id, gelir.sube_id,
        )
        if err:
            return err

        service = GelirService()
        gelir, errors = service.iptal_et(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Gelir kaydı iptal edildi.', 'durum': gelir.durum})


class GelirOzetView(APIView):
    """GET → Dashboard için gelir özet istatistikleri."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GelirSelector()
        egitim_yili_id = request.query_params.get('egitim_yili_id')
        ozet = selector.ozet_istatistikler(
            kurum_id, egitim_yili_id=egitim_yili_id, sube_id=sube_id,
        )
        return Response(ozet)
