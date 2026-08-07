"""Kurum + şube scoped queryset helpers for ResourceBook and related models."""


def get_request_kurum_id(request):
    from shared.context import get_secili_kurum_id
    return get_secili_kurum_id(request)


def contents_accessible_for_request(request, content_ids: list[int]):
    """
    Toplu içerik yazma için erişim kontrolü.

    Kitap structure GET ile aynı çözümü kullanır (aktif şube + izinli şubeler).
    Böylece UI'da görünen içerikler bulk-prefix / transfer'de "erişim yok" olmaz.

    Returns:
        istek sırasına göre ResourceContent listesi, veya erişim/eksik varsa None.
    """
    from apps.resources.models import ResourceContent

    if not content_ids:
        return []

    unique_ids: list[int] = []
    seen: set[int] = set()
    for raw in content_ids:
        try:
            cid = int(raw)
        except (TypeError, ValueError):
            return None
        if cid in seen:
            continue
        seen.add(cid)
        unique_ids.append(cid)

    found = list(
        ResourceContent.objects.filter(pk__in=unique_ids).select_related(
            'topic', 'topic__unit', 'topic__unit__book',
        )
    )
    if len(found) != len(unique_ids):
        return None

    book_ids = {c.topic.unit.book_id for c in found}
    for book_id in book_ids:
        if resolve_book_for_structure(request, book_id) is None:
            return None

    by_id = {c.id: c for c in found}
    return [by_id[cid] for cid in unique_ids]


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


def resolve_book_for_structure(request, book_id):
    """
    Kitap yapısı (ünite/konu/içerik) okuma için kitap çözümle.

    Liste/yazma izolasyonu korunur; structure GET için güvenli genişletme:
    1) Aktif şube kataloğu
    2) Kullanıcının görevli olduğu diğer şubedeki aynı kurum kitabı
    3) student_id verilmişse: koçun erişebildiği öğrenciye atanmış kitap
    """
    from apps.resources.models import ResourceBook

    try:
        book_id = int(book_id)
    except (TypeError, ValueError):
        return None

    # 1) Normal aktif şube kapsamı
    book = filter_books_for_request(
        ResourceBook.objects.filter(pk=book_id, aktif_mi=True),
        request,
    ).first()
    if book:
        return book

    kurum_id = get_request_kurum_id(request)
    if not kurum_id:
        return None

    book = ResourceBook.objects.filter(
        pk=book_id,
        kurum_id=kurum_id,
        aktif_mi=True,
    ).first()
    if not book:
        return None

    # 2) Kullanıcının erişebildiği şubelerden biri
    from shared.context import get_secili_egitim_yili_id
    from shared.sube_access import get_allowed_subeler_for_user, user_has_global_sube_access

    if user_has_global_sube_access(request.user):
        return book

    egitim_yili_id = get_secili_egitim_yili_id(request)
    allowed_ids = set(
        get_allowed_subeler_for_user(
            request.user,
            kurum_id=kurum_id,
            egitim_yili_id=egitim_yili_id,
        ).values_list('id', flat=True)
    )
    if book.sube_id and book.sube_id in allowed_ids:
        return book

    # 3) Ödev ver: öğrenci kaynak ataması üzerinden okuma
    student_id = None
    query_params = getattr(request, 'query_params', None) or getattr(request, 'GET', {})
    raw_student = query_params.get('student_id') if query_params is not None else None
    if raw_student:
        try:
            student_id = int(raw_student)
        except (TypeError, ValueError):
            student_id = None

    if student_id:
        from apps.coaching.services.coach_access import user_can_access_student
        from apps.student_resources.models import StudentResourceAssignment

        if user_can_access_student(request.user, student_id):
            assigned = StudentResourceAssignment.objects.filter(
                student_id=student_id,
                resource_book_id=book.id,
                is_active=True,
            ).exists()
            if assigned:
                return book

    return None
