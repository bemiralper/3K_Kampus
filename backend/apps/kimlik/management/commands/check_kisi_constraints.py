"""Kisi tablosunda unique constraint öncesi doğrulama."""
from django.core.management.base import BaseCommand
from django.db.models import Count

from apps.kimlik.domain.models import Kisi
from apps.kimlik.management.commands.backfill_kisi import collect_conflicts


class Command(BaseCommand):
    help = 'Kisi unique constraint uygulanmadan önce çakışmaları kontrol eder.'

    def handle(self, *args, **options):
        cross_conflicts = collect_conflicts(dry_run=True)
        self.stdout.write(f'Cross-entity çakışmalar: {len(cross_conflicts)}')

        tc_dupes = (
            Kisi.objects.exclude(tc_kimlik_no__isnull=True)
            .values('kurum_id', 'tc_kimlik_no')
            .annotate(c=Count('id'))
            .filter(c__gt=1)
        )
        tel_dupes = (
            Kisi.objects.exclude(telefon='')
            .values('kurum_id', 'telefon')
            .annotate(c=Count('id'))
            .filter(c__gt=1)
        )

        tc_count = tc_dupes.count()
        tel_count = tel_dupes.count()

        if tc_count:
            self.stdout.write(self.style.ERROR(f'Kisi TC duplicate grupları: {tc_count}'))
            for row in tc_dupes[:10]:
                self.stdout.write(f"  kurum={row['kurum_id']} tc={row['tc_kimlik_no']} count={row['c']}")

        if tel_count:
            self.stdout.write(self.style.ERROR(f'Kisi telefon duplicate grupları: {tel_count}'))
            for row in tel_dupes[:10]:
                self.stdout.write(f"  kurum={row['kurum_id']} tel={row['telefon']} count={row['c']}")

        if cross_conflicts:
            self.stdout.write(self.style.WARNING('Cross-entity çakışma örnekleri:'))
            for item in cross_conflicts[:5]:
                self.stdout.write(f"  {item.get('tip')} tc={item.get('tc')} tel={item.get('telefon')}")

        ready = tc_count == 0 and tel_count == 0
        if ready and not cross_conflicts:
            self.stdout.write(self.style.SUCCESS('Phase 5 constraint migration için hazır.'))
        else:
            self.stdout.write(self.style.WARNING(
                'Constraint migration öncesi backfill/ manuel birleştirme gerekli. '
                'backfill_kisi --report=... çalıştırın.'
            ))
