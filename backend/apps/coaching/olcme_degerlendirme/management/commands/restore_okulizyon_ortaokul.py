"""Silinen 5–8. sınıf Okulizyon kazanımlarını Maarif kataloğunun yanına ekler.

Lise ve ilkokul konularına dokunmaz. Maarif çıktıları durur.
Bağı kopmuş LGS cevap anahtarı satırlarını eski koda göre yeniden bağlar.

    python manage.py restore_okulizyon_ortaokul /yol/Okulizyon-Kazanimlar-20230812.xlsx
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.coaching.olcme_degerlendirme.models import AnswerKeyItem
from apps.coaching.olcme_degerlendirme.services.okulizyon_import import (
    parse_excel_rows,
    restore_ortaokul_catalog,
)
from apps.coaching.olcme_degerlendirme.views.curriculum_views import _match_single_text


class Command(BaseCommand):
    help = '5–8. sınıf eski kazanımları Maarif kataloğunun yanına geri yükler.'

    def add_arguments(self, parser):
        parser.add_argument('xlsx', help='Okulizyon kazanım Excel dosyası')
        parser.add_argument(
            '--no-rematch',
            action='store_true',
            help='Cevap anahtarı satırlarını yeniden bağlama',
        )

    def handle(self, *args, **options):
        rows = parse_excel_rows(options['xlsx'])
        stats = restore_ortaokul_catalog(rows)
        self.stdout.write(
            f"Eklendi: {stats['topics']} konu, {stats['outcomes']} kazanım, "
            f"{stats['sub_outcomes']} alt kazanım. "
            f"Zaten duran konu: {stats['skipped_topics']}."
        )
        for code, row in stats['per_subject'].items():
            self.stdout.write(
                f"  {code}: +{row['topics']} konu, +{row['outcomes']} kazanım"
            )
        if options['no_rematch']:
            return
        matched, open_rows = _rematch_unbound_lgs()
        self.stdout.write(self.style.SUCCESS(
            f'LGS cevap anahtarı: {matched} satır bağlandı, {open_rows} satır boşta kaldı.'
        ))


def _rematch_unbound_lgs() -> tuple[int, int]:
    items = (
        AnswerKeyItem.objects
        .filter(
            outcome__isnull=True,
            sub_outcome__isnull=True,
            answer_key__exam__exam_type__in=('LGS', 'LGS_7'),
        )
        .exclude(imported_outcome_text='')
        .select_related('section', 'section__subject')
    )
    matched = 0
    open_rows = 0
    with transaction.atomic():
        for item in items:
            text = (item.imported_outcome_text or '').strip()
            subject = item.section.subject if item.section_id else None
            match = _match_single_text(text, subject) if subject and text else None
            if not match or not match.get('outcome_id'):
                open_rows += 1
                continue
            item.outcome_id = match['outcome_id']
            item.sub_outcome_id = match.get('sub_outcome_id')
            item.save(update_fields=['outcome_id', 'sub_outcome_id'])
            matched += 1
    return matched, open_rows
