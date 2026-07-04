"""
Gider Kaydı Views — API endpoint'leri
"""
import logging
import traceback

from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.gider_service import GiderService

logger = logging.getLogger(__name__)
from apps.finans.application.selectors.gider_selector import GiderSelector
from apps.finans.interfaces.serializers.gider_serializer import (
    GiderKaydiListSerializer,
    GiderKaydiDetailSerializer,
    GiderKaydiCreateSerializer,
    GiderKaydiUpdateSerializer,
    GiderTaksitListSerializer,
)


class GiderKaydiListCreateView(APIView):
    """
    GET  → Kuruma ait gider kayıtları listesi (filtreli)
    POST → Yeni gider kaydı oluştur
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GiderSelector()

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

        giderler = selector.list_by_kurum(kurum_id, filtreler=filtreler if filtreler else None)
        serializer = GiderKaydiListSerializer(giderler, many=True)
        return Response(serializer.data)

    def post(self, request):
        kurum_id = request.data.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = GiderKaydiCreateSerializer(data=request.data)
        if not serializer.is_valid():
            logger.error("GiderKaydi serializer hataları: %s", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        data['kurum_id'] = kurum_id
        data['olusturan'] = request.user if request.user.is_authenticated else None

        service = GiderService()
        try:
            gider, errors = service.create(data)
        except Exception as exc:
            logger.exception("GiderKaydi create hatası: %s", exc)
            return Response(
                {'error': f'Gider oluşturulurken hata: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            GiderKaydiDetailSerializer(gider).data,
            status=status.HTTP_201_CREATED,
        )


class GiderKaydiDetailView(APIView):
    """
    GET    → Gider kaydı detay (taksitler dahil)
    PUT    → Gider kaydı güncelle
    DELETE → Gider kaydı sil (soft delete)
    """

    def get(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        serializer = GiderKaydiDetailSerializer(gider)
        return Response(serializer.data)

    def put(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        serializer = GiderKaydiUpdateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        service = GiderService()
        gider, errors = service.update(pk, serializer.validated_data)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response(GiderKaydiDetailSerializer(gider).data)

    def delete(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        service = GiderService()
        gider, errors = service.soft_delete(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Gider kaydı silindi.'}, status=status.HTTP_200_OK)


class GiderOnayaGonderView(APIView):
    """POST → Gider kaydını onaya gönder."""

    def post(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        service = GiderService()
        gider, errors = service.onaya_gonder(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Gider kaydı onaya gönderildi.', 'durum': gider.durum})


class GiderOnaylaView(APIView):
    """POST → Gider kaydını onayla + taksit planı oluştur."""

    def post(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        service = GiderService()
        onaylayan = request.user if request.user.is_authenticated else None
        gider, errors = service.onayla(pk, onaylayan_user=onaylayan)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'detail': 'Gider kaydı onaylandı ve taksit planı oluşturuldu.',
            'durum': gider.durum,
            'taksit_sayisi': gider.taksit_sayisi,
        })


class GiderIptalView(APIView):
    """POST → Gider kaydını iptal et."""

    def post(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        service = GiderService()
        gider, errors = service.iptal_et(pk)

        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)

        return Response({'detail': 'Gider kaydı iptal edildi.', 'durum': gider.durum})


class GiderTaksitListView(APIView):
    """GET → Bir gider kaydının taksitlerini listeler."""

    def get(self, request, pk):
        selector = GiderSelector()
        gider = selector.get_by_id(pk)
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.finans.interfaces.views.sube_context import assert_record_sube_access

        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id)
        if err:
            return err

        taksitler = selector.taksitler(pk)
        serializer = GiderTaksitListSerializer(taksitler, many=True)
        return Response(serializer.data)


class GiderOzetView(APIView):
    """GET → Dashboard için gider özet istatistikleri."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GiderSelector()

        egitim_yili_id = request.query_params.get('egitim_yili_id')
        ozet = selector.ozet_istatistikler(
            kurum_id, egitim_yili_id=egitim_yili_id, sube_id=sube_id,
        )

        return Response(ozet)


class GecikenTaksitlerView(APIView):
    """GET → Vadesi geçmiş taksitler."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GiderSelector()
        taksitler = selector.geciken_taksitler(kurum_id, sube_id=sube_id)
        serializer = GiderTaksitListSerializer(taksitler, many=True)
        return Response(serializer.data)


class YaklasanVadelerView(APIView):
    """GET → Yaklaşan vadeli taksitler."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        selector = GiderSelector()
        gun = int(request.query_params.get('gun', 7))
        odeme_yontemi_tipi = request.query_params.get('odeme_yontemi_tipi') or None
        taksitler = selector.yaklasan_vadeler(
            kurum_id, gun=gun, odeme_yontemi_tipi=odeme_yontemi_tipi, sube_id=sube_id,
        )
        serializer = GiderTaksitListSerializer(taksitler, many=True)
        return Response(serializer.data)
