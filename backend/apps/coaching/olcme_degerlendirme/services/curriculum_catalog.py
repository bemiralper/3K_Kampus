"""Taşınabilir kazanım kataloğu — ID'siz JSON, ders kodu ile eşleşir."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from django.db import transaction

from apps.coaching.olcme_degerlendirme.models import Outcome, Subject, SubOutcome, Topic

CATALOG_FORMAT = 'olcme-curriculum-catalog'
CATALOG_VERSION = 1
MODE_REPLACE = 'replace'
MODE_MERGE = 'merge'
VALID_MODES = (MODE_REPLACE, MODE_MERGE)
VALID_EXAM_TYPES = {c.value for c in Subject.ExamTypeFilter}


def export_catalog(*, subject_codes: list[str] | None = None) -> dict:
    qs = (
        Subject.objects
        .prefetch_related('topics__outcomes__sub_outcomes')
        .order_by('order', 'id')
    )
    if subject_codes:
        wanted = [c.strip() for c in subject_codes if c and c.strip()]
        if wanted:
            qs = qs.filter(code__in=wanted)

    subjects = []
    for subject in qs:
        topics = []
        for topic in subject.topics.all().order_by('order', 'id'):
            outcomes = []
            for outcome in topic.outcomes.all().order_by('order', 'id'):
                outcomes.append({
                    'code': outcome.code or '',
                    'text': outcome.text or '',
                    'order': outcome.order,
                    'is_active': outcome.is_active,
                    'sub_outcomes': [
                        {
                            'code': sub.code or '',
                            'text': sub.text or '',
                            'order': sub.order,
                            'is_active': sub.is_active,
                        }
                        for sub in outcome.sub_outcomes.all().order_by('order', 'id')
                    ],
                })
            topics.append({
                'code': topic.code or '',
                'name': topic.name or '',
                'order': topic.order,
                'outcomes': outcomes,
            })
        subjects.append({
            'code': subject.code,
            'name': subject.name,
            'display_name': subject.display_name or '',
            'exam_type_filter': subject.exam_type_filter,
            'order': subject.order,
            'topics': topics,
        })

    return {
        'format': CATALOG_FORMAT,
        'version': CATALOG_VERSION,
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'counts': _counts_from_subjects(subjects),
        'subjects': subjects,
    }


def catalog_filename() -> str:
    stamp = datetime.now().strftime('%Y%m%d')
    return f'kazanim-katalogu-{stamp}.json'


def preview_catalog(payload: dict) -> dict:
    subjects = _validated_subjects(payload)
    return {
        'format': CATALOG_FORMAT,
        'version': int(payload.get('version') or CATALOG_VERSION),
        'counts': _counts_from_subjects(subjects),
        'subjects': [
            {
                'code': s['code'],
                'name': s.get('display_name') or s['name'],
                'topics': len(s.get('topics') or []),
            }
            for s in subjects
        ],
    }


def import_catalog(payload: dict, *, mode: str = MODE_REPLACE, dry_run: bool = False) -> dict:
    if mode not in VALID_MODES:
        raise ValueError('mode replace veya merge olmalı.')
    subjects = _validated_subjects(payload)
    preview = preview_catalog(payload)
    if dry_run:
        return {**preview, 'dry_run': True, 'mode': mode}

    stats = {
        'subjects': 0,
        'topics': 0,
        'outcomes': 0,
        'sub_outcomes': 0,
        'replaced_subjects': 0,
        'merged_topics': 0,
    }
    with transaction.atomic():
        for raw in subjects:
            _import_subject(raw, mode=mode, stats=stats)
    return {**preview, 'dry_run': False, 'mode': mode, 'imported': stats}


def _validated_subjects(payload: dict) -> list[dict]:
    if not isinstance(payload, dict):
        raise ValueError('Geçersiz katalog dosyası.')
    if payload.get('format') != CATALOG_FORMAT:
        raise ValueError(
            'Bu dosya kazanım kataloğu değil. Kazanım Yönetimi → İndir ile alınan JSON gerekir.',
        )
    try:
        version = int(payload.get('version') or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError('Katalog sürümü okunamadı.') from exc
    if version != CATALOG_VERSION:
        raise ValueError(f'Desteklenmeyen katalog sürümü: {version}.')
    subjects = payload.get('subjects')
    if not isinstance(subjects, list) or not subjects:
        raise ValueError('Dosyada ders yok.')
    codes = []
    cleaned = []
    for idx, raw in enumerate(subjects):
        if not isinstance(raw, dict):
            raise ValueError(f'{idx + 1}. ders satırı geçersiz.')
        code = (raw.get('code') or '').strip()
        name = (raw.get('name') or '').strip()
        if not code or not name:
            raise ValueError(f'{idx + 1}. derste code ve name zorunlu.')
        codes.append(code)
        topics = raw.get('topics') or []
        if not isinstance(topics, list):
            raise ValueError(f'{code}: topics liste olmalı.')
        cleaned.append({
            'code': code,
            'name': name,
            'display_name': (raw.get('display_name') or '').strip(),
            'exam_type_filter': _exam_type(raw.get('exam_type_filter')),
            'order': _int(raw.get('order'), idx),
            'topics': [_clean_topic(t, i) for i, t in enumerate(topics)],
        })
    dupes = [c for c, n in Counter(codes).items() if n > 1]
    if dupes:
        raise ValueError('Dosyada tekrarlayan ders kodu: ' + ', '.join(dupes))
    return cleaned


def _clean_topic(raw, idx: int) -> dict:
    if not isinstance(raw, dict):
        raise ValueError(f'Konu satırı geçersiz (#{idx + 1}).')
    name = (raw.get('name') or '').strip()
    if not name:
        raise ValueError(f'{idx + 1}. konuda name zorunlu.')
    outcomes = raw.get('outcomes') or []
    if not isinstance(outcomes, list):
        raise ValueError(f'{name}: outcomes liste olmalı.')
    return {
        'code': (raw.get('code') or '').strip(),
        'name': name,
        'order': _int(raw.get('order'), idx),
        'outcomes': [_clean_outcome(o, i) for i, o in enumerate(outcomes)],
    }


def _clean_outcome(raw, idx: int) -> dict:
    if not isinstance(raw, dict):
        raise ValueError(f'Kazanım satırı geçersiz (#{idx + 1}).')
    text = (raw.get('text') or '').strip()
    if not text:
        raise ValueError(f'{idx + 1}. kazanımda text zorunlu.')
    subs = raw.get('sub_outcomes') or []
    if not isinstance(subs, list):
        raise ValueError('sub_outcomes liste olmalı.')
    return {
        'code': (raw.get('code') or '').strip(),
        'text': text,
        'order': _int(raw.get('order'), idx),
        'is_active': bool(raw.get('is_active', True)),
        'sub_outcomes': [_clean_sub(s, i) for i, s in enumerate(subs)],
    }


def _clean_sub(raw, idx: int) -> dict:
    if not isinstance(raw, dict):
        raise ValueError(f'Alt kazanım satırı geçersiz (#{idx + 1}).')
    text = (raw.get('text') or '').strip()
    if not text:
        raise ValueError(f'{idx + 1}. alt kazanımda text zorunlu.')
    return {
        'code': (raw.get('code') or '').strip(),
        'text': text,
        'order': _int(raw.get('order'), idx),
        'is_active': bool(raw.get('is_active', True)),
    }


def _import_subject(raw: dict, *, mode: str, stats: dict) -> None:
    subject, _ = Subject.objects.update_or_create(
        code=raw['code'],
        defaults={
            'name': raw['name'],
            'display_name': raw['display_name'],
            'exam_type_filter': raw['exam_type_filter'],
            'order': raw['order'],
        },
    )
    stats['subjects'] += 1
    if mode == MODE_REPLACE:
        subject.topics.all().delete()
        stats['replaced_subjects'] += 1
        for topic_data in raw['topics']:
            _create_topic(subject, topic_data, stats)
        return
    for topic_data in raw['topics']:
        existing = _find_topic(subject, topic_data)
        if existing:
            stats['merged_topics'] += 1
            _merge_outcomes(existing, topic_data['outcomes'], stats)
            continue
        _create_topic(subject, topic_data, stats)


def _create_topic(subject: Subject, topic_data: dict, stats: dict) -> Topic:
    topic = Topic.objects.create(
        subject=subject,
        code=topic_data['code'],
        name=topic_data['name'],
        order=topic_data['order'],
    )
    stats['topics'] += 1
    for outcome_data in topic_data['outcomes']:
        _create_outcome(topic, outcome_data, stats)
    return topic


def _create_outcome(topic: Topic, outcome_data: dict, stats: dict) -> Outcome:
    outcome = Outcome.objects.create(
        topic=topic,
        code=outcome_data['code'],
        text=outcome_data['text'],
        order=outcome_data['order'],
        is_active=outcome_data['is_active'],
    )
    stats['outcomes'] += 1
    for sub_data in outcome_data['sub_outcomes']:
        SubOutcome.objects.create(
            outcome=outcome,
            code=sub_data['code'],
            text=sub_data['text'],
            order=sub_data['order'],
            is_active=sub_data['is_active'],
        )
        stats['sub_outcomes'] += 1
    return outcome


def _merge_outcomes(topic: Topic, outcomes: list[dict], stats: dict) -> None:
    for outcome_data in outcomes:
        existing = _find_outcome(topic, outcome_data)
        if existing is None:
            _create_outcome(topic, outcome_data, stats)
            continue
        for sub_data in outcome_data['sub_outcomes']:
            if _find_sub(existing, sub_data):
                continue
            SubOutcome.objects.create(
                outcome=existing,
                code=sub_data['code'],
                text=sub_data['text'],
                order=sub_data['order'],
                is_active=sub_data['is_active'],
            )
            stats['sub_outcomes'] += 1


def _find_topic(subject: Subject, topic_data: dict) -> Topic | None:
    code = topic_data['code']
    if code:
        found = subject.topics.filter(code=code).first()
        if found:
            return found
    return subject.topics.filter(name=topic_data['name']).first()


def _find_outcome(topic: Topic, outcome_data: dict) -> Outcome | None:
    code = outcome_data['code']
    if code:
        found = topic.outcomes.filter(code=code).first()
        if found:
            return found
    return topic.outcomes.filter(text=outcome_data['text']).first()


def _find_sub(outcome: Outcome, sub_data: dict) -> SubOutcome | None:
    code = sub_data['code']
    if code:
        found = outcome.sub_outcomes.filter(code=code).first()
        if found:
            return found
    return outcome.sub_outcomes.filter(text=sub_data['text']).first()


def _counts_from_subjects(subjects: list[dict]) -> dict:
    topics = outcomes = subs = 0
    for s in subjects:
        for t in s.get('topics') or []:
            topics += 1
            for o in t.get('outcomes') or []:
                outcomes += 1
                subs += len(o.get('sub_outcomes') or [])
    return {
        'subjects': len(subjects),
        'topics': topics,
        'outcomes': outcomes,
        'sub_outcomes': subs,
    }


def _exam_type(raw) -> str:
    value = (raw or Subject.ExamTypeFilter.ALL).strip()
    return value if value in VALID_EXAM_TYPES else Subject.ExamTypeFilter.ALL


def _int(raw, fallback: int) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return fallback
