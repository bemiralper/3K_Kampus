"""Ödeme takip API izinleri."""
from rest_framework.permissions import BasePermission

from shared.permissions import FinansManagePermission

ODEME_TAKIP_PERMISSIONS = [FinansManagePermission]


class OdemePrintOrAuthenticatedPermission(BasePermission):
    """Geçerli print token varsa anonime izin ver; aksi halde finans yetkisi."""

    def has_permission(self, request, view):
        token = (
            request.headers.get('X-Print-Token')
            or request.query_params.get('print_token')
        )
        if token:
            from apps.odeme_takip.application.print_token import validate_print_token

            payload = validate_print_token(token)
            if payload:
                request._odeme_print_payload = payload
                return True
        for perm_class in ODEME_TAKIP_PERMISSIONS:
            if not perm_class().has_permission(request, view):
                return False
        return True


def validate_print_token_for_request(request, entity_id: int, allowed_types: tuple[str, ...]) -> bool:
    payload = getattr(request, '_odeme_print_payload', None)
    if not payload:
        return False
    if int(payload['entity_id']) != int(entity_id):
        return False
    if payload['doc_type'] not in allowed_types:
        return False
    return True
