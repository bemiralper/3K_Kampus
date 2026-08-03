"""Mandatory şube bağlamı — iletişim modülü endpoint'leri."""
from django.db.models import Q
from rest_framework.response import Response

from shared.sube_context import assert_record_sube_access as _assert_record
from shared.sube_context import resolve_mandatory_sube as _resolve_mandatory


def resolve_mandatory_communication_sube(request, kurum_id):
    """
    Zorunlu şube bağlamını çözümler ve kullanıcı erişimini doğrular.

    Returns:
        (sube_id, None) başarılı
        (None, Response) hata
    """
    sube_id, err = _resolve_mandatory(request, kurum_id)
    if err:
        return None, Response({'error': err['error']}, status=err['status'])
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


def conversation_sube_id(conversation) -> int | None:
    """Konuşmanın şube kimliği — doğrudan FK veya öğrenci/veli üzerinden."""
    if getattr(conversation, 'sube_id', None):
        return conversation.sube_id
    ogrenci = getattr(conversation, 'ogrenci', None)
    if ogrenci and ogrenci.sube_id:
        return ogrenci.sube_id
    veli = getattr(conversation, 'veli', None)
    if veli:
        veli_ogrenci = getattr(veli, 'ogrenci', None)
        if veli_ogrenci and veli_ogrenci.sube_id:
            return veli_ogrenci.sube_id
    return None


def filter_conversations_by_sube(qs, sube_id):
    """Konuşma queryset'ini aktif şubeye göre filtreler.

    Kayıtsız numaradan gelen (veli/öğrenci eşleşmeyen) sohbetlerde `sube_id`
    boş kalabilir; bunlar tüm şube inbox'larında görünür ki mesaj kaçmasın.
    """
    return qs.filter(
        Q(sube_id=sube_id)
        | Q(ogrenci__sube_id=sube_id)
        | Q(veli__ogrenci__sube_id=sube_id)
        | (
            Q(sube_id__isnull=True)
            & Q(ogrenci_id__isnull=True)
            & Q(veli_id__isnull=True)
        )
    )


def assert_conversation_sube_access(request, kurum_id, conversation):
    """Konuşma kaydı için şube erişim doğrulaması."""
    record_sube = conversation_sube_id(conversation)
    allow_null = (
        record_sube is None
        and not getattr(conversation, 'ogrenci_id', None)
        and not getattr(conversation, 'veli_id', None)
    )
    return assert_record_sube_access(
        request, kurum_id, record_sube, allow_null_sube=allow_null,
    )
