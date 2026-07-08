"""
Tüm mali hesaplar için teşhis + onarım (tahsilat senkronu, yetim iptal, zincir yenileme).
Sunucuda tek komutla çalıştırılabilir.
"""
from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Tahsilat


class Command(BaseCommand):
    help = (
        'Tüm mali hesapları teşhis eder; eksik tahsilat hareketlerini senkronlar '
        've bakiye zincirini onarır.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None)
        parser.add_argument('--sube-id', type=int, default=None)
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--diagnose-only',
            action='store_true',
            help='Yalnızca raporla, onarım yapma',
        )

    def handle(self, *args, **options):
        kurum_id = options['kurum_id']
        sube_id = options['sube_id']
        dry_run = options['dry_run']
        diagnose_only = options['diagnose_only']

        hesap_qs = MaliHesap.objects.filter(aktif_mi=True).select_related('sube')
        if kurum_id:
            hesap_qs = hesap_qs.filter(sube__kurum_id=kurum_id)
        if sube_id:
            hesap_qs = hesap_qs.filter(sube_id=sube_id)

        hesaplar = list(hesap_qs.order_by('sube_id', 'siralama', 'id'))
        if not hesaplar:
            self.stdout.write(self.style.WARNING('Mali hesap bulunamadı.'))
            return

        self.stdout.write(self.style.MIGRATE_HEADING('=== Mali Hesap Teşhisi ==='))
        for hesap in hesaplar:
            son = BakiyeHareketiRepository.son_bakiye(hesap.id)
            giris = BakiyeHareketi.objects.filter(
                mali_hesap_id=hesap.id, yon='giris',
            ).count()
            cikis = BakiyeHareketi.objects.filter(
                mali_hesap_id=hesap.id, yon='cikis',
            ).count()
            self.stdout.write(
                f'  [{hesap.id}] {hesap.ad} ({hesap.tip}) — '
                f'bakiye={son:,} TL, giriş={giris}, çıkış={cikis}'
            )

        tahsilat_qs = Tahsilat.objects.filter(
            durum=TahsilatDurum.AKTIF,
            bakiye_hareketi_id__isnull=True,
        ).exclude(tahsilat_turu=TahsilatTuru.MAHSUP)
        if kurum_id:
            tahsilat_qs = tahsilat_qs.filter(sozlesme__kurum_id=kurum_id)
        if sube_id:
            tahsilat_qs = tahsilat_qs.filter(sozlesme__sube_id=sube_id)

        eksik = tahsilat_qs.count()
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('=== Eksik Bakiye Hareketi ==='))
        self.stdout.write(f'  Bakiye hareketi olmayan aktif tahsilat: {eksik}')
        if eksik:
            for t in tahsilat_qs.select_related('sozlesme', 'odeme_yontemi')[:20]:
                self.stdout.write(
                    f'    #{t.id} {t.tutar} TL — mali={t.mali_hesap_id}, '
                    f'yontem={t.odeme_yontemi.ad if t.odeme_yontemi else "?"}'
                )
            if eksik > 20:
                self.stdout.write(f'    … ve {eksik - 20} kayıt daha')

        if diagnose_only:
            return

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('=== Tahsilat Senkronu ==='))
        sync_args = []
        if kurum_id:
            sync_args += ['--kurum-id', str(kurum_id)]
        if sube_id:
            sync_args += ['--sube-id', str(sube_id)]
        if dry_run:
            sync_args.append('--dry-run')
        call_command('sync_tahsilat_bakiye_hareketleri', *sync_args)

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('=== Mali Hesap Onarımı ==='))
        for hesap in hesaplar:
            self.stdout.write(f'  → {hesap.ad} (id={hesap.id})')
            repair_args = ['--mali-hesap-id', str(hesap.id)]
            if dry_run:
                repair_args.append('--dry-run')
            call_command(
                'repair_mali_hesap_bakiye',
                *repair_args,
                '--fix-orphan-iptal',
            )
            call_command(
                'repair_mali_hesap_bakiye',
                *repair_args,
                '--rebuild-chain',
            )

        self.stdout.write(self.style.SUCCESS('Tamamlandı.'))
