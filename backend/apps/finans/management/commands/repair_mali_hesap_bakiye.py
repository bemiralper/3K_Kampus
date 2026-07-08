"""
Mali hesap bakiye zincirini onarır.

Senaryo: Tahsilat kasaya yansımadan iptal edildiğinde TAHSILAT_IPTAL çıkışı
oluşur ve bakiye hatalı borçlanır. Bu komut yetim iptal hareketlerini bulur,
telafi MANUEL giriş yazar ve bakiye_oncesi/sonrasi zincirini yeniden hesaplar.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository


class Command(BaseCommand):
    help = 'Mali hesap bakiye zincirini onar (yetim tahsilat iptali + zincir yeniden hesap)'

    def add_arguments(self, parser):
        parser.add_argument('--mali-hesap-id', type=int, required=True)
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--fix-orphan-iptal',
            action='store_true',
            help='Girişi olmayan tahsilat iptal çıkışları için MANUEL telafi girişi ekle',
        )
        parser.add_argument(
            '--rebuild-chain',
            action='store_true',
            help='Tüm hareketlerin bakiye_oncesi/sonrasi değerlerini kronolojik yeniden hesapla',
        )
        parser.add_argument('--list', action='store_true', help='Hareketleri ve son bakiyeyi listele')

    def handle(self, *args, **options):
        mali_hesap_id = options['mali_hesap_id']
        dry_run = options['dry_run']

        hesap = MaliHesap.objects.filter(id=mali_hesap_id, silindi_mi=False).first()
        if not hesap:
            self.stderr.write(self.style.ERROR(f'Mali hesap bulunamadı: {mali_hesap_id}'))
            return

        self.stdout.write(f'Mali Hesap: {hesap.ad} (id={hesap.id}, şube={hesap.sube_id})')
        self.stdout.write(f'Son bakiye (mevcut): {BakiyeHareketiRepository.son_bakiye(mali_hesap_id):,} TL')

        if options['list'] or (not options['fix_orphan_iptal'] and not options['rebuild_chain']):
            self._list_hareketler(mali_hesap_id)
            self._list_orphan_iptal(mali_hesap_id)

        if options['fix_orphan_iptal']:
            self._fix_orphan_iptal(hesap, dry_run)

        if options['rebuild_chain']:
            self._rebuild_chain(mali_hesap_id, dry_run)

        if options['fix_orphan_iptal'] or options['rebuild_chain']:
            self.stdout.write(
                self.style.SUCCESS(
                    f'Son bakiye (güncel): {BakiyeHareketiRepository.son_bakiye(mali_hesap_id):,} TL'
                )
            )

    def _list_hareketler(self, mali_hesap_id):
        hareketler = BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
        ).order_by('islem_tarihi', 'created_at', 'id')
        self.stdout.write(f'\n--- Hareketler ({hareketler.count()}) ---')
        for h in hareketler:
            sign = '+' if h.yon == HareketYonu.GIRIS else '-'
            self.stdout.write(
                f'  #{h.id} {h.islem_tarihi} {sign}{h.tutar:,} '
                f'[{h.kaynak}] bakiye={h.bakiye_sonrasi:,} '
                f'kaynak={h.kaynak_tip}:{h.kaynak_id} — {h.aciklama[:60]}'
            )

    def _list_orphan_iptal(self, mali_hesap_id):
        orphans = self._orphan_iptal_qs(mali_hesap_id)
        self.stdout.write(f'\n--- Yetim Tahsilat İptal ({orphans.count()}) ---')
        for h in orphans:
            self.stdout.write(
                f'  #{h.id} -{h.tutar:,} TL tahsilat_id={h.kaynak_id} ({h.aciklama[:50]})'
            )

    def _orphan_iptal_qs(self, mali_hesap_id):
        iptaller = BakiyeHareketi.objects.filter(
            mali_hesap_id=mali_hesap_id,
            kaynak=HareketKaynagi.TAHSILAT_IPTAL,
            kaynak_tip='tahsilat',
            yon=HareketYonu.CIKIS,
        )
        orphan_ids = []
        for h in iptaller:
            has_giris = BakiyeHareketi.objects.filter(
                mali_hesap_id=mali_hesap_id,
                kaynak=HareketKaynagi.TAHSILAT,
                kaynak_tip='tahsilat',
                kaynak_id=h.kaynak_id,
                yon=HareketYonu.GIRIS,
            ).exists()
            if not has_giris:
                orphan_ids.append(h.id)
        return BakiyeHareketi.objects.filter(id__in=orphan_ids).order_by('islem_tarihi', 'created_at')

    @transaction.atomic
    def _fix_orphan_iptal(self, hesap, dry_run):
        orphans = self._orphan_iptal_qs(hesap.id)
        if not orphans.exists():
            self.stdout.write(self.style.SUCCESS('Yetim tahsilat iptali yok.'))
            return

        bakiye_service = BakiyeHareketiService()
        today = timezone.localdate()
        toplam = 0

        for h in orphans:
            toplam += int(h.tutar or 0)
            msg = (
                f'  Telafi girişi +{h.tutar:,} TL '
                f'(yetim iptal #{h.id}, tahsilat #{h.kaynak_id})'
            )
            if dry_run:
                self.stdout.write(f'[dry-run] {msg}')
                continue

            sample = BakiyeHareketi.objects.filter(mali_hesap_id=hesap.id).first()
            bakiye_service.hareket_olustur(
                mali_hesap_id=hesap.id,
                kurum_id=sample.kurum_id if sample else hesap.sube.kurum_id,
                sube_id=hesap.sube_id,
                egitim_yili_id=sample.egitim_yili_id if sample else None,
                yon=HareketYonu.GIRIS,
                tutar=int(h.tutar),
                kaynak=HareketKaynagi.MANUEL,
                islem_tarihi=today,
                kaynak_tip='duzeltme',
                kaynak_id=h.id,
                aciklama=(
                    f'Telafi: girişi olmayan tahsilat iptali düzeltmesi '
                    f'(iptal hareket #{h.id}, tahsilat #{h.kaynak_id})'
                ),
            )
            self.stdout.write(self.style.SUCCESS(msg))

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(f'{prefix}Toplam telafi: +{toplam:,} TL'))

    @transaction.atomic
    def _rebuild_chain(self, mali_hesap_id, dry_run):
        hareketler = list(
            BakiyeHareketi.objects.filter(mali_hesap_id=mali_hesap_id)
            .order_by('islem_tarihi', 'created_at', 'id')
        )
        if not hareketler:
            self.stdout.write('Hareket yok.')
            return

        bakiye = 0
        updates = []
        for h in hareketler:
            bakiye_oncesi = bakiye
            if h.yon == HareketYonu.GIRIS:
                bakiye_sonrasi = bakiye_oncesi + int(h.tutar)
            else:
                bakiye_sonrasi = bakiye_oncesi - int(h.tutar)
            bakiye = bakiye_sonrasi
            if h.bakiye_oncesi != bakiye_oncesi or h.bakiye_sonrasi != bakiye_sonrasi:
                updates.append((h, bakiye_oncesi, bakiye_sonrasi))

        if not updates:
            self.stdout.write(self.style.SUCCESS('Zincir zaten tutarlı.'))
            return

        self.stdout.write(f'\n--- Zincir yeniden hesap ({len(updates)} kayıt güncellenecek) ---')
        for h, oncesi, sonrasi in updates:
            self.stdout.write(
                f'  #{h.id}: {h.bakiye_oncesi:,}->{oncesi:,}, '
                f'{h.bakiye_sonrasi:,}->{sonrasi:,}'
            )
            if not dry_run:
                h.bakiye_oncesi = oncesi
                h.bakiye_sonrasi = sonrasi
                h.save(update_fields=['bakiye_oncesi', 'bakiye_sonrasi'])

        prefix = '[dry-run] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(f'{prefix}Yeni son bakiye: {bakiye:,} TL'))
