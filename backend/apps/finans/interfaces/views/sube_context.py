"""Mandatory şube bağlamı — finans list/read endpoint'leri."""
from rest_framework import status
from rest_framework.response import Response

from shared.sube_context import (
    SUBE_FORBIDDEN_MSG,
    SUBE_REQUIRED_MSG,
    assert_record_sube_access as _assert_record,
    resolve_mandatory_sube,
)


def resolve_mandatory_finans_sube(request, kurum_id):
    """
    Zorunlu şube bağlamını çözümler ve kullanıcı erişimini doğrular.

    Returns:
        (sube_id, None) başarılı
        (None, Response) hata
    """
    sube_id, err = resolve_mandatory_sube(request, kurum_id)
    if err:
        return None, Response(
            {'error': err['error']},
            status=err['status'],
        )
    return sube_id, None


def assert_record_sube_access(request, kurum_id, record_sube_id, *, allow_null_sube=False):
    """
    Tekil kayıt erişiminde aktif şube bağlamını doğrular.

    Returns:
        None başarılı
        Response hata
    """
    err = _assert_record(
        request, kurum_id, record_sube_id, allow_null_sube=allow_null_sube,
    )
    if err:
        return Response({'error': err['error']}, status=err['status'])
    return None
