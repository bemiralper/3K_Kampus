"""Türkiye Yüzyılı Maarif Modeli kazanımlarını mevcut ders ağacına ekler.

Kaynak: tymm.meb.gov.tr öğretim programları (derleme 2026-08-27).
2018 programındaki konulara dokunmaz. Aynı komut yeniden çalışınca
yalnızca Maarif satırlarını yeniler.
"""
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.coaching.olcme_degerlendirme.models.curriculum import (
    Outcome,
    Subject,
    SubOutcome,
    Topic,
)
from apps.coaching.olcme_degerlendirme.services.maarif_numeric import (
    numeric_outcome,
    numeric_sub,
    numeric_topic,
)

CATALOG = Path(__file__).resolve().parents[2] / 'data' / 'maarif_katalog.json'

SUBJECTS = {
    'TURKCE': ('Türkçe', 1),
    'TDE': ('Türk Dili ve Edebiyatı', 2),
    'MATEMATIK': ('Matematik', 3),
    'FEN': ('Fen Bilimleri', 5),
    'FIZIK': ('Fizik', 6),
    'KIMYA': ('Kimya', 7),
    'BIYOLOJI': ('Biyoloji', 8),
    'TARIH': ('Tarih', 9),
    'COGRAFYA': ('Coğrafya', 10),
    'FELSEFE': ('Felsefe', 11),
    'DKAB': ('Din Kültürü ve Ahlak Bilgisi', 12),
    'INKILAP': ('T.C. İnkılap Tarihi ve Atatürkçülük', 13),
    'INGILIZCE': ('İngilizce', 14),
    'SOSYAL': ('Sosyal Bilgiler', 15),
}


class Command(BaseCommand):
    help = 'Maarif Modeli kazanımlarını (5–12) ders ağacına ekler.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--subjects',
            nargs='+',
            metavar='DERS_KODU',
            help='Yalnızca verilen ders kodlarını yeniler (örn. TDE INGILIZCE).',
        )

    def handle(self, *args, **options):
        import json
        payload = json.loads(CATALOG.read_text(encoding='utf-8'))
        only = {code.upper() for code in (options.get('subjects') or [])}
        stats = {'subjects': 0, 'topics': 0, 'outcomes': 0, 'sub_outcomes': 0}
        with transaction.atomic():
            for block in payload['subjects']:
                code = block['code']
                if only and code not in only:
                    continue
                name, order = SUBJECTS.get(code, (code, 50))
                subject, _created = Subject.objects.get_or_create(
                    code=code,
                    defaults={
                        'name': name,
                        'display_name': name,
                        'order': order,
                    },
                )
                Topic.objects.filter(subject=subject, program=Topic.Program.MAARIF).delete()
                for index, topic_data in enumerate(block['topics']):
                    official_topic = topic_data.get('code') or ''
                    topic = Topic.objects.create(
                        subject=subject,
                        program=Topic.Program.MAARIF,
                        code=numeric_topic(official_topic)[:30],
                        name=(topic_data.get('name') or '')[:200],
                        order=index,
                    )
                    stats['topics'] += 1
                    for o_index, outcome_data in enumerate(topic_data.get('outcomes') or []):
                        official_outcome = outcome_data.get('code') or ''
                        outcome_code = numeric_outcome(official_outcome, official_topic)
                        outcome = Outcome.objects.create(
                            topic=topic,
                            code=outcome_code[:50],
                            text=outcome_data.get('text') or '',
                            order=o_index,
                        )
                        stats['outcomes'] += 1
                        subs = [
                            SubOutcome(
                                outcome=outcome,
                                code=numeric_sub(sub.get('code') or '', outcome_code)[:50],
                                text=sub.get('text') or '',
                                order=s_index,
                            )
                            for s_index, sub in enumerate(outcome_data.get('sub_outcomes') or [])
                            if (sub.get('text') or '').strip()
                        ]
                        if subs:
                            SubOutcome.objects.bulk_create(subs)
                            stats['sub_outcomes'] += len(subs)
                stats['subjects'] += 1
        self.stdout.write(self.style.SUCCESS(
            f"Maarif yüklendi: {stats['subjects']} ders, {stats['topics']} konu, "
            f"{stats['outcomes']} kazanım, {stats['sub_outcomes']} alt kazanım"
        ))
