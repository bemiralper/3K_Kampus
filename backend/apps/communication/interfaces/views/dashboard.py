"""Yönetici iletişim analytics paneli."""
from __future__ import annotations

from rest_framework.response import Response

from apps.communication.application.dashboard_service import build_communication_dashboard
from apps.communication.interfaces.views.base import CommunicationAPIView
from apps.communication.interfaces.views._context import resolve_kurum_and_sube
from shared.permissions import user_has_any_permission


class CommunicationDashboardView(CommunicationAPIView):
    """GET /api/communication/dashboard/ — communication.manage."""

    def get(self, request):
        kurum_id, sube_id, err = resolve_kurum_and_sube(request)
        if err:
            return err
        if not (
            request.user.is_superuser
            or user_has_any_permission(request.user, 'communication.manage')
        ):
            return Response({'error': 'Yetkiniz yok.'}, status=403)

        return Response(build_communication_dashboard(kurum_id, sube_id))
