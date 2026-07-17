"""Kaynak kitap listesi dışa aktarma — kolon seçimi + sıra."""
from __future__ import annotations

EXPORT_COLUMNS = {
    'ad': 'Kitap Adı',
    'kod': 'Kod',
    'book_type': 'Kitap Türü',
    'ders': 'Ders',
    'sinif': 'Sınıf',
    'yayinevi': 'Yayınevi',
    'yazar': 'Yazar',
    'yayin_yili': 'Yayın Yılı',
    'isbn': 'ISBN',
    'zorluk': 'Zorluk',
    'unit_count': 'Ünite',
    'topic_count': 'Konu',
    'content_count': 'İçerik',
    'aktif': 'Aktif',
    'aciklama': 'Açıklama',
}

DEFAULT_EXPORT_KEYS = [
    'ad', 'kod', 'book_type', 'ders', 'sinif', 'yayinevi', 'yazar', 'yayin_yili',
]


def _sinif_label(book) -> str:
    levels = list(book.sinif_seviyeleri.all())
    if levels:
        return ', '.join(s.ad for s in levels)
    if book.sinif_seviyesi_id:
        return book.sinif_seviyesi.ad
    return ''


def _zorluk_label(book) -> str:
    if book.zorluk_min is not None and book.zorluk_max is not None:
        return f'{book.zorluk_min}-{book.zorluk_max}'
    if book.zorluk_min is not None:
        return f'{book.zorluk_min}+'
    if book.zorluk_max is not None:
        return f'0-{book.zorluk_max}'
    return ''


def book_export_cell(book, key: str) -> str:
    if key == 'ad':
        return book.ad or ''
    if key == 'kod':
        return book.kod or ''
    if key == 'book_type':
        return getattr(book.book_type, 'ad', '') or ''
    if key == 'ders':
        return getattr(book.ders, 'ad', '') or ''
    if key == 'sinif':
        return _sinif_label(book)
    if key == 'yayinevi':
        return book.yayinevi or ''
    if key == 'yazar':
        return book.yazar or ''
    if key == 'yayin_yili':
        return str(book.yayin_yili) if book.yayin_yili else ''
    if key == 'isbn':
        return book.isbn or ''
    if key == 'zorluk':
        return _zorluk_label(book)
    if key == 'unit_count':
        return str(getattr(book, 'db_unit_count', None) or book.unit_count or 0)
    if key == 'topic_count':
        return str(getattr(book, 'db_topic_count', None) or book.topic_count or 0)
    if key == 'content_count':
        return str(getattr(book, 'db_content_count', None) or book.content_count or 0)
    if key == 'aktif':
        return 'Evet' if book.aktif_mi else 'Hayır'
    if key == 'aciklama':
        return book.aciklama or ''
    return ''


def build_export_rows(books, column_keys: list[str]) -> list[dict[str, str]]:
    keys = [k for k in column_keys if k in EXPORT_COLUMNS]
    return [
        {k: book_export_cell(book, k) for k in keys}
        for book in books
    ]


def parse_column_keys(raw: str | None) -> list[str]:
    if not raw:
        return list(DEFAULT_EXPORT_KEYS)
    keys = [k.strip() for k in raw.split(',') if k.strip()]
    return [k for k in keys if k in EXPORT_COLUMNS] or list(DEFAULT_EXPORT_KEYS)
