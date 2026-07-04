"""
Para Hareketleri View — tüm kasa/banka hareketlerinin (tahsilat, ödeme,
iade, transfer) birleşik, filtreli ve sayfalı listesi.
"""
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from rest_framework.response import Response
from rest_framework import status

from apps.finans.application.selectors.para_hareketi_selector import ParaHareketiSelector


class ParaHareketleriListView(APIView):
    """
    GET /finans/api/para-hareketleri/?kurum_id=X
    Filtreler: sube_id, egitim_yili_id, baslangic, bitis, kaynak, yon,
               mali_hesap_id, islem_yapan_id, arama, page, page_size
    """

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        filtreler = {}
        for key in ('baslangic', 'bitis', 'kaynak', 'yon', 'mali_hesap_id', 'islem_yapan_id', 'arama'):
            val = request.query_params.get(key)
            if val:
                filtreler[key] = val

        selector = ParaHareketiSelector()
        data = selector.list(
            kurum_id,
            sube_id=sube_id,
            egitim_yili_id=request.query_params.get('egitim_yili_id'),
            filters=filtreler if filtreler else None,
            page=request.query_params.get('page', 1),
            page_size=request.query_params.get('page_size', 50),
        )
        return Response(data)
