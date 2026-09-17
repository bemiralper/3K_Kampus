"""
Karne / gelişim için konu-kazanım blokları.

Davranış, analysis_views._build_topic_blocks ile aynıdır; taşıma amaçlıdır.
"""
import re
from collections import OrderedDict, defaultdict

from ..models import AnswerKey, Outcome, SubOutcome

_OUTCOME_CODE_RE = re.compile(r'^\d+(?:\.\d+){1,}$')


def normalize_outcome_code(text: str) -> str:
    return (text or '').strip().rstrip('.')


def looks_like_outcome_code(text: str) -> bool:
    return bool(_OUTCOME_CODE_RE.fullmatch(normalize_outcome_code(text)))


def section_curriculum_subject(item, cache: dict):
    """Sınav bölümünün müfredat dersi — boş TYT kopyası varsa asıl ders."""
    subject = getattr(getattr(item, 'section', None), 'subject', None)
    if subject is None:
        return None
    if subject.id in cache:
        return cache[subject.id]
    resolved = subject
    if not subject.topics.exists():
        from .exam_templates import _resolve_curriculum_subject
        resolved = _resolve_curriculum_subject(
            getattr(subject, 'code', '') or '',
            getattr(subject, 'name', '') or '',
            'YKS_TYT',
        )
    cache[subject.id] = resolved
    return resolved


def outcome_texts_for_codes(codes: set[str], subject=None) -> dict[str, str]:
    cleaned = {normalize_outcome_code(code) for code in codes if looks_like_outcome_code(code)}
    if not cleaned or subject is None:
        return {}
    mapping: dict[str, str] = {}
    for sub in (
        SubOutcome.objects
        .filter(code__in=cleaned, is_active=True, outcome__topic__subject=subject)
        .only('code', 'text')
    ):
        if sub.text:
            mapping[sub.code] = sub.text
    remaining = cleaned - set(mapping)
    if remaining:
        for outcome in (
            Outcome.objects
            .filter(code__in=remaining, is_active=True, topic__subject=subject)
            .only('code', 'text')
        ):
            if outcome.text:
                mapping[outcome.code] = outcome.text
    remaining = cleaned - set(mapping)
    if remaining:
        from .curriculum_band import topic_display_name
        from ..models.curriculum import Topic

        for topic in Topic.objects.filter(code__in=remaining, subject=subject).only('code', 'name'):
            title = topic_display_name(topic.name or '')
            if title:
                mapping[topic.code] = title
        leftover = remaining - set(mapping)
        for code in leftover:
            prefix = f'{code}.'
            child = (
                Outcome.objects.filter(
                    code__startswith=prefix, is_active=True, topic__subject=subject,
                )
                .select_related('topic')
                .only('code', 'topic__name')
                .first()
            )
            if child and child.topic_id:
                from ..views.curriculum_views import topic_is_bulk_dump
                if topic_is_bulk_dump(child.topic):
                    continue
                title = topic_display_name(child.topic.name or '')
                if title:
                    mapping[code] = title
    return mapping


def topic_block_label(item, code_texts: dict[str, str] | None = None) -> str:
    # Karnede kod (21.1.1 / 9.1.1.4) değil, kazanım metni durur.
    matched = (item.display_outcome_text() or '').strip()
    if matched and not looks_like_outcome_code(matched):
        return matched
    imported = (item.imported_outcome_text or '').strip()
    if imported and not looks_like_outcome_code(imported):
        return imported
    key = normalize_outcome_code(imported)
    if code_texts and key in code_texts:
        return code_texts[key]
    if item.outcome_id and getattr(item.outcome, 'topic_id', None):
        from .curriculum_band import topic_display_name
        from ..views.curriculum_views import topic_is_bulk_dump
        if not topic_is_bulk_dump(item.outcome.topic):
            topic = topic_display_name(item.outcome.topic.name or '')
            if topic:
                return topic
    return imported


def row_hierarchy(item, label: str, code_texts: dict[str, str] | None = None) -> tuple[str, str]:
    """Konu + kazanım metnini ayır (karne satırı `label` olarak kalır)."""
    topic = ''
    outcome_obj = getattr(item, 'outcome', None)
    if outcome_obj is None and getattr(item, 'sub_outcome', None) is not None:
        outcome_obj = getattr(item.sub_outcome, 'outcome', None)
    topic_obj = getattr(outcome_obj, 'topic', None) if outcome_obj is not None else None
    if topic_obj is not None:
        from .curriculum_band import topic_display_name
        from ..views.curriculum_views import topic_is_bulk_dump
        if not topic_is_bulk_dump(topic_obj):
            topic = topic_display_name(topic_obj.name or '') or ''

    outcome = ''
    matched = (item.display_outcome_text() or '').strip()
    if matched and not looks_like_outcome_code(matched):
        outcome = matched
    else:
        imported = (item.imported_outcome_text or '').strip()
        if imported and not looks_like_outcome_code(imported):
            outcome = imported
        else:
            key = normalize_outcome_code(imported)
            text = (code_texts or {}).get(key) or ''
            if text and not looks_like_outcome_code(text):
                outcome = text

    if outcome and topic and outcome == topic:
        outcome = ''
    if not topic:
        topic = '' if outcome else label
    if topic and topic == outcome:
        outcome = ''
    return topic, outcome


def build_topic_blocks(exam, comparison: dict, booklet: str) -> list:
    # Kazanım etiketleri her zaman A (primary) anahtardan gelir.
    # B kitapçığında üretilmiş anahtar boş/kaymış olabiliyor; karşılaştırma
    # sonucu b_question_number → parent test offset ile bulunur.
    ak = AnswerKey.primary_for(exam)
    if not ak:
        return []
    items = list(
        ak.items
        .select_related(
            'section', 'section__parent_section', 'section__subject',
            'outcome__topic', 'sub_outcome', 'sub_outcome__outcome__topic',
        )
        .order_by('section__order', 'question_number')
    )
    subject_cache: dict = {}
    codes_by_subject: dict = defaultdict(set)
    subject_by_id: dict = {}
    for item in items:
        subject = section_curriculum_subject(item, subject_cache)
        if subject is None:
            continue
        if (item.display_outcome_text() or '').strip():
            continue
        if not looks_like_outcome_code(item.imported_outcome_text or ''):
            continue
        subject_by_id[subject.id] = subject
        codes_by_subject[subject.id].add(item.imported_outcome_text)
    code_texts_by_subject = {
        sid: outcome_texts_for_codes(codes, subject=subject_by_id[sid])
        for sid, codes in codes_by_subject.items()
    }
    use_b = (booklet or '').upper() == 'B'
    blocks_map: OrderedDict = OrderedDict()
    for item in items:
        subject = section_curriculum_subject(item, subject_cache)
        sid = getattr(subject, 'id', None)
        label = topic_block_label(item, code_texts_by_subject.get(sid))
        if not label:
            continue
        lookup_q = item.booklet_b_global() if use_b else item.question_number
        if not lookup_q:
            lookup_q = item.question_number
        sec = item.section
        parent_name = sec.parent_section.name if sec.parent_section_id else sec.name
        table_name = sec.name
        topic, outcome = row_hierarchy(item, label, code_texts_by_subject.get(sid))
        block = blocks_map.setdefault(parent_name, OrderedDict())
        table = block.setdefault(table_name, OrderedDict())
        row_key = (topic, outcome or label)
        row = table.setdefault(row_key, {
            'name': label,
            'topic': topic,
            'outcome': outcome,
            'soru': 0,
            'dogru': 0,
            'yanlis': 0,
            'bos': 0,
        })
        row['soru'] += 1
        result = (comparison.get(str(lookup_q)) or {}).get('result')
        if result == 'correct':
            row['dogru'] += 1
        elif result == 'wrong':
            row['yanlis'] += 1
        else:
            row['bos'] += 1

    topic_blocks = []
    for parent_name, tables in blocks_map.items():
        topic_blocks.append({
            'heading': parent_name,
            'tables': [
                {
                    'title': tname,
                    'rows': [
                        {
                            'name': vals['name'],
                            'topic': vals.get('topic') or '',
                            'outcome': vals.get('outcome') or '',
                            'soru': vals['soru'],
                            'dogru': vals['dogru'],
                            'yanlis': vals['yanlis'],
                            'bos': vals['bos'],
                            'basari': round(vals['dogru'] / vals['soru'] * 100) if vals['soru'] else 0,
                        }
                        for vals in trows.values()
                    ],
                }
                for tname, trows in tables.items()
            ],
        })
    return topic_blocks
