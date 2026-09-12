"""
Tüm sınavların bölüm skorlarını yeniden hesaplar.

Kullanım:
    python manage.py rescore_sections                   # tüm sınavlar
    python manage.py rescore_sections --exam-id 2       # belirli sınav
    python manage.py rescore_sections --dry-run          # sadece rapor, kaydetmez
"""
import logging
from django.core.management.base import BaseCommand

from apps.coaching.olcme_degerlendirme.models import Exam, StudentAnswer

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
        from apps.coaching.olcme_degerlendirme.services.exam_rescore import rescore_exam_results

        answers = StudentAnswer.objects.filter(session__exam=exam)
        total_students = answers.count()
        self.stdout.write(f'  [{exam.pk}] {exam.name}: {total_students} öğrenci')
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'    [DRY-RUN] {total_students} öğrenci yeniden skorlanacak'))
            return
        updated = rescore_exam_results(exam)
        self.stdout.write(self.style.SUCCESS(
            f'    ✅ {updated}/{total_students} öğrenci güncellendi'))
