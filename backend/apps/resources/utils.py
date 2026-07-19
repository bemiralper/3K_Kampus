"""Kaynak kütüphanesi yardımcıları."""
import re

from django.db.models import Max

from .models import ResourceBook, ResourceContent, ResourceTopic, ResourceUnit

NUMBERED_TEST_PREFIX = 'Test'

_TR_LOWER_MAP = str.maketrans({
    'I': 'ı',
    'İ': 'i',
    'Ş': 'ş',
    'Ğ': 'ğ',
    'Ü': 'ü',
    'Ö': 'ö',
    'Ç': 'ç',
})
_TR_UPPER_FIRST = {
    'i': 'İ',
    'ı': 'I',
    'ş': 'Ş',
    'ğ': 'Ğ',
    'ü': 'Ü',
    'ö': 'Ö',
    'ç': 'Ç',
}


def to_title_case_tr(value: str) -> str:
    """Her kelimenin ilk harfini büyük, kalanını küçük yapar (Türkçe)."""
    text = re.sub(r'\s+', ' ', (value or '').strip())
    if not text:
        return ''

    def _word(token: str) -> str:
        parts = re.split(r'([-–—/])', token)
        out = []
        for part in parts:
            if not part or part in '-–—/':
                out.append(part)
                continue
            lower = part.translate(_TR_LOWER_MAP).lower()
            first = _TR_UPPER_FIRST.get(lower[0], lower[0].upper())
            out.append(first + lower[1:])
        return ''.join(out)

    return ' '.join(_word(w) for w in text.split(' '))


def normalize_kod(value: str) -> str:
    cleaned = re.sub(r'[^A-Za-z0-9_]+', '_', (value or '').strip().upper())
    return re.sub(r'_+', '_', cleaned).strip('_')


def generate_book_kod(
    kurum_id: int,
    book_type,
    ders,
    exclude_id: int | None = None,
    *,
    sube_id: int | None = None,
) -> str:
    """Şube + tür + ders bazlı benzersiz kitap kodu üretir."""
    type_part = normalize_kod(getattr(book_type, 'kod', None) or 'KITAP')[:12] or 'KITAP'
    ders_part = normalize_kod(getattr(ders, 'kod', None) or 'DERS')[:12] or 'DERS'
    prefix = f'{type_part}_{ders_part}_'

    qs = ResourceBook.objects.filter(kod__startswith=prefix)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    elif kurum_id:
        qs = qs.filter(kurum_id=kurum_id)
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)

    max_num = 0
    for book in qs.only('kod'):
        suffix = book.kod[len(prefix):]
        if suffix.isdigit():
            max_num = max(max_num, int(suffix))

    return f'{prefix}{max_num + 1:03d}'

def generate_unit_kod(book, exclude_id: int | None = None) -> str:
    """Kitap koduna bağlı benzersiz ünite kodu üretir."""
    from django.db import transaction

    with transaction.atomic():
        locked_book = ResourceBook.objects.select_for_update().get(pk=book.pk)
        book_kod = normalize_kod(getattr(locked_book, 'kod', None) or 'BOOK')[:20] or 'BOOK'
        prefix = f'{book_kod}_U'

        qs = ResourceUnit.objects.filter(book=locked_book, kod__startswith=prefix)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)

        max_num = 0
        for unit in qs.only('kod'):
            suffix = unit.kod[len(prefix):]
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))

        return f'{prefix}{max_num + 1:03d}'


def generate_topic_kod(unit, exclude_id: int | None = None) -> str:
    """Ünite koduna bağlı benzersiz konu kodu üretir."""
    from django.db import transaction

    with transaction.atomic():
        locked_unit = ResourceUnit.objects.select_for_update().get(pk=unit.pk)
        unit_kod = normalize_kod(getattr(locked_unit, 'kod', None) or 'UNIT')[:20] or 'UNIT'
        prefix = f'{unit_kod}_K'

        qs = ResourceTopic.objects.filter(unit=locked_unit, kod__startswith=prefix)
        if exclude_id:
            qs = qs.exclude(pk=exclude_id)

        max_num = 0
        for topic in qs.only('kod'):
            suffix = topic.kod[len(prefix):]
            if suffix.isdigit():
                max_num = max(max_num, int(suffix))

        return f'{prefix}{max_num + 1:03d}'


def _normalize_prefix(prefix: str) -> str:
    return (prefix or '').strip()


def format_series_name(prefix: str, n: int) -> str:
    return f'{_normalize_prefix(prefix)}-{n}'


def parse_series_index(ad: str, prefix: str) -> int | None:
    """'{prefix}-{n}' veya '{prefix} {n}' deseninden n çıkarır (prefix case-insensitive)."""
    ad = (ad or '').strip()
    prefix_norm = _normalize_prefix(prefix)
    if not ad or not prefix_norm:
        return None

    match = re.match(r'^(.+?)[\s\-]+(\d+)\s*$', ad)
    if not match:
        return None
    if match.group(1).strip().casefold() != prefix_norm.casefold():
        return None
    return int(match.group(2))


def get_topic_test_contents(topic_id: int):
    return ResourceContent.objects.filter(
        topic_id=topic_id,
        content_type=ResourceContent.ContentType.TEST_SET,
        aktif_mi=True,
    ).order_by('sira')


def next_test_sira(topic_id: int) -> int:
    agg = ResourceContent.objects.filter(topic_id=topic_id).aggregate(m=Max('sira'))
    return (agg['m'] or 0) + 1


def next_series_start(topic_id: int, prefix: str) -> int:
    max_n = 0
    for content in get_topic_test_contents(topic_id).only('ad'):
        idx = parse_series_index(content.ad, prefix)
        if idx is not None:
            max_n = max(max_n, idx)
    return max_n + 1


def build_series_names(prefix: str, count: int, start: int) -> list[str]:
    return [format_series_name(prefix, start + i) for i in range(count)]


def build_test_batch(
    topic_id: int,
    *,
    mode: str = 'numbered',
    prefix: str | None = None,
    count: int = 1,
    start=None,
) -> dict:
    """Toplu test adlandırma önizlemesi / kayıt verisi."""
    count = int(count)
    if count < 1:
        raise ValueError('count en az 1 olmalıdır.')

    if mode == 'numbered':
        series_prefix = NUMBERED_TEST_PREFIX
    elif mode == 'series':
        series_prefix = _normalize_prefix(prefix or '')
        if not series_prefix:
            raise ValueError('Şablon adı (prefix) gerekli.')
    else:
        raise ValueError('Geçersiz mode.')

    if start is None or start == '' or str(start).lower() == 'auto':
        start_num = next_series_start(topic_id, series_prefix)
        start_mode = 'auto'
    else:
        start_num = int(start)
        if start_num < 1:
            raise ValueError('Başlangıç numarası en az 1 olmalıdır.')
        start_mode = 'manual'

    names = build_series_names(series_prefix, count, start_num)
    return {
        'mode': mode,
        'prefix': series_prefix,
        'start': start_num,
        'start_mode': start_mode,
        'count': count,
        'next_sira': next_test_sira(topic_id),
        'names': names,
    }
