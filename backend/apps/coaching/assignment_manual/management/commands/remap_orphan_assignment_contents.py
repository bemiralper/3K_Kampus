"""content FK'si SET_NULL olmuş ödev görevlerini güncel içeriklere yeniden bağla."""

from django.core.management.base import BaseCommand

from apps.coaching.assignment_manual.content_resolve import remap_orphan_assignment_contents


class Command(BaseCommand):
    help = (
        'AssignmentTask.content null olan görevleri lesson_block.kitap + başlık '
        'numarası ile eşleyip FK yi geri yazar (kitap yeniden yapılandırması sonrası).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--book-id', type=int, default=None, help='Yalnızca bu kitap')
        parser.add_argument('--dry-run', action='store_true', help='Yazmadan say')

    def handle(self, *args, **options):
        result = remap_orphan_assignment_contents(
            book_id=options.get('book_id'),
            dry_run=bool(options.get('dry_run')),
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"remapped={result['remapped']} skipped={result['skipped']} "
                f"dry_run={result['dry_run']}"
            )
        )
        for sample in result.get('samples') or []:
            self.stdout.write(
                f"  task={sample['task_id']} {sample['title']} → content={sample['content_id']}"
            )
