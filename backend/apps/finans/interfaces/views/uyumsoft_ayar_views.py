"""Kurum bazlı Uyumsoft e-belge ayarı. Yalnızca finans.manage."""
from rest_framework import status
from rest_framework.response import Response

from apps.finans.application.uyumsoft_ayar_service import get_ayar, save_ayar, test_ayar
from apps.finans.infrastructure.uyumsoft_client import UyumsoftError
from apps.finans.interfaces.views.base import FinansAPIView
from shared.kurum_access import user_can_access_kurum
from shared.permissions import FinansManagePermission


class UyumsoftAyarView(FinansAPIView):
    """
    GET  /finans/api/uyumsoft-ayar/?kurum_id=
    PUT  /finans/api/uyumsoft-ayar/
    """

    permission_classes = [FinansManagePermission]

    def get(self, request):
        kurum_id, err = _kurum_id(request, source=request.query_params)
        if err:
            return err
        denied = _deny_foreign_kurum(request, kurum_id)
        if denied:
            return denied
        return Response(get_ayar(kurum_id))

    def put(self, request):
        kurum_id, err = _kurum_id(request, source=request.data)
        if err:
            return err
        denied = _deny_foreign_kurum(request, kurum_id)
        if denied:
            return denied
        try:
            payload = save_ayar(kurum_id, request.data, request.user)
        except UyumsoftError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload)


class UyumsoftAyarTestView(FinansAPIView):
    """POST /finans/api/uyumsoft-ayar/test/ — WhoAmI, fatura göndermez."""

    permission_classes = [FinansManagePermission]

    def post(self, request):
        kurum_id, err = _kurum_id(request, source=request.data)
        if err:
            return err
        denied = _deny_foreign_kurum(request, kurum_id)
        if denied:
            return denied
        try:
            payload = test_ayar(kurum_id, request.data, request.user)
        except UyumsoftError as exc:
            return Response({'basarili': False, 'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload)


def _kurum_id(request, *, source):
    raw = source.get('kurum_id')
    try:
        kurum_id = int(raw)
    except (TypeError, ValueError):
        return None, Response(
            {'error': 'kurum_id zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if kurum_id <= 0:
        return None, Response(
            {'error': 'kurum_id zorunludur.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return kurum_id, None


def _deny_foreign_kurum(request, kurum_id: int):
    if user_can_access_kurum(request.user, kurum_id):
        return None
    return Response({'error': 'Bu kuruma erişim yetkiniz yok.'}, status=status.HTTP_403_FORBIDDEN)
