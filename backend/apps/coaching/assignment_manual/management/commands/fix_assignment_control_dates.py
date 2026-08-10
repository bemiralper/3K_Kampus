"""
Ödev kontrol günlerini verilme tarihine göre yeniden ayarla.

Kural: kontrol = verilme günü + 7 (aynı hafta günü), yerel 23:59.

Kullanım:
  # Önizleme
  python manage.py fix_assignment_control_dates
  # Uygula
  python manage.py fix_assignment_control_dates --apply
  # Kurum filtresi
  python manage.py fix_assignment_control_dates --kurum-id=2 --apply
"""
from __future__ import annotations

from datetime import datetime, time, timedelta

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.coaching.assignment_manual.models import ManualAssignment


def _local_date(dt):
    if dt is None:
        return None
    if timezone.is_aware(dt):
        return timezone.localtime(dt).date()
    return dt.date()


def expected_control_datetime(assigned_dt):
    """Verilme anından yerel takvim günü + 7 → 23:59 (aware)."""
    ad = _local_date(assigned_dt)
    if ad is None:
        return None
    control_day = ad + timedelta(days=7)
    naive = datetime.combine(control_day, time(23, 59, 0))
    tz = timezone.get_current_timezone()
    return timezone.make_aware(naive, tz) if timezone.is_naive(naive) else naive


class Command(BaseCommand):
    help = 'Ödev kontrol (due_date) = verilme (assigned_date) + 7 gün'

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Değişiklikleri kaydet (yoksa dry-run)',
        )
        parser.add_argument(
            '--kurum-id',
            type=int,
            default=None,
            help='Sadece bu kurumun öğrencilerine ait ödevler',
        )
        parser.add_argument(
            '--include-completed',
            action='store_true',
            help='COMPLETED ödevleri de güncelle (varsayılan: hayır)',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='En fazla N kayıt güncelle (0 = hepsi)',
        )

    def handle(self, *args, **options):
        apply = options['apply']
        kurum_id = options['kurum_id']
        include_completed = options['include_completed']
        limit = options['limit']

        qs = ManualAssignment.objects.exclude(assigned_date__isnull=True).select_related(
            'student', 'coach',
        ).order_by('id')

        if not include_completed:
            qs = qs.exclude(status=ManualAssignment.Status.COMPLETED)

        if kurum_id is not None:
            qs = qs.filter(
                Q(student__kurum_id=kurum_id) | Q(coach__kurum_id=kurum_id)
            )

        scanned = 0
        would_change = 0
        changed = 0
        skipped_no_base = 0

        self.stdout.write(
            self.style.NOTICE(
                f'Mod: {"APPLY" if apply else "DRY-RUN"} | '
                f'completed={"dahil" if include_completed else "hariç"} | '
                f'kurum={kurum_id or "tümü"}'
            )
        )

        for a in qs.iterator(chunk_size=200):
            scanned += 1
            new_due = expected_control_datetime(a.assigned_date)
            if new_due is None:
                skipped_no_base += 1
                continue

            old_day = _local_date(a.due_date)
            new_day = _local_date(new_due)
            if old_day == new_day:
                continue

            would_change += 1
            ad = _local_date(a.assigned_date)
            title = (a.title or '')[:50]
            self.stdout.write(
                f'  #{a.id} student={a.student_id} '
                f'verilme={ad} due={old_day} → {new_day} | {title}'
            )

            if apply:
                update_fields = ['due_date', 'updated_at']
                a.due_date = new_due
                # İlk teslim kaydı yoksa veya önceki due ile aynıysa orijinali de hizala
                if not a.original_due_date or _local_date(a.original_due_date) == old_day:
                    a.original_due_date = new_due
                    update_fields.append('original_due_date')
                a.save(update_fields=update_fields)
                changed += 1

            if limit and would_change >= limit:
                break

        self.stdout.write('')
        self.stdout.write(f'Taranan: {scanned}')
        self.stdout.write(f'Uyumsuz (güncellenecek): {would_change}')
        if apply:
            self.stdout.write(self.style.SUCCESS(f'Güncellenen: {changed}'))
        else:
            self.stdout.write(
                self.style.WARNING('Dry-run — kaydetmek için --apply ekleyin')
            )
        if skipped_no_base:
            self.stdout.write(f'Atlanan (verilme yok): {skipped_no_base}')
