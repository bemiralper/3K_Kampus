"""Kurum + şube scoped queryset helpers for ResourceBook and related models."""


def get_request_kurum_id(request):
    from shared.context import get_secili_kurum_id
    return get_secili_kurum_id(request)


def get_request_sube_id(request, kurum_id=None):
    """Zorunlu şube bağlamı — header/session; yoksa None."""
    from shared.context import require_mandatory_sube_id
    return require_mandatory_sube_id(request, kurum_id=kurum_id)


def filter_books_for_request(qs, request):
    kurum_id = get_request_kurum_id(request)
    sube_id = get_request_sube_id(request, kurum_id=kurum_id)
    if not kurum_id or not sube_id:
        return qs.none()
    return qs.filter(kurum_id=kurum_id, sube_id=sube_id)


def filter_by_book_kurum_for_request(qs, request, kurum_lookup='book__kurum_id'):
    """Geriye uyumluluk: şube filtresi de uygulanır (book__sube_id)."""
    kurum_id = get_request_kurum_id(request)
    sube_id = get_request_sube_id(request, kurum_id=kurum_id)
    if not kurum_id or not sube_id:
        return qs.none()
    sube_lookup = kurum_lookup.replace('kurum_id', 'sube_id').replace('kurum', 'sube')
    if sube_lookup == kurum_lookup:
        sube_lookup = 'book__sube_id'
    return qs.filter(**{kurum_lookup: kurum_id, sube_lookup: sube_id})
