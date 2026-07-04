"""
Gün Sonu View — günlük tahsilat/ödeme özeti, özet rapor export ve WhatsApp.
"""
from datetime import date

from rest_framework import status
from rest_framework.response import Response

from apps.finans.application.export.gun_sonu_detay_export_service import GunSonuDetayExportService
from apps.finans.application.export.gun_sonu_export_service import GunSonuExportService
from apps.finans.application.gun_sonu_detay_report_service import GunSonuDetayReportService
from apps.finans.application.gun_sonu_report_service import GunSonuReportService, _user_display
from apps.finans.application.gun_sonu_service import GunSonuService
from apps.finans.application.gun_sonu_whatsapp_service import GunSonuWhatsappService
from apps.finans.interfaces.views.base import FinansAPIView as APIView
from apps.finans.interfaces.views.expansion_views import (
    ExportFormatMixin,
    FinansManageAndCommunicationWritePermission,
    _resolve_kurum_id_from_body,
)


def _parse_gun(gun_str: str | None) -> date | tuple[None, Response]:
    if not gun_str:
        return date.today(), None
    try:
        return date.fromisoformat(gun_str), None
    except ValueError:
        err = Response(
            {'error': 'gun parametresi YYYY-MM-DD formatında olmalı.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
        return None, err


def _hazirlayan(request) -> str:
    if request.user and request.user.is_authenticated:
        return _user_display(request.user)
    return 'Sistem'


class GunSonuView(ExportFormatMixin, APIView):
    """GET → Gün sonu özeti veya özet rapor export (?rapor=ozet&format=pdf)."""

    def get(self, request):
        kurum_id = request.query_params.get('kurum_id')
        if not kurum_id:
            return Response({'error': 'kurum_id parametresi zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        gun, gun_err = _parse_gun(request.query_params.get('gun'))
        if gun_err:
            return gun_err

        rapor_tipi = (request.query_params.get('rapor') or '').lower()
        export_fmt = self.get_export_format()
        notlar = request.query_params.get('notlar') or ''
        hazirlayan = _hazirlayan(request)

        if rapor_tipi == 'detay':
            report = GunSonuDetayReportService().build_detay_rapor(
                int(kurum_id),
                gun,
                sube_id,
                hazirlayan=hazirlayan,
                notlar=notlar,
            )
            if export_fmt in ('pdf', 'csv', 'xlsx'):
                try:
                    from apps.finans.application.export.export_service import ExportService
                    orientation = ExportService._normalize_orientation(
                        request.query_params.get('orientation'),
                    )
                    return GunSonuDetayExportService.build(export_fmt, report, orientation=orientation)
                except (ValueError, RuntimeError) as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(report)

        if rapor_tipi == 'ozet' or export_fmt in ('pdf', 'csv', 'xlsx'):
            report = GunSonuReportService().build_ozet_rapor(
                int(kurum_id),
                gun,
                sube_id,
                hazirlayan=hazirlayan,
                notlar=notlar,
            )
            if export_fmt in ('pdf', 'csv', 'xlsx'):
                try:
                    from apps.finans.application.export.export_service import ExportService
                    orientation = ExportService._normalize_orientation(
                        request.query_params.get('orientation'),
                    )
                    return GunSonuExportService.build(export_fmt, report, orientation=orientation)
                except (ValueError, RuntimeError) as exc:
                    return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
            return Response(report)

        service = GunSonuService()
        data = service.ozet(kurum_id, gun, sube_id)
        return Response(data)


class GunSonuWhatsappPreviewView(APIView):
    """POST → WhatsApp alıcı önizlemesi (mali hesap yetkilileri)."""

    permission_classes = [FinansManageAndCommunicationWritePermission]

    def post(self, request):
        kurum_id = _resolve_kurum_id_from_body(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        result = GunSonuWhatsappService.preview(kurum_id, sube_id)
        return Response(result)


class GunSonuWhatsappSendView(APIView):
    """POST → Gün sonu özet raporunu WhatsApp ile gönder."""

    permission_classes = [FinansManageAndCommunicationWritePermission]

    def post(self, request):
        kurum_id = _resolve_kurum_id_from_body(request)
        if not kurum_id:
            return Response({'error': 'kurum_id zorunlu'}, status=400)

        from apps.finans.interfaces.views.sube_context import resolve_mandatory_finans_sube

        sube_id, err = resolve_mandatory_finans_sube(request, kurum_id)
        if err:
            return err

        gun_str = request.data.get('gun')
        gun, gun_err = _parse_gun(gun_str if gun_str else None)
        if gun_err:
            return gun_err

        notlar = request.data.get('notlar') or ''
        recipient_ids = request.data.get('recipient_ids')
        message = request.data.get('message') or ''

        report = GunSonuReportService().build_ozet_rapor(
            kurum_id,
            gun,
            sube_id,
            hazirlayan=_hazirlayan(request),
            notlar=notlar,
        )

        ids = None
        if isinstance(recipient_ids, list) and recipient_ids:
            ids = [int(x) for x in recipient_ids]

        result = GunSonuWhatsappService.send(
            kurum_id,
            report,
            recipient_ids=ids,
            message=message,
            sender_user_id=request.user.id if request.user.is_authenticated else None,
        )
        status_code = 200 if result.get('success') else 400
        return Response(result, status=status_code)
