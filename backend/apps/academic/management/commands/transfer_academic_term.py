"""
Yaz kursu / yanlış dönemdeki sınıf + plan + programı başka döneme kopyala veya taşı.

Örnek (önce sayıları gör):
  python manage.py transfer_academic_term --list --kurum keşif

  python manage.py transfer_academic_term \\
    --from-term-id 12 --to-term-id 18 --dry-run

  python manage.py transfer_academic_term \\
    --from-term-id 12 --to-term-id 18 --mode copy
"""
from django.core.management.base import BaseCommand, CommandError

from apps.academic.services.term_plan_transfer_service import (
    TermPlanTransferError,
    list_academic_inventory,
    resolve_term,
    transfer_term_plans,
)


class Command(BaseCommand):
    help = 'Sınıf, ders planı ve ders programını bir eğitim döneminden diğerine kopyalar/taşır.'

    def add_arguments(self, parser):
        parser.add_argument('--list', action='store_true', help='Kurum/dönem envanterini yaz')
        parser.add_argument('--kurum', default='', help='Kurum adı veya kodu (list / çözümleme)')
        parser.add_argument('--from-term-id', type=int)
        parser.add_argument('--to-term-id', type=int)
        parser.add_argument('--from-year', type=int, help='Kaynak yıl başlangıcı, örn. 2025')
        parser.add_argument('--to-year', type=int, help='Hedef yıl başlangıcı, örn. 2026')
        parser.add_argument('--from-term-name', default='', help='Kaynak dönem adı (contains)')
        parser.add_argument('--to-term-name', default='', help='Hedef dönem adı (contains)')
        parser.add_argument('--from-term-type', default='', help='regular / summer / camp')
        parser.add_argument('--to-term-type', default='', help='regular / summer / camp')
        parser.add_argument('--mode', choices=('copy', 'move'), default='copy')
        parser.add_argument('--no-program', action='store_true', help='Ders programı hücrelerini alma')
        parser.add_argument(
            '--include-students',
            action='store_true',
            help='Taşımada öğrenci yerleşimini de hedef döneme al (kopyada yok)',
        )
        parser.add_argument('--dry-run', action='store_true', help='Yazmadan sayıları göster')
        parser.add_argument('--apply', action='store_true', help='Gerçekten yaz (dry-run değil)')

    def handle(self, *args, **options):
        if options['list']:
            self._print_inventory(options.get('kurum') or '')
            return

        dry_run = not options['apply']
        if options['dry_run']:
            dry_run = True

        try:
            kurum_id = None
            if options.get('kurum'):
                from apps.kurum.domain.models import Kurum
                k = (
                    Kurum.objects.filter(ad__icontains=options['kurum']).first()
                    or Kurum.objects.filter(kod__icontains=options['kurum']).first()
                )
                if not k:
                    raise CommandError(f"Kurum bulunamadı: {options['kurum']}")
                kurum_id = k.id

            source = resolve_term(
                term_id=options.get('from_term_id'),
                kurum_id=kurum_id,
                year_start=options.get('from_year'),
                term_name=options.get('from_term_name') or None,
                term_type=options.get('from_term_type') or None,
            )
            target = resolve_term(
                term_id=options.get('to_term_id'),
                kurum_id=kurum_id,
                year_start=options.get('to_year'),
                term_name=options.get('to_term_name') or None,
                term_type=options.get('to_term_type') or None,
            )
            report = transfer_term_plans(
                source_term=source,
                target_term=target,
                mode=options['mode'],
                include_program=not options['no_program'],
                include_students=options['include_students'],
                dry_run=dry_run,
            )
        except TermPlanTransferError as exc:
            raise CommandError(str(exc)) from exc

        label = 'DRY-RUN' if report.dry_run else 'UYGULANDI'
        self.stdout.write(self.style.NOTICE(
            f'[{label}] {report.mode}: dönem {report.source_term_id} → {report.target_term_id}'
        ))
        self.stdout.write(
            f"  kaynak: {source.kurum.ad} / {source.sube.ad} / "
            f"{source.egitim_yili.yil_str} / {source.name}"
        )
        self.stdout.write(
            f"  hedef:  {target.kurum.ad} / {target.sube.ad} / "
            f"{target.egitim_yili.yil_str} / {target.name}"
        )
        self.stdout.write(
            f"  sınıflar kopya={report.classrooms_copied} taşı={report.classrooms_moved} "
            f"atlanan={report.classrooms_skipped}"
        )
        self.stdout.write(
            f"  planlar kopya={report.plans_copied} taşı={report.plans_moved} "
            f"grup={report.groups_copied} atama={report.assignments_copied}"
        )
        self.stdout.write(
            f"  program versiyon kopya={report.versions_copied} taşı={report.versions_moved} "
            f"hücre={report.cells_copied}"
        )
        for note in report.skipped:
            self.stdout.write(self.style.WARNING(f'  - {note}'))
        if report.dry_run:
            self.stdout.write(self.style.WARNING(
                'Yazılmadı. Onaylıyorsan aynı komuta --apply ekle.'
            ))

    def _print_inventory(self, kurum_query: str) -> None:
        rows = list_academic_inventory(kurum_query)
        if not rows:
            self.stdout.write('Kayıt yok.')
            return
        self.stdout.write(
            f"{'kurum':<22} {'şube':<16} {'yıl':<11} {'dönem_id':>8} "
            f"{'dönem':<22} {'tip':<8} {'sınıf':>5} {'plan':>5} {'prg':>4} {'dolu':>5}"
        )
        for row in rows:
            self.stdout.write(
                f"{row['kurum_ad'][:21]:<22} {row['sube_ad'][:15]:<16} "
                f"{row['year']:<11} {row['term_id']:>8} {row['term_name'][:21]:<22} "
                f"{row['term_type']:<8} {row['classrooms']:>5} {row['plans']:>5} "
                f"{row['versions']:>4} {row['filled_cells']:>5}"
            )
