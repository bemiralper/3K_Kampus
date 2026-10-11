"""B cevap anahtarından A sorularının b_question_number alanını doldurur.

Aynı ana testte (Türkçe, Sosyal, Temel Matematik, Fen) doğru şıkkı aynı
olan sorular eşlenir. Konumları da aynıysa o bağ korunur; kalanlar soru
sırasıyla bağlanır. Aynı şıktan birden fazla soru olduğunda bu bağ içerik
sırası değildir. Öğrenci neti B anahtarının kendi harfinden hesaplanır.
"""
from __future__ import annotations

from ..models import AnswerKey, AnswerKeyItem


def forget_prefetched_items(answer_key) -> None:
    """Eşleme yazıldıktan sonra aynı nesnedeki eski satır önbelleği okunmasın."""
    cache = getattr(answer_key, '_prefetched_objects_cache', None)
    if cache:
        cache.pop('items', None)


def align_b_question_numbers(exam, *, overwrite: bool = False) -> int:
    """B anahtarına göre eşleşme yazar. Elle girilmiş numara varken overwrite=False ise dokunmaz."""
    primary = AnswerKey.primary_for(exam)
    if primary is None or primary.booklet == 'B':
        return 0
    b_key = (
        AnswerKey.objects.filter(exam=exam, booklet='B')
        .exclude(pk=primary.pk)
        .first()
    )
    if b_key is None:
        return 0
    if (
        not overwrite
        and primary.items.filter(b_question_number__isnull=False).exists()
    ):
        return 0

    a_items = list(
        primary.items.select_related('section', 'section__parent_section')
    )
    b_items = list(
        b_key.items.select_related('section', 'section__parent_section')
    )
    grouped_a: dict[int, list] = {}
    grouped_b: dict[int, list] = {}
    for item in a_items:
        group = _pair_group(item)
        if group is None or not item.correct_answer:
            continue
        grouped_a.setdefault(group, []).append(item)
    for item in b_items:
        group = _pair_group(item)
        if group is None or not item.correct_answer:
            continue
        grouped_b.setdefault(group, []).append(item)

    paired_b: dict[int, int] = {}
    for group, group_a in grouped_a.items():
        matches = _pair_same_letter(group_a, grouped_b.get(group, []))
        for a_item, b_item in matches:
            base = _relative_base(a_item)
            if base is None:
                continue
            relative = b_item.question_number - base + 1
            if relative < 1:
                continue
            paired_b[a_item.id] = relative

    changed = []
    for item in a_items:
        new_value = paired_b.get(item.id)
        if item.b_question_number != new_value:
            item.b_question_number = new_value
            changed.append(item)
    if changed:
        AnswerKeyItem.objects.bulk_update(changed, ['b_question_number'])
    return len(paired_b)


def _pair_group(item) -> int | None:
    """Ana testin içindeyse ana test, aralık dışındaki alt bölümse kendi bölümü."""
    section = item.section
    if section is None:
        return None
    parent = section.parent_section
    if (
        parent is not None
        and parent.question_start <= item.question_number <= parent.question_end
    ):
        return parent.id
    return section.id


def _relative_base(item) -> int | None:
    """booklet_b_global ile aynı taban: varsa ana testin başlangıcı."""
    section = item.section
    if section is None:
        return None
    parent = section.parent_section
    if parent is not None:
        return parent.question_start
    return section.question_start


def _letter_key(item) -> tuple[str, bool]:
    return (item.correct_answer, bool(item.is_cancelled))


def _pair_same_letter(a_items: list, b_items: list) -> list[tuple]:
    """Önce aynı numarada duran şık, sonra kalanlar soru sırasıyla."""
    ordered_b = sorted(b_items, key=lambda item: item.question_number)
    ordered_a = sorted(a_items, key=lambda item: item.question_number)
    used: set[int] = set()
    pairs: dict[int, object] = {}
    b_by_number = {item.question_number: item for item in ordered_b}
    for a_item in ordered_a:
        same_slot = b_by_number.get(a_item.question_number)
        if same_slot is None or _letter_key(same_slot) != _letter_key(a_item):
            continue
        pairs[a_item.id] = same_slot
        used.add(same_slot.id)
    for a_item in ordered_a:
        if a_item.id in pairs:
            continue
        for b_item in ordered_b:
            if b_item.id in used or _letter_key(b_item) != _letter_key(a_item):
                continue
            pairs[a_item.id] = b_item
            used.add(b_item.id)
            break
    return [(a_item, pairs[a_item.id]) for a_item in ordered_a if a_item.id in pairs]
