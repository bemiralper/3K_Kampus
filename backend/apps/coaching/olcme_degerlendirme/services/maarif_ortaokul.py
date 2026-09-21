"""5–8. sınıf Maarif kataloğu.

İlkokul (1–4) ve lise (9–12 / SHG21) konularına dokunmaz.
Yalnızca ortaokul sınıfı taşıyan konuları silip resmi öğrenme çıktılarını yazar.
"""
from __future__ import annotations

import json
from pathlib import Path

from django.db import transaction
from django.db.models import Q

from apps.coaching.olcme_degerlendirme.models import AnswerKeyItem, Outcome, Subject, SubOutcome, Topic
from apps.coaching.olcme_degerlendirme.services.curriculum_band import (
    LGS_GRADES,
    YKS_GRADES,
    grades_from_text,
    is_okulizyon_yks,
)

DATA_PATH = (
    Path(__file__).resolve().parents[1] / 'data' / 'maarif_ortaokul_5_8.json'
)

ORTAOKUL_SUBJECT_CODES = (
    'TURKCE',
    'MATEMATIK',
    'FEN',
    'SOSYAL',
    'DKAB',
    'INGILIZCE',
    'INKILAP',
)


def load_catalog(path: Path | None = None) -> dict:
    raw = json.loads((path or DATA_PATH).read_text(encoding='utf-8'))
    subjects = raw.get('subjects')
    if not isinstance(subjects, list) or not subjects:
        raise ValueError('Maarif kataloğunda ders yok.')
    return raw


def topic_is_ortaokul(topic: Topic) -> bool:
    texts = [topic.code or '', topic.name or '']
    texts.extend(
        code for code in topic.outcomes.values_list('code', flat=True)[:12] if code
    )
    if is_okulizyon_yks(*texts):
        return False
    grades = grades_from_text(*texts)
    if grades & YKS_GRADES:
        return False
    return bool(grades & LGS_GRADES)


def replace_ortaokul_catalog(payload: dict, *, dry_run: bool = False) -> dict:
    subjects = payload.get('subjects') or []
    unknown = [s.get('code') for s in subjects if s.get('code') not in ORTAOKUL_SUBJECT_CODES]
    if unknown:
        raise ValueError('Ortaokul kataloğu dışında ders: ' + ', '.join(unknown))

    stats = {
        'deleted_topics': 0,
        'deleted_outcomes': 0,
        'cleared_answer_links': 0,
        'topics': 0,
        'outcomes': 0,
        'sub_outcomes': 0,
        'kept_topics': 0,
    }
    plan = []
    for raw in subjects:
        subject = Subject.objects.filter(code=raw['code']).first()
        remove = []
        keep = 0
        if subject is not None:
            for topic in subject.topics.all():
                if topic_is_ortaokul(topic):
                    remove.append(topic)
                else:
                    keep += 1
        plan.append((raw, subject, remove, keep))
        stats['kept_topics'] += keep
        stats['deleted_topics'] += len(remove)
        stats['deleted_outcomes'] += sum(t.outcomes.count() for t in remove)
        topic_ids = [t.id for t in remove]
        if topic_ids:
            stats['cleared_answer_links'] += AnswerKeyItem.objects.filter(
                Q(outcome__topic_id__in=topic_ids)
                | Q(sub_outcome__outcome__topic_id__in=topic_ids),
            ).count()
        for topic_data in raw.get('topics') or []:
            stats['topics'] += 1
            for outcome_data in topic_data.get('outcomes') or []:
                stats['outcomes'] += 1
                stats['sub_outcomes'] += len(outcome_data.get('sub_outcomes') or [])

    if dry_run:
        return {**stats, 'dry_run': True}

    with transaction.atomic():
        for raw, subject, remove, _keep in plan:
            if subject is None:
                subject = Subject.objects.create(
                    code=raw['code'],
                    name=raw.get('name') or raw['code'],
                    display_name=raw.get('display_name') or raw.get('name') or '',
                    exam_type_filter=Subject.ExamTypeFilter.ALL,
                    order=raw.get('order') or 0,
                )
            Topic.objects.filter(id__in=[t.id for t in remove]).delete()
            for topic_data in raw.get('topics') or []:
                _create_topic(subject, topic_data)
    return {**stats, 'dry_run': False}


def _create_topic(subject: Subject, topic_data: dict) -> None:
    code = (topic_data.get('code') or '')[:30]
    name = (topic_data.get('name') or '').strip()
    if not name:
        raise ValueError(f'{subject.code}: konu adı boş.')
    topic = Topic.objects.create(
        subject=subject,
        code=code,
        name=name[:200],
        order=int(topic_data.get('order') or 0),
    )
    for outcome_data in topic_data.get('outcomes') or []:
        text = (outcome_data.get('text') or '').strip()
        if not text:
            raise ValueError(f'{subject.code} {code}: kazanım metni boş.')
        outcome_code = (outcome_data.get('code') or '')[:50]
        outcome = Outcome.objects.create(
            topic=topic,
            code=outcome_code,
            text=text,
            order=int(outcome_data.get('order') or 0),
            is_active=bool(outcome_data.get('is_active', True)),
        )
        for sub_data in outcome_data.get('sub_outcomes') or []:
            sub_text = (sub_data.get('text') or '').strip()
            if not sub_text:
                continue
            SubOutcome.objects.create(
                outcome=outcome,
                code=(sub_data.get('code') or '')[:50],
                text=sub_text,
                order=int(sub_data.get('order') or 0),
                is_active=bool(sub_data.get('is_active', True)),
            )
