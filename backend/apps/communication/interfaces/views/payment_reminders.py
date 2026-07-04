"""
Tekil ödeme hatırlatma API — WhatsApp kuyruğuna ekler.
"""
from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from apps.communication.application.integration_hooks import notify_payment_reminder
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from shared.permissions import user_has_any_permission


class PaymentReminderPermission(BasePermission):
    """communication.write veya finans.manage."""

    def has_permission(self, request, view):
        if not request.user.is_authenticated:
            return False
        return user_has_any_permission(
            request.user,
            'communication.write',
            'communication.manage',
            'finans.manage',
        )


class PaymentReminderSendView(CommunicationAPIView):
    """POST /api/communication/payment-reminders/send/"""

    permission_classes = [PaymentReminderPermission]

    def post(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err

        taksit_id = request.data.get('taksit_id')
        if not taksit_id:
            return Response({'error': 'taksit_id zorunludur.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            taksit_id = int(taksit_id)
        except (TypeError, ValueError):
            return Response({'error': 'Geçersiz taksit_id.'}, status=status.HTTP_400_BAD_REQUEST)

        with_pdf = bool(request.data.get('with_pdf', False))
        result = notify_payment_reminder(
            kurum_id,
            taksit_id,
            sent_by_user_id=request.user.id if request.user.is_authenticated else None,
            with_pdf=with_pdf,
        )

        if result is None:
            return Response(
                {'error': 'Hatırlatma gönderilemedi (iç hata).'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        if not result.success:
            return Response(
                {'error': result.errors[0] if result.errors else 'Gönderim başarısız.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from apps.communication.application.celery_dispatch import dispatch_process_outbound_queue

        dispatch_process_outbound_queue()

        return Response({
            'success': True,
            'message_id': result.message_id,
            'detail': 'Ödeme hatırlatması kuyruğa eklendi.',
        })
