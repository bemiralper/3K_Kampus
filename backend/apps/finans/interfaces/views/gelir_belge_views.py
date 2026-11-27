"""
Gelir detay, sistem belgeleri (PDF/HTML) ve ekli fatura/dekont uçları.
"""
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.finans.application.gelir_belge_service import (
    gelir_ek_sil,
    gelir_ek_yukle,
    gelir_islem_belgesi,
    list_gelir_ekler,
    serialize_gelir_ek,
    tahsilat_makbuzu_belgesi,
)
from apps.finans.application.gelir_v2.gelir_query_service import GelirQueryService
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.gelir_v2_views import _gate
from apps.finans.interfaces.views.sube_context import assert_record_sube_access


def _fmt(request):
    raw = (request.query_params.get('fmt') or 'pdf').lower()
    return 'html' if raw == 'html' else 'pdf'


class GelirV2DetayView(APIView):
    def get(self, request, pk):
        gelir = (
            GelirKaydi.objects.select_related(
                'cari_hesap', 'gelir_kategorisi', 'gelir_kaynagi', 'proje',
                'odeme_yontemi', 'olusturan', 'mali_hesap', 'sube', 'kurum',
            ).prefetch_related('etiketler', 'tahsilatlar').filter(pk=pk).first()
        )
        if not gelir:
            return Response({'detail': 'Gelir kaydı bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        err = assert_record_sube_access(request, gelir.kurum_id, gelir.sube_id, allow_null_sube=True)
        if err:
            return err
        return Response(GelirQueryService.serialize_detail(gelir))


class GelirV2IslemBelgesiView(APIView):
    def get(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        try:
            return gelir_islem_belgesi(gelir, fmt=_fmt(request))
        except Exception as exc:
            return Response({'error': str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GelirV2TahsilatBelgesiView(APIView):
    def get(self, request, pk, tahsilat_id):
        gelir, err = _gate(request, pk)
        if err:
            return err
        tahsilat = GelirTahsilat.objects.select_related(
            'odeme_yontemi', 'mali_hesap', 'islem_yapan',
        ).filter(pk=tahsilat_id, gelir_kaydi=gelir).first()
        if not tahsilat:
            return Response({'detail': 'Tahsilat bulunamadı.'}, status=status.HTTP_404_NOT_FOUND)
        result, errors = tahsilat_makbuzu_belgesi(gelir, tahsilat, fmt=_fmt(request))
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return result


class GelirV2EklerView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        return Response(list_gelir_ekler(gelir))

    def post(self, request, pk):
        gelir, err = _gate(request, pk)
        if err:
            return err
        dosya = request.FILES.get('dosya')
        if not dosya:
            return Response({'error': 'Dosya seçilmedi.'}, status=status.HTTP_400_BAD_REQUEST)
        aciklama = request.data.get('aciklama') or ''
        dosya_turu = request.data.get('dosya_turu') or 'fatura'
        obj, errors = gelir_ek_yukle(
            gelir, dosya,
            yukleyen=request.user if request.user.is_authenticated else None,
            aciklama=aciklama,
            dosya_turu=dosya_turu,
        )
        if errors:
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        return Response(serialize_gelir_ek(obj, gelir.pk), status=status.HTTP_201_CREATED)


class GelirV2EkSilView(APIView):
    def delete(self, request, pk, ek_id):
        gelir, err = _gate(request, pk)
        if err:
            return err
        _, errors = gelir_ek_sil(gelir, ek_id)
        if errors:
            return Response(errors, status=status.HTTP_404_NOT_FOUND)
        return Response({'detail': 'Ekli belge silindi.'})
