"""
Tüm sınavların bölüm skorlarını yeniden hesaplar.

Kullanım:
    python manage.py rescore_sections                   # tüm sınavlar
    python manage.py rescore_sections --exam-id 2       # belirli sınav
    python manage.py rescore_sections --dry-run          # sadece rapor, kaydetmez
"""
import logging
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSession, StudentAnswer, StudentSectionScore, AnswerKey,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Tüm sınavların bölüm skorlarını (ana + alt) yeniden hesaplar.'

    def add_arguments(self, parser):
        parser.add_argument('--exam-id', type=int, help='Belirli bir sınav ID')
        parser.add_argument('--dry-run', action='store_true', help='Sadece rapor, kaydetme')

    def handle(self, *args, **options):
        exam_id = options.get('exam_id')
        dry_run = options.get('dry_run', False)

        exams = Exam.objects.prefetch_related('sections')
        if exam_id:
            exams = exams.filter(pk=exam_id)

        for exam in exams:
            self._rescore_exam(exam, dry_run)

    def _rescore_exam(self, exam, dry_run):
        sections = list(exam.sections.filter(is_sub_section=False).order_by('order'))
        sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('order'))

        if not sections:
            self.stdout.write(f'  [{exam.pk}] {exam.name}: Bölüm yok, atlanıyor.')
            return

        # Cevap anahtarını bul
        answer_key = (
            AnswerKey.objects
            .filter(exam=exam)
            .prefetch_related('items')
            .order_by('-is_primary')
            .first()
        )
        if not answer_key:
            self.stdout.write(f'  [{exam.pk}] {exam.name}: Cevap anahtarı yok, atlanıyor.')
            return

        # correct_map oluştur
        correct_map_a = {}
        section_offset = {
            sec.id: sec.question_start
            for sec in sections
        }
        b_to_a_map = {}
        for item in answer_key.items.select_related('section').all():
            correct_map_a[item.question_number] = {
                'answer': item.correct_answer,
                'is_cancelled': item.is_cancelled,
                'section_id': item.section_id,
            }
            if item.b_question_number is not None and item.section_id in section_offset:
                b_global = section_offset[item.section_id] + item.b_question_number - 1
                b_to_a_map[b_global] = item.question_number

        correct_map_b = {}
        b_key = AnswerKey.objects.filter(exam=exam, booklet='B').prefetch_related('items').first()
        if b_key:
            for item in b_key.items.all():
                correct_map_b[item.question_number] = {
                    'answer': item.correct_answer,
                    'is_cancelled': item.is_cancelled,
                    'section_id': item.section_id,
                }

        total_questions = sum(sec.question_end - sec.question_start + 1 for sec in sections)
        wrong_penalty = exam.wrong_answer_count

        from apps.coaching.olcme_degerlendirme.views.result_views import _score_answers

        sessions = ExamSession.objects.filter(exam=exam)
        answers = (
            StudentAnswer.objects
            .filter(session__in=sessions)
            .prefetch_related('section_scores__section')
        )

        total_students = answers.count()
        updated = 0
        new_scores = 0

        self.stdout.write(f'  [{exam.pk}] {exam.name}: {total_students} öğrenci, '
                          f'{len(sections)} ana + {len(sub_sections)} alt bölüm')

        for sa in answers.iterator():
            # Mevcut answers'dan cevap string'i oluştur
            answers_raw = ''
            for q in range(1, total_questions + 1):
                ch = sa.answers.get(str(q), '')
                answers_raw += ch if ch else ' '

            booklet = sa.booklet or 'A'

            _, comparison_dict, section_scores_data, totals = _score_answers(
                answers_raw, total_questions, booklet,
                correct_map_a, b_to_a_map, correct_map_b,
                sections, wrong_penalty, sub_sections,
            )

            if dry_run:
                # Mevcut section_scores ile karşılaştır
                existing = {ss.section_id: ss for ss in sa.section_scores.all()}
                for sec_id, scores in section_scores_data.items():
                    if sec_id not in existing:
                        new_scores += 1
                continue

            with transaction.atomic():
                # comparison güncelle (iptal edilen sorular vb.)
                sa.comparison = comparison_dict
                sa.total_correct = totals[0]
                sa.total_wrong = totals[1]
                sa.total_empty = totals[2]
                sa.total_net = totals[3]
                sa.save(update_fields=['comparison', 'total_correct', 'total_wrong', 'total_empty', 'total_net'])

                # Tüm section_scores sil ve yeniden oluştur
                sa.section_scores.all().delete()
                for sec_id, scores in section_scores_data.items():
                    StudentSectionScore.objects.create(
                        student_answer=sa,
                        section_id=sec_id,
                        correct=scores['correct'],
                        wrong=scores['wrong'],
                        empty=scores['empty'],
                        net=scores['net'],
                    )
                updated += 1

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'    [DRY-RUN] {new_scores} yeni alt bölüm skoru eklenecek'))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'    ✅ {updated}/{total_students} öğrenci güncellendi'))
