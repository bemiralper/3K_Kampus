from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.dashboard.application.admin_dashboard_service import AdminDashboardService
from apps.odeme_takip.interfaces.sube_context import resolve_mandatory_odeme_context


class AdminDashboardView(APIView):
    """GET /api/admin/dashboard/ — yönetici ana panel özeti."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        kurum_id, sube_id, egitim_yili_id, err = resolve_mandatory_odeme_context(request)
        if err:
            return err
        if not egitim_yili_id:
            return Response(
                {'detail': 'Eğitim yılı seçimi gerekli.'},
                status=400,
            )
        data = AdminDashboardService.build(
            kurum_id=int(kurum_id),
            sube_id=int(sube_id),
            egitim_yili_id=int(egitim_yili_id),
        )
        return Response(data)
