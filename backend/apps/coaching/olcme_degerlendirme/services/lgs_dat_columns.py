"""LGS optiğinde sosyal blokların sütun sırası.

Bu DAT düzeninde Türkçe'den sonra gelen ilk 10 sütun Din Kültürü, aradaki
boşluktan sonraki 10 sütun İnkılap Tarihi'dir. Şablonlar soru sırasına göre
ters işaretlendiği için doğru/yanlışlar yer değiştiriyordu. Bitişik
(aralarında boşluk olmayan) eşleştirmeye dokunulmaz.
"""
from .student_matching import normalize_name


def _social_kind(name: str) -> str:
    text = normalize_name(name)
    if 'inkilap' in text or text == 'tarih':
        return 'inkilap'
    if 'din kulturu' in text or text == 'din':
        return 'din'
    return ''


def correct_lgs_social_columns(field_mappings, section_name) -> bool:
    """İnkılap erken sütunda ve Din'den en az 8 sütun önceyse aralıkları değiştirir."""
    if not isinstance(field_mappings, list):
        return False
    found = {}
    for item in field_mappings:
        if not isinstance(item, dict):
            continue
        field = item.get('field') or ''
        if not isinstance(field, str) or not field.startswith('ders_'):
            continue
        start, end = item.get('start'), item.get('end')
        if type(start) is not int or type(end) is not int or end - start != 10:
            continue
        kind = _social_kind(section_name(field) or item.get('label') or '')
        if kind:
            found[kind] = item
    inkilap, din = found.get('inkilap'), found.get('din')
    if not inkilap or not din:
        return False
    if inkilap['start'] < din['start'] and din['start'] - inkilap['end'] >= 8:
        inkilap['start'], inkilap['end'], din['start'], din['end'] = (
            din['start'], din['end'], inkilap['start'], inkilap['end'],
        )
        return True
    return False


def correct_lgs_social_ranges(ranges: dict, section_name) -> bool:
    """Okumada kullanılan alan → (başlangıç, bitiş) sözlüğünü düzeltir."""
    items = [
        {'field': field, 'start': span[0], 'end': span[1]}
        for field, span in ranges.items()
        if isinstance(field, str) and isinstance(span, tuple) and len(span) == 2
    ]
    if not correct_lgs_social_columns(items, section_name):
        return False
    for item in items:
        ranges[item['field']] = (item['start'], item['end'])
    return True


def swap_answer_span(answers: dict, start: int, end: int, other_start: int, other_end: int) -> None:
    """İki soru aralığının kayıtlı cevaplarını yer değiştirir."""
    width = end - start + 1
    if other_end - other_start + 1 != width:
        raise ValueError('Yer değiştirilecek derslerin soru sayıları eşit değil.')
    for offset in range(width):
        left, right = str(start + offset), str(other_start + offset)
        answers[left], answers[right] = answers.get(right, ''), answers.get(left, '')
