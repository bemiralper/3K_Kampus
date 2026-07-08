"""Eksik tahsilat bakiye hareketlerini oluşturur (mali hesap bakiyesine yansımayan kayıtlar)."""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Tahsilat


class Command(BaseCommand):
    help = (
        'Aktif tahsilat kayıtlarında bakiye_hareketi eksikse mali hesap hareketi oluşturur. '
        'Dry-run ile önce kontrol edin.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--kurum-id', type=int, default=None, help='Yalnızca belirli kurum')
        parser.add_argument('--sube-id', type=int, default=None, help='Yalnızca belirli şube')
        parser.add_argument('--tahsilat-id', type=int, default=None, help='Tek tahsilat kaydı')
        parser.add_argument('--mali-hesap-id', type=int, default=None, help='Manuel mali hesap (tahsilat-id ile)')
        parser.add_argument('--dry-run', action='store_true', help='Değişiklik yapmadan raporla')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        kurum_id = options['kurum_id']
        sube_id = options['sube_id']
        tahsilat_id = options['tahsilat_id']
        manual_mali_hesap_id = options['mali_hesap_id']
        bakiye_service = BakiyeHareketiService()

        if tahsilat_id and manual_mali_hesap_id:
            pass  # manuel override
        elif tahsilat_id:
            pass  # tahsilat kaydından çözümlenir

        qs = Tahsilat.objects.filter(
            durum=TahsilatDurum.AKTIF,
            bakiye_hareketi_id__isnull=True,
        ).exclude(
            tahsilat_turu=TahsilatTuru.MAHSUP,
        ).select_related('sozlesme', 'odeme_yontemi', 'mali_hesap')

        if tahsilat_id:
            qs = qs.filter(id=tahsilat_id)
        if kurum_id:
            qs = qs.filter(sozlesme__kurum_id=kurum_id)
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)

        created = 0
        skipped = 0

        for tahsilat in qs.order_by('id'):
            mali_hesap_id = manual_mali_hesap_id or self._resolve_mali_hesap_id(tahsilat)
            if not mali_hesap_id:
                skipped += 1
                self.stdout.write(
                    self.style.WARNING(
                        f'  ATLANDI #{tahsilat.id} — mali hesap belirlenemedi '
                        f'({tahsilat.tutar} TL, {tahsilat.tahsilat_tarihi})'
                    )
                )
                continue

            if dry_run:
                created += 1
                self.stdout.write(
                    f'  [dry-run] #{tahsilat.id} → mali_hesap={mali_hesap_id}, '
                    f'tutar={tahsilat.tutar} TL'
                )
                continue

            with transaction.atomic():
                hareket = bakiye_service.tahsilat_giris(
                    mali_hesap_id=mali_hesap_id,
                    kurum_id=tahsilat.sozlesme.kurum_id,
                    sube_id=tahsilat.sozlesme.sube_id,
                    egitim_yili_id=tahsilat.sozlesme.egitim_yili_id,
                    tutar=int(tahsilat.tutar or 0),
                    islem_tarihi=tahsilat.tahsilat_tarihi,
                    tahsilat_id=tahsilat.pk,
                    aciklama=f'Tahsilat: {tahsilat.sozlesme.sozlesme_no} (geri dönük senkron)',
                    islem_yapan=tahsilat.islem_yapan,
                )
                tahsilat.mali_hesap_id = mali_hesap_id
                tahsilat.bakiye_hareketi_id = hareket.pk
                tahsilat.save(update_fields=['mali_hesap_id', 'bakiye_hareketi_id'])
                created += 1
                self.stdout.write(
                    f'  ✓ #{tahsilat.id} → mali_hesap={mali_hesap_id}, hareket={hareket.pk}'
                )

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'{prefix}✓ {created} tahsilat için bakiye hareketi '
            f'{"oluşturulacak" if dry_run else "oluşturuldu"}, '
            f'{skipped} atlandı'
        ))

    @staticmethod
    def _resolve_mali_hesap_id(tahsilat):
        if tahsilat.mali_hesap_id:
            return tahsilat.mali_hesap_id
        if tahsilat.odeme_yontemi_id and tahsilat.odeme_yontemi and tahsilat.odeme_yontemi.mali_hesap_id:
            return tahsilat.odeme_yontemi.mali_hesap_id
        if tahsilat.sozlesme_id and tahsilat.sozlesme.mali_hesap_id:
            return tahsilat.sozlesme.mali_hesap_id
        return None
