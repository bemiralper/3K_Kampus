"""DRF ViewSet action'larında ?format=xlsx / ?format=csv desteği için yardımcı renderer'lar.

DRF'nin `DefaultContentNegotiation.filter_renderers()` metodu, `?format=<x>` query
parametresi geldiğinde view'ın `renderer_classes` listesinde `.format == <x>` olan bir
renderer bulamazsa `Http404` fırlatır (view metodu hiç çalıştırılmadan, `initial()`
içinde). Bizim export action'larımız ise `request.query_params.get('format')`'u kendi
mantığıyla okuyup düz bir `HttpResponse` (xlsx/csv) döndürüyor; DRF'nin renderer
pipeline'ı bu response'u hiç işlemiyor (HttpResponseBase override).

Bu yüzden bu renderer'ların `render()` metodu asla çağrılmaz — sadece content
negotiation'ın 404 fırlatmasını önlemek için `renderer_classes` listesine eklenmeleri
yeterlidir.

Kullanım:

    from rest_framework.renderers import JSONRenderer
    from shared.export.drf_renderers import XlsxRenderer, CsvRenderer

    @action(detail=False, methods=['get'], renderer_classes=[JSONRenderer, XlsxRenderer, CsvRenderer])
    def export(self, request):
        ...
"""
from rest_framework.renderers import BaseRenderer


class XlsxRenderer(BaseRenderer):
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    format = "xlsx"
    charset = None
    render_style = "binary"

    def render(self, data, accepted_media_type=None, renderer_context=None):  # pragma: no cover
        return data


class CsvRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):  # pragma: no cover
        return data


EXPORT_RENDERER_CLASSES = [XlsxRenderer, CsvRenderer]
