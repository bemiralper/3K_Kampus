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

EXPORT_COLUMN_TYPES = {
    'yayin_yili': 'year',
    'unit_count': 'integer',
    'topic_count': 'integer',
    'content_count': 'integer',
}


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


def build_export_columns(column_keys: list[str]):
    from shared.export.style_manager import ExportColumn

    keys = [k for k in column_keys if k in EXPORT_COLUMNS]
    return [
        ExportColumn(key=k, label=EXPORT_COLUMNS[k], type=EXPORT_COLUMN_TYPES.get(k, 'text'))
        for k in keys
    ]


def build_export_meta(request, *, kurum_id, sube_id, report_title='KAYNAK KİTAP LİSTESİ'):
    from shared.export.style_manager import ReportMeta

    kurum_ad = ''
    sube_ad = ''
    try:
        if kurum_id:
            from apps.kurum.domain.models import Kurum
            kurum = Kurum.objects.filter(id=kurum_id).first()
            kurum_ad = kurum.ad if kurum else ''
    except Exception:
        kurum_ad = ''
    try:
        if sube_id:
            from apps.sube.domain.models import Sube
            sube = Sube.objects.filter(id=sube_id).first()
            sube_ad = sube.ad if sube else ''
    except Exception:
        sube_ad = ''

    user = getattr(request, 'user', None)
    generated_by = ''
    if user and getattr(user, 'is_authenticated', False):
        generated_by = user.get_full_name() or user.get_username()

    return ReportMeta(
        report_title=report_title,
        kurum_ad=kurum_ad,
        sube_ad=sube_ad,
        generated_by=generated_by,
    )


def build_export_stats(rows):
    from shared.export.style_manager import ExportStat

    toplam = len(rows)
    aktif = sum(1 for r in rows if r.get('aktif') == 'Evet')
    return [
        ExportStat(label='Toplam Kitap', value=toplam, type='integer'),
        ExportStat(label='Aktif', value=aktif, type='integer'),
        ExportStat(label='Pasif', value=toplam - aktif, type='integer'),
    ]
