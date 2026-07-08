"""
Gelir & Gider v2 — ortak filtre / sayfalama / sıralama yardımcıları.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.utils.dateparse import parse_date


def parse_int(value, default=None):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_decimal(value):
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def parse_bool(value):
    if value in (None, ''):
        return None
    if str(value).lower() in ('true', '1', 'evet', 'yes'):
        return True
    if str(value).lower() in ('false', '0', 'hayir', 'no'):
        return False
    return None


def parse_date_safe(value):
    if not value:
        return None
    if hasattr(value, 'isoformat') and not isinstance(value, str):
        return value
    return parse_date(str(value))


def paginate(qs, page, page_size, *, max_page_size=200):
    """QuerySet'i sayfalar; (items, meta) döner."""
    page = parse_int(page, 1) or 1
    page_size = parse_int(page_size, 25) or 25
    page_size = max(1, min(page_size, max_page_size))
    total = qs.count()
    total_pages = (total + page_size - 1) // page_size if total else 1
    page = max(1, min(page, total_pages))
    start = (page - 1) * page_size
    items = list(qs[start:start + page_size])
    meta = {
        'page': page,
        'page_size': page_size,
        'total': total,
        'total_pages': total_pages,
    }
    return items, meta


def resolve_sort(sort, allowed, default):
    """
    'sort' değerini ('-alan' veya 'alan') güvenli ORM order_by değerine çevirir.
    allowed: {api_key: orm_field} eşlemesi.
    """
    if not sort:
        return default
    desc = sort.startswith('-')
    key = sort[1:] if desc else sort
    orm = allowed.get(key)
    if not orm:
        return default
    return f'-{orm}' if desc else orm
