"""Mesaj kuyruğu izleme API."""
from rest_framework import status
from rest_framework.response import Response

from apps.communication.application.queue_monitor_service import (
    LIVE_FAILED_DAYS,
    archive_old_failures,
    cancel_queue_item,
    list_outbound_queue,
    retry_queue_item,
)
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from apps.communication.permissions import CommunicationBulkPermission


def _int_param(raw, default, lo, hi):
    try:
        return max(lo, min(hi, int(raw)))
    except (TypeError, ValueError):
        return default


class OutboundQueueListView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        scope = (request.query_params.get('scope') or 'live').strip().lower()
        if scope not in ('live', 'archive', 'all'):
            scope = 'live'

        return Response(list_outbound_queue(
            kurum_id,
            sube_id,
            scope=scope,
            status=(request.query_params.get('status') or '').strip(),
            campaign_id=(request.query_params.get('campaign_id') or '').strip(),
            account_id=(
                request.query_params.get('channel_config_id')
                or request.query_params.get('account_id')
                or ''
            ).strip(),
            query=(request.query_params.get('q') or '').strip(),
            error_key=(request.query_params.get('error') or '').strip(),
            page=_int_param(request.query_params.get('page'), 1, 1, 10_000),
            page_size=_int_param(request.query_params.get('page_size'), 50, 1, 100),
            live_days=_int_param(request.query_params.get('days'), LIVE_FAILED_DAYS, 1, 90),
        ))


class OutboundQueueArchiveView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        days = _int_param(request.data.get('days'), LIVE_FAILED_DAYS, 1, 90)
        deleted = archive_old_failures(kurum_id, sube_id, days=days)
        return Response({'success': True, 'deleted': deleted, 'days': days})


class OutboundQueueRetryView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]

    def post(self, request, item_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            item = retry_queue_item(kurum_id, item_id, sube_id)
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue
            dispatch_process_outbound_queue()
        except Exception:
            pass
        return Response({'success': True, 'item': {
            'id': str(item.id),
            'status': item.message.status,
        }})


class OutboundQueueCancelView(CommunicationAPIView):
    permission_classes = [CommunicationBulkPermission]

    def post(self, request, item_id):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        try:
            cancel_queue_item(kurum_id, item_id, sube_id)
        except ValueError as exc:
            return Response({'success': False, 'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True})
