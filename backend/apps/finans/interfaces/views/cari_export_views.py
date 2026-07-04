"""
Cari sekme raporu dışa aktarma — PDF / Excel / CSV (logolu).
"""
from rest_framework import status
from rest_framework.response import Response

from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.application.export.export_service import ExportService
from apps.finans.interfaces.views.expansion_views import _enrich_filters_meta


class CariTabExportView(APIView):
    """
    POST /cari-hesaplar/<pk>/export/
    Body: format, title, columns[{key,label}], rows[], filters_meta{}
    """

    def post(self, request, pk):
        from apps.finans.interfaces.views.cari_hesap_views import _cari_sube_gate

        _, err = _cari_sube_gate(request, pk)
        if err:
            return err

        fmt = (request.data.get('format') or 'csv').lower()
        if fmt not in ExportService.SUPPORTED_FORMATS:
            return Response({'error': f'Desteklenmeyen format: {fmt}'}, status=400)

        columns = request.data.get('columns') or []
        rows = request.data.get('rows') or []
        title = request.data.get('title') or 'Cari Rapor'
        filters_meta = request.data.get('filters_meta') or {}
        if request.user.is_authenticated and not filters_meta.get('raporu_olusturan'):
            filters_meta['raporu_olusturan'] = (
                request.user.get_full_name() or request.user.username
            )
        if 'report_kind' not in filters_meta:
            title_lower = (title or '').lower()
            if 'ekstre' in title_lower:
                filters_meta['report_kind'] = 'cari_ekstre'
            else:
                filters_meta['report_kind'] = 'cari_ozet'
        filters_meta.setdefault('rapor_adi', title)
        filters_meta.setdefault('para_birimi', 'TL')

        kurum_id = filters_meta.get('kurum_id')
        meta = _enrich_filters_meta(filters_meta, kurum_id)
        meta['cari_hesap_id'] = pk

        orientation = ExportService._normalize_orientation(
            request.data.get('orientation') or request.query_params.get('orientation'),
        )

        try:
            result = ExportService.build(
                fmt,
                rows,
                columns,
                title=title,
                filters_meta=meta,
                orientation=orientation,
            )
        except (ValueError, RuntimeError) as exc:
            return Response({'error': str(exc)}, status=400)

        if isinstance(result, dict):
            return Response(result)
        return result
