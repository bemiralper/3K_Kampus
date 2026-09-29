"""Karne zorluk bandı.

Soru, kurumdaki doğru oranına göre kolay / orta / zor olur. Eşikler madde
analiziyle aynıdır: %70 ve üzeri kolay, %40 altı zor. İptal sorular banda
girmez. Kurumda 20'den az sonuç varsa blok üretilmez; oranı üç kişiden
okumak bandı yalan söyletir.
"""
from __future__ import annotations

from collections import defaultdict

MIN_PARTICIPANTS = 20
EASY_PCT = 70
MEDIUM_PCT = 40

BAND_ORDER = ('kolay', 'orta', 'zor')
BAND_LABEL = {'kolay': 'Kolay', 'orta': 'Orta', 'zor': 'Zor'}


def band_for_correct_pct(pct: float) -> str:
    if pct >= EASY_PCT:
        return 'kolay'
    if pct >= MEDIUM_PCT:
        return 'orta'
    return 'zor'


def canonical_question(booklet: str, raw_key, b_to_a: dict) -> str | None:
    """B kitapçığı konumunu A soru numarasına çevirir. A olduğu gibi kalır."""
    try:
        number = int(raw_key)
    except (TypeError, ValueError):
        return None
    if (booklet or '').upper() == 'B' and b_to_a:
        mapped = b_to_a.get(number)
        return str(mapped) if mapped else None
    return str(number)


def question_bands(
    answers,
    *,
    participant_count: int,
    cancelled_questions,
    b_to_a: dict | None = None,
) -> dict[str, str]:
    """A soru no → bant. `answers` öğeleri (booklet, comparison)."""
    if participant_count < MIN_PARTICIPANTS:
        return {}
    b_to_a = b_to_a or {}
    cancelled = {str(q) for q in cancelled_questions}
    pairs = list(answers)
    for booklet, comparison in pairs:
        for key, result in _iter_results(booklet, comparison, b_to_a):
            if result == 'cancelled':
                cancelled.add(key)

    correct: dict[str, int] = defaultdict(int)
    seen: set[str] = set()
    for booklet, comparison in pairs:
        for key, result in _iter_results(booklet, comparison, b_to_a):
            if key in cancelled:
                continue
            seen.add(key)
            if result == 'correct':
                correct[key] += 1

    return {
        key: band_for_correct_pct((correct[key] / participant_count) * 100)
        for key in seen
    }


def difficulty_note(bands: list[dict]) -> str:
    """Tek cümle. Boş banttan söz etmez."""
    by = {row['key']: row for row in bands}
    kolay = by.get('kolay')
    orta = by.get('orta')
    parts: list[str] = []
    if kolay and kolay['yanlis']:
        parts.append(
            f"Kolay sorularda {kolay['yanlis']} yanlış var. "
            'Bunlar kurumun çoğunun yaptığı sorular.'
        )
    elif kolay and kolay['bos']:
        parts.append(
            f"Kolay sorularda {kolay['bos']} boş var. "
            'Bunlar kurumun çoğunun yaptığı sorular.'
        )
    elif kolay and kolay['yanlis'] == 0 and kolay['bos'] == 0 and orta and orta['yanlis']:
        parts.append('Kolay soruların tamamı doğru.')
    if orta and orta['yanlis']:
        where = 'Alanındaki orta sorularda' if orta.get('scope') == 'alan' else 'Orta sorularda'
        parts.append(f"{where} {orta['yanlis']} yanlış var.")
    if parts:
        return ' '.join(parts)

    wrong = sum(int(row.get('yanlis') or 0) for row in bands)
    zor = by.get('zor')
    if wrong == 0:
        return 'Bu bantlarda yanlış yok.'
    if zor and int(zor.get('yanlis') or 0) == wrong:
        return 'Yanlışların tamamı zor sorularda.'
    return ''


def summarize_difficulty(
    *,
    booklet: str,
    comparison: dict,
    participant_count: int,
    bands: dict[str, str],
    b_to_a: dict | None = None,
    field_questions: set[str] | None = None,
) -> dict | None:
    """`field_questions` doluysa orta ve zor yalnız o sorulardan sayılır.

    AYT'de bu küme öğrencinin alanıdır. Kolay tüm kitapçıkta kalır.
    None ise (TYT, LGS) üç bant da tüm sorulardandır.
    """
    if participant_count < MIN_PARTICIPANTS or not bands:
        return None
    b_to_a = b_to_a or {}
    counts = {
        key: {'soru': 0, 'dogru': 0, 'yanlis': 0, 'bos': 0}
        for key in BAND_ORDER
    }
    for key, result in _iter_results(booklet, comparison, b_to_a):
        band = bands.get(key)
        if not band or band not in counts:
            continue
        if field_questions is not None and band in ('orta', 'zor') and key not in field_questions:
            continue
        slot = counts[band]
        slot['soru'] += 1
        if result == 'correct':
            slot['dogru'] += 1
        elif result == 'wrong':
            slot['yanlis'] += 1
        else:
            slot['bos'] += 1

    rows = []
    for key in BAND_ORDER:
        slot = counts[key]
        if slot['soru'] <= 0:
            continue
        row = {'key': key, 'label': BAND_LABEL[key], **slot}
        if field_questions is not None and key in ('orta', 'zor'):
            row['scope'] = 'alan'
        rows.append(row)
    if not rows:
        return None
    return {
        'participant_count': participant_count,
        'bands': rows,
        'note': difficulty_note(rows),
    }


def build_difficulty_index(all_answers, exam) -> dict:
    """Paylaşılan karne bağlamı. Soru → bant bir kez kurulur."""
    b_to_a, cancelled = _answer_key_maps(exam)
    participant_count = len(all_answers)
    bands = question_bands(
        ((getattr(a, 'booklet', '') or '', getattr(a, 'comparison', None) or {}) for a in all_answers),
        participant_count=participant_count,
        cancelled_questions=cancelled,
        b_to_a=b_to_a,
    )
    return {
        'participant_count': participant_count,
        'b_to_a': b_to_a,
        'bands': bands,
        'section_spans': _section_spans(exam),
    }


def student_difficulty_summary(answer, index: dict | None, *, field_questions: set[str] | None = None) -> dict | None:
    if not index:
        return None
    return summarize_difficulty(
        booklet=getattr(answer, 'booklet', '') or '',
        comparison=getattr(answer, 'comparison', None) or {},
        participant_count=int(index.get('participant_count') or 0),
        bands=index.get('bands') or {},
        b_to_a=index.get('b_to_a') or {},
        field_questions=field_questions,
    )


def _iter_results(booklet: str, comparison: dict, b_to_a: dict):
    for raw, row in (comparison or {}).items():
        key = canonical_question(booklet, raw, b_to_a)
        if not key:
            continue
        result = (row or {}).get('result') or 'empty'
        yield key, result


def _section_spans(exam) -> list[tuple[str, int, int]]:
    """Yaprak dersin A kitapçığı aralığı. Üst ders, altı varsa sayılmaz."""
    sections = list(exam.sections.all())
    parents_with_children = {
        sec.parent_section_id for sec in sections
        if getattr(sec, 'is_sub_section', False) and sec.parent_section_id
    }
    spans = []
    for sec in sections:
        if not getattr(sec, 'is_sub_section', False) and sec.id in parents_with_children:
            continue
        start = int(getattr(sec, 'question_start', 0) or 0)
        end = int(getattr(sec, 'question_end', 0) or 0)
        if end < start or start <= 0:
            continue
        spans.append((sec.name or '', start, end))
    return spans


def _answer_key_maps(exam) -> tuple[dict[int, int], set[str]]:
    from ..models import AnswerKey

    b_to_a: dict[int, int] = {}
    cancelled: set[str] = set()
    answer_key = AnswerKey.primary_for(exam)
    if answer_key is None:
        return b_to_a, cancelled
    items = answer_key.items.select_related('section', 'section__parent_section').all()
    for item in items:
        if item.is_cancelled:
            cancelled.add(str(item.question_number))
        b_global = item.booklet_b_global()
        if b_global:
            b_to_a[b_global] = item.question_number
    return b_to_a, cancelled
