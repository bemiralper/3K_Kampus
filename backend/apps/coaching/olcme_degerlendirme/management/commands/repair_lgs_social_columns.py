"""Ters işaretlenmiş LGS İnkılap/Din sütunlarını düzeltip sonuçları yeniden puanlar.

Bir kez çalıştırılır. Eşleme zaten doğruysa cevaplara dokunmaz.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.coaching.olcme_degerlendirme.models import Exam, ExamSession, MappingTemplate
from apps.coaching.olcme_degerlendirme.services.exam_rescore import rescore_exam_results
from apps.coaching.olcme_degerlendirme.services.lgs_dat_columns import (
    correct_lgs_social_columns,
    swap_answer_span,
)


class Command(BaseCommand):
    help = 'LGS optiğindeki İnkılap ve Din bloklarını kalıcı olarak düzeltir.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        templates = 0
        for template in MappingTemplate.objects.filter(exam_type='LGS'):
            mappings = list(template.mappings or [])
            if correct_lgs_social_columns(mappings, lambda field: ''):
                templates += 1
                if not dry_run:
                    template.mappings = mappings
                    template.save(update_fields=['mappings'])
        self.stdout.write(f'Şablon: {templates}')

        exam_ids = set()
        sessions = 0
        answers = 0
        for session in ExamSession.objects.filter(exam__exam_type='LGS').select_related('exam'):
            sections = list(session.exam.sections.filter(is_sub_section=False))
            names = {f'ders_{section.pk}': section.name for section in sections}
            mappings = list(session.field_mappings or [])
            settings = dict(session.dual_dat_settings or {})
            verbal = dict(settings['verbal']) if isinstance(settings.get('verbal'), dict) else None
            if verbal is not None:
                verbal['field_mappings'] = list(verbal.get('field_mappings') or [])
            changed = correct_lgs_social_columns(mappings, lambda field: names.get(field, ''))
            if verbal is not None and correct_lgs_social_columns(
                verbal['field_mappings'], lambda field: names.get(field, ''),
            ):
                changed = True
            if not changed:
                continue
            inkilap = next((section for section in sections if 'inkilap' in _fold(section.name) or _fold(section.name) == 'tarih'), None)
            din = next((section for section in sections if 'din kulturu' in _fold(section.name) or _fold(section.name) == 'din'), None)
            if not inkilap or not din:
                self.stdout.write(f'Oturum {session.pk}: ders bulunamadı, atlandı')
                continue
            sessions += 1
            exam_ids.add(session.exam_id)
            if dry_run:
                answers += session.student_answers.count()
                continue
            with transaction.atomic():
                for answer in session.student_answers.all():
                    payload = dict(answer.answers or {})
                    swap_answer_span(
                        payload,
                        inkilap.question_start, inkilap.question_end,
                        din.question_start, din.question_end,
                    )
                    answer.answers = payload
                    answer.save(update_fields=['answers'])
                    answers += 1
                session.field_mappings = mappings
                if verbal is not None:
                    settings['verbal'] = verbal
                    session.dual_dat_settings = settings
                session.save(update_fields=['field_mappings', 'dual_dat_settings'])
        for exam_id in sorted(exam_ids):
            if not dry_run:
                rescore_exam_results(Exam.objects.get(pk=exam_id))
        self.stdout.write(f'Oturum: {sessions}, cevap: {answers}, sınav: {len(exam_ids)}')


def _fold(name: str) -> str:
    from apps.coaching.olcme_degerlendirme.services.student_matching import normalize_name
    return normalize_name(name)
