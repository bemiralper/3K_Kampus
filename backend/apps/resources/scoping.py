"""Kurum-scoped queryset helpers for ResourceBook and related models."""


def get_request_kurum_id(request):
    from shared.context import get_secili_kurum_id
    return get_secili_kurum_id(request)


def filter_books_for_request(qs, request):
    kurum_id = get_request_kurum_id(request)
    if kurum_id:
        return qs.filter(kurum_id=kurum_id)
    return qs.none()


def filter_by_book_kurum_for_request(qs, request, kurum_lookup='book__kurum_id'):
    kurum_id = get_request_kurum_id(request)
    if kurum_id:
        return qs.filter(**{kurum_lookup: kurum_id})
    return qs.none()
