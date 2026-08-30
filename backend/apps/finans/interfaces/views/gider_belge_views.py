"""
Gider detay, sistem belgeleri (PDF) ve ekli fatura/fiş uçları.
"""
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.finans.application.gider_belge_service import (
    ek_sil,
    ek_yukle,
    gider_islem_belgesi,
    list_ekler,
    odeme_belgesi,
    odeme_plani_belgesi,
    serialize_ek,
)
from apps.finans.application.gider_v2.gider_query_service import GiderQueryService
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.gider_v2_views import _gate
from apps.finans.interfaces.views.sube_context import assert_record_sube_access


def _fmt(request):
    raw = (request.query_params.get('fmt') or 'pdf').lower()
    return 'html' if raw == 'html' else 'pdf'


class GiderV2DetayView(APIView):
    def get(self, request, pk):
        gider = (
            GiderKaydi.objects.select_related(
                'cari_hesap', 'gider_kategorisi', 'maliyet_merkezi', 'proje',
                'odeme_yontemi', 'olusturan', 'mali_hesap', 'sube', 'kurum',
            ).prefetch_related(
                'etiketler', 'taksitler', 'taksitler__odeme_yontemi',
                'taksitler__mali_hesap', 'odemeler', 'ekli_belgeler',
            ).filter(pk=pk).first()
        )
        if not gider:
            return Response({'detail': 'Gider kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        err = assert_record_sube_access(request, gider.kurum_id, gider.sube_id, allow_null_sube=True)
        if err:
            return err
        return Response(GiderQueryService.serialize_detail(gider))


class GiderV2IslemBelgesiView(APIView):
    def get(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        try:
            return gider_islem_belgesi(gider, fmt=_fmt(request))
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GiderV2OdemePlaniBelgesiView(APIView):
    def get(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        try:
            return odeme_plani_belgesi(gider, fmt=_fmt(request))
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GiderV2OdemeBelgesiView(APIView):
    def get(self, request, pk, odeme_id):
        gider, err = _gate(request, pk)
        if err:
            return err
        odeme = GiderOdeme.objects.select_related(
            'odeme_yontemi', 'mali_hesap', 'gider_taksit', 'islem_yapan',
        ).filter(pk=odeme_id, gider_kaydi=gider).first()
        if not odeme:
            return Response({'detail': 'Ödeme bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        result, errors = odeme_belgesi(gider, odeme, fmt=_fmt(request))
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return result


class GiderV2EklerView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        return Response(list_ekler(gider))

    def post(self, request, pk):
        gider, err = _gate(request, pk)
        if err:
            return err
        dosya = request.FILES.get('dosya')
        if not dosya:
            return Response({'error': 'Dosya seçilmedi.'}, status=status.HTTP_400_BAD_REQUEST)
        aciklama = request.data.get('aciklama') or ''
        dosya_turu = request.data.get('dosya_turu') or 'fatura_fis'
        obj, errors = ek_yukle(
            gider, dosya,
            yukleyen=request.user if request.user.is_authenticated else None,
            aciklama=aciklama,
            dosya_turu=dosya_turu,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_ek(obj), status=status.HTTP_201_CREATED)


class GiderV2EkSilView(APIView):
    def delete(self, request, pk, ek_id):
        gider, err = _gate(request, pk)
        if err:
            return err
        _, errors = ek_sil(gider, ek_id)
        if errors:
            return Response(errors, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Ekli belge silindi.'})
