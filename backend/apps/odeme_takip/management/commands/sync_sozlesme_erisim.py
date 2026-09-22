"""
Aktif sözleşmelerde faturaya yazılmış ama öğrenciye açılmamış hizmet ve dersleri tamamlar.

Kullanım:
    python manage.py sync_sozlesme_erisim --dry-run
    python manage.py sync_sozlesme_erisim
"""
from django.core.management.base import BaseCommand

from apps.odeme_takip.application.services.sozlesme_erisim_sync import (
    GRANTING_DURUMLAR,
    sync_sozlesme_erisim,
)
from apps.odeme_takip.domain.models import Sozlesme


class Command(BaseCommand):
    help = 'Sözleşmeye sonradan eklenen hizmet ve derslerin erişim kayıtlarını açar'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Kayıt yazmadan eksikleri listele',
        )
        parser.add_argument('--kurum-id', type=int, default=None)

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        qs = Sozlesme.objects.filter(durum__in=GRANTING_DURUMLAR).order_by('id')
        if options['kurum_id']:
            qs = qs.filter(kurum_id=options['kurum_id'])

        ogrenci_sayisi = 0
        ek_hizmet = 0
        paket = 0
        for sozlesme in qs.iterator():
            result = sync_sozlesme_erisim(sozlesme, dry_run=dry_run)
            if result['skipped']:
                continue
            if not result['created_ek_hizmet'] and not result['created_paket']:
                continue
            ogrenci_sayisi += 1
            ek_hizmet += len(result['created_ek_hizmet'])
            paket += len(result['created_paket'])
            self.stdout.write(
                f"{sozlesme.sozlesme_no} öğrenci={sozlesme.ogrenci_id} "
                f"hizmet={', '.join(result['created_ek_hizmet']) or '-'} "
                f"paket={', '.join(result['created_paket']) or '-'}"
            )

        eylem = 'açılacak' if dry_run else 'açıldı'
        self.stdout.write(self.style.SUCCESS(
            f"{ogrenci_sayisi} sözleşmede {ek_hizmet} hizmet ve {paket} paket {eylem}."
        ))
