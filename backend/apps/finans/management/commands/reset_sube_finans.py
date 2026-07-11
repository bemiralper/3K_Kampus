"""
Şube bazlı finans temizliği + mali hesap / ödeme yöntemi seed.

Kullanım (Docker):
  python manage.py reset_sube_finans --confirm
  python manage.py reset_sube_finans --confirm --keep-cari
  python manage.py reset_sube_finans --verify-only

İşlem sırası:
1) Tahsilat / sözleşme / gelir-gider / bakiye / çek-senet hareketlerini sil
2) Şube mali hesaplarını ve hesaba bağlı ödeme yöntemlerini soft-delete
3) (opsiyonel) cari hesapları soft-delete + demo cari yaz
4) Her şubeye Kasa + Banka + standart yöntemler seed
5) Kurum plan yöntemleri + çek/senet
6) Checklist doğrulama
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.finans.application.odeme_yontemi_plan_helpers import (
    ensure_kurum_plan_odeme_yontemleri,
    filter_odeme_yontemleri_for_mali_hesap,
)
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import CariHesapTuru
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.donem_bakiye import DonemBakiye
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.gider_taksit import GiderTaksit
from apps.finans.domain.hesap_transferi import HesapTransferi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.cek_senet import CekSenetDetay
from apps.odeme_takip.domain.models import (
    Sozlesme,
    SozlesmeFesih,
    SozlesmeGecmisi,
    SozlesmeIndirimi,
    SozlesmeKalemi,
    Tahsilat,
    TahsilatDagitim,
    Taksit,
)
from apps.sube.domain.models import Sube


class Command(BaseCommand):
    help = 'Test finans verisini temizler, şube mali hesap + ödeme yöntemlerini kurar.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Silme + seed işlemini çalıştır (zorunlu güvenlik bayrağı).',
        )
        parser.add_argument(
            '--keep-cari',
            action='store_true',
            help='Mevcut carileri silme / yeniden yazma.',
        )
        parser.add_argument(
            '--verify-only',
            action='store_true',
            help='Sadece checklist doğrula, veriye dokunma.',
        )
        parser.add_argument(
            '--kurum-id',
            type=int,
            default=None,
            help='Belirli kurum (varsayılan: tüm kurumlar).',
        )

    def handle(self, *args, **options):
        if options['verify_only']:
            self._verify(options.get('kurum_id'))
            return

        if not options['confirm']:
            raise CommandError(
                'Bu komut tahsilat/sözleşme/gelir-gider siler. '
                'Çalıştırmak için --confirm ekleyin.'
            )

        kurum_id = options.get('kurum_id')
        keep_cari = options['keep_cari']

        with transaction.atomic():
            stats = self._wipe_transactions(kurum_id)
            self.stdout.write(self.style.WARNING(f'Silinmiş hareketler: {stats}'))

            soft = self._soft_delete_definitions(kurum_id, keep_cari=keep_cari)
            self.stdout.write(self.style.WARNING(f'Soft-delete tanımlar: {soft}'))

            seeded = self._seed_accounts_and_methods(kurum_id)
            self.stdout.write(self.style.SUCCESS(f'Seed mali hesap/yöntem: {seeded}'))

            if not keep_cari:
                cari_stats = self._seed_demo_cariler(kurum_id)
                self.stdout.write(self.style.SUCCESS(f'Demo cari: {cari_stats}'))

            kat = self._ensure_minimal_categories(kurum_id)
            self.stdout.write(self.style.SUCCESS(f'Kategori güvence: {kat}'))

            self._ensure_plan_and_cek_senet(kurum_id)

        self._verify(kurum_id)

    # ─── Wipe ─────────────────────────────────────

    def _wipe_transactions(self, kurum_id=None):
        soz_qs = Sozlesme.objects.all()
        if kurum_id:
            soz_qs = soz_qs.filter(kurum_id=kurum_id)
        soz_ids = list(soz_qs.values_list('id', flat=True))

        counts = {}

        def _del(label, qs):
            n, _ = qs.delete()
            counts[label] = n

        if soz_ids:
            _del('tahsilat_dagitim', TahsilatDagitim.objects.filter(tahsilat__sozlesme_id__in=soz_ids))
            _del('tahsilat', Tahsilat.objects.filter(sozlesme_id__in=soz_ids))
            _del('taksit', Taksit.objects.filter(sozlesme_id__in=soz_ids))
            _del('sozlesme_kalem', SozlesmeKalemi.objects.filter(sozlesme_id__in=soz_ids))
            _del('sozlesme_indirim', SozlesmeIndirimi.objects.filter(sozlesme_id__in=soz_ids))
            _del('sozlesme_gecmis', SozlesmeGecmisi.objects.filter(sozlesme_id__in=soz_ids))
            _del('sozlesme_fesih', SozlesmeFesih.objects.filter(sozlesme_id__in=soz_ids))

        cek_qs = CekSenetDetay.objects.all()
        if kurum_id:
            cek_qs = cek_qs.filter(kurum_id=kurum_id)
        _del('cek_senet', cek_qs)

        if soz_ids:
            _del('sozlesme', Sozlesme.objects.filter(id__in=soz_ids))

        gelir_qs = GelirKaydi.objects.all()
        gider_qs = GiderKaydi.objects.all()
        if kurum_id:
            gelir_qs = gelir_qs.filter(kurum_id=kurum_id)
            gider_qs = gider_qs.filter(kurum_id=kurum_id)
        gelir_ids = list(gelir_qs.values_list('id', flat=True))
        gider_ids = list(gider_qs.values_list('id', flat=True))

        if gelir_ids:
            _del('gelir_tahsilat', GelirTahsilat.objects.filter(gelir_kaydi_id__in=gelir_ids))
            _del('gelir', GelirKaydi.objects.filter(id__in=gelir_ids))
        if gider_ids:
            _del('gider_odeme', GiderOdeme.objects.filter(gider_kaydi_id__in=gider_ids))
            _del('gider_taksit', GiderTaksit.objects.filter(gider_kaydi_id__in=gider_ids))
            _del('gider', GiderKaydi.objects.filter(id__in=gider_ids))

        # Bakiye / transfer — şube üzerinden filtre
        sube_ids = list(
            Sube.objects.filter(kurum_id=kurum_id).values_list('id', flat=True)
            if kurum_id else Sube.objects.values_list('id', flat=True)
        )
        mh_ids = list(
            MaliHesap.all_objects.filter(sube_id__in=sube_ids).values_list('id', flat=True)
        )
        if mh_ids:
            _del('hesap_transfer', HesapTransferi.objects.filter(
                models_q_kaynak_or_hedef(mh_ids)
            ))
            _del('bakiye_hareket', BakiyeHareketi.objects.filter(mali_hesap_id__in=mh_ids))
            _del('donem_bakiye', DonemBakiye.objects.filter(mali_hesap_id__in=mh_ids))

        # Orphan tahsilat (şube dışı kalmışsa)
        orphan_tah = Tahsilat.objects.all()
        if kurum_id:
            orphan_tah = orphan_tah.filter(sozlesme__kurum_id=kurum_id)
        if orphan_tah.exists():
            _del('orphan_tahsilat_dagitim', TahsilatDagitim.objects.filter(tahsilat__in=orphan_tah))
            _del('orphan_tahsilat', orphan_tah)

        return counts

    def _soft_delete_definitions(self, kurum_id=None, keep_cari=False):
        now = timezone.now()
        sube_ids = list(
            Sube.objects.filter(kurum_id=kurum_id).values_list('id', flat=True)
            if kurum_id else Sube.objects.values_list('id', flat=True)
        )
        stats = {}

        oy_qs = OdemeYontemi.objects.filter(
            mali_hesap__isnull=False,
            mali_hesap__sube_id__in=sube_ids,
            silindi_mi=False,
        )
        if kurum_id:
            oy_qs = oy_qs.filter(kurum_id=kurum_id)
        stats['odeme_yontemi'] = oy_qs.update(silindi_mi=True, aktif_mi=False, silinme_tarihi=now)

        mh_qs = MaliHesap.objects.filter(sube_id__in=sube_ids, silindi_mi=False)
        stats['mali_hesap'] = mh_qs.update(silindi_mi=True, aktif_mi=False, silinme_tarihi=now)

        if not keep_cari:
            cari_qs = CariHesap.objects.filter(sube_id__in=sube_ids, silindi_mi=False)
            if kurum_id:
                cari_qs = cari_qs.filter(kurum_id=kurum_id)
            stats['cari'] = cari_qs.update(silindi_mi=True, aktif_mi=False, silinme_tarihi=now)

        return stats

    # ─── Seed ─────────────────────────────────────

    def _seed_accounts_and_methods(self, kurum_id=None):
        subeler = Sube.objects.all().select_related('kurum')
        if kurum_id:
            subeler = subeler.filter(kurum_id=kurum_id)

        created = {'mali_hesap': 0, 'odeme_yontemi': 0}
        for sube in subeler:
            kasa, c1 = MaliHesap.objects.get_or_create(
                sube=sube,
                ad=f'{sube.ad} Merkez Kasa',
                defaults={
                    'tip': MaliHesapTipi.KASA,
                    'aktif_mi': True,
                    'siralama': 10,
                    'baslangic_bakiye': Decimal('0'),
                },
            )
            if c1:
                created['mali_hesap'] += 1
            elif kasa.silindi_mi:
                kasa.silindi_mi = False
                kasa.aktif_mi = True
                kasa.silinme_tarihi = None
                kasa.save(update_fields=['silindi_mi', 'aktif_mi', 'silinme_tarihi', 'updated_at'])

            banka, c2 = MaliHesap.objects.get_or_create(
                sube=sube,
                ad=f'{sube.ad} Ana Banka',
                defaults={
                    'tip': MaliHesapTipi.BANKA,
                    'aktif_mi': True,
                    'siralama': 20,
                    'baslangic_bakiye': Decimal('0'),
                    'banka_adi': 'Ana Banka',
                },
            )
            if c2:
                created['mali_hesap'] += 1
            elif banka.silindi_mi:
                banka.silindi_mi = False
                banka.aktif_mi = True
                banka.silinme_tarihi = None
                banka.save(update_fields=['silindi_mi', 'aktif_mi', 'silinme_tarihi', 'updated_at'])

            # Kasa → Nakit
            created['odeme_yontemi'] += self._ensure_method(
                sube.kurum_id, kasa, 'Nakit', OdemeYontemiTipi.NAKIT, 10,
            )
            # Banka → Havale / POS / Online
            created['odeme_yontemi'] += self._ensure_method(
                sube.kurum_id, banka, 'Havale / EFT', OdemeYontemiTipi.HAVALE_EFT, 20,
            )
            created['odeme_yontemi'] += self._ensure_method(
                sube.kurum_id, banka, 'POS', OdemeYontemiTipi.POS, 30,
            )
            created['odeme_yontemi'] += self._ensure_method(
                sube.kurum_id, banka, 'Online Ödeme', OdemeYontemiTipi.ONLINE, 40,
            )

        return created

    def _ensure_method(self, kurum_id, mali_hesap, ad, tip, siralama) -> int:
        existing = (
            OdemeYontemi.objects.filter(
                kurum_id=kurum_id,
                mali_hesap=mali_hesap,
                tip=tip,
                silindi_mi=False,
            ).first()
            or OdemeYontemi.all_objects.filter(
                kurum_id=kurum_id,
                mali_hesap=mali_hesap,
                tip=tip,
            ).order_by('id').first()
        )
        if existing:
            if existing.silindi_mi or not existing.aktif_mi or existing.ad != ad:
                existing.silindi_mi = False
                existing.aktif_mi = True
                existing.silinme_tarihi = None
                existing.ad = ad
                existing.siralama = siralama
                existing.save()
            return 0
        OdemeYontemi.objects.create(
            kurum_id=kurum_id,
            mali_hesap=mali_hesap,
            ad=ad,
            tip=tip,
            aktif_mi=True,
            siralama=siralama,
        )
        return 1

    def _seed_demo_cariler(self, kurum_id=None):
        subeler = Sube.objects.all()
        if kurum_id:
            subeler = subeler.filter(kurum_id=kurum_id)
        created = 0
        for sube in subeler:
            specs = [
                (f'{sube.ad} Demo Tedarikçi', CariHesapTuru.TEDARIKCI, 'TED'),
                (f'{sube.ad} Demo Müşteri', CariHesapTuru.MUSTERI, 'MUS'),
                (f'{sube.ad} Demo Karma', CariHesapTuru.KARMA, 'KRM'),
            ]
            for unvan, tur, kod in specs:
                obj = CariHesap.tum_kayitlar.filter(
                    kurum_id=sube.kurum_id,
                    sube=sube,
                    unvan=unvan,
                ).first()
                if obj:
                    if obj.silindi_mi or not obj.aktif_mi:
                        obj.silindi_mi = False
                        obj.aktif_mi = True
                        obj.silinme_tarihi = None
                        obj.hesap_turu = tur
                        obj.hesap_kodu = f'{kod}-{sube.id}'
                        obj.save()
                        created += 1
                else:
                    CariHesap.objects.create(
                        kurum_id=sube.kurum_id,
                        sube=sube,
                        unvan=unvan,
                        hesap_turu=tur,
                        hesap_kodu=f'{kod}-{sube.id}',
                        aktif_mi=True,
                        kisa_ad=unvan[:40],
                    )
                    created += 1
        return {'created_or_restored': created}

    def _ensure_minimal_categories(self, kurum_id=None):
        """Şube 2 gibi boş şubelerde test için minimal gelir/gider kategorisi."""
        subeler = Sube.objects.all()
        if kurum_id:
            subeler = subeler.filter(kurum_id=kurum_id)
        created = 0
        for sube in subeler:
            if not GelirKategorisi.objects.filter(sube=sube, silindi_mi=False).exists():
                GelirKategorisi.objects.create(
                    kurum_id=sube.kurum_id,
                    sube=sube,
                    ad='Genel Gelirler',
                    aktif_mi=True,
                )
                created += 1
            if not GiderKategorisi.objects.filter(sube=sube, silindi_mi=False).exists():
                GiderKategorisi.objects.create(
                    kurum_id=sube.kurum_id,
                    sube=sube,
                    ad='Genel Giderler',
                    aktif_mi=True,
                )
                created += 1
        return {'created': created}

    def _ensure_plan_and_cek_senet(self, kurum_id=None):
        kurumlar = Kurum.objects.all()
        if kurum_id:
            kurumlar = kurumlar.filter(id=kurum_id)
        for kurum in kurumlar:
            ensure_kurum_plan_odeme_yontemleri(kurum.id)
            for tip, ad in (
                (OdemeYontemiTipi.CEK, 'Çek'),
                (OdemeYontemiTipi.SENET, 'Senet'),
            ):
                exists = OdemeYontemi.objects.filter(
                    kurum_id=kurum.id,
                    tip=tip,
                    mali_hesap__isnull=True,
                    silindi_mi=False,
                ).exists()
                if not exists:
                    OdemeYontemi.objects.create(
                        kurum_id=kurum.id,
                        mali_hesap=None,
                        ad=ad,
                        tip=tip,
                        aktif_mi=True,
                        siralama=90 if tip == OdemeYontemiTipi.CEK else 91,
                    )

    # ─── Verify ───────────────────────────────────

    def _verify(self, kurum_id=None):
        self.stdout.write(self.style.MIGRATE_HEADING('=== Checklist doğrulama ==='))
        ok = True
        subeler = Sube.objects.all().select_related('kurum')
        if kurum_id:
            subeler = subeler.filter(kurum_id=kurum_id)

        for sube in subeler:
            mh = list(MaliHesap.objects.filter(sube=sube, aktif_mi=True, silindi_mi=False))
            if len(mh) < 2:
                self.stdout.write(self.style.ERROR(
                    f'[FAIL] {sube.ad}: en az 2 mali hesap bekleniyor, bulunan={len(mh)}'
                ))
                ok = False
            else:
                self.stdout.write(self.style.SUCCESS(
                    f'[OK] {sube.ad}: {len(mh)} mali hesap — '
                    + ', '.join(f'{m.ad}({m.tip})' for m in mh)
                ))

            for m in mh:
                qs = OdemeYontemi.objects.filter(
                    kurum_id=sube.kurum_id, aktif_mi=True, silindi_mi=False,
                )
                filtered = filter_odeme_yontemleri_for_mali_hesap(
                    qs, m.id, kurum_id=sube.kurum_id,
                )
                linked = list(filtered.filter(mali_hesap_id=m.id))
                plan_std = list(filtered.filter(
                    mali_hesap__isnull=True,
                    tip__in=[
                        OdemeYontemiTipi.NAKIT,
                        OdemeYontemiTipi.HAVALE_EFT,
                        OdemeYontemiTipi.POS,
                        OdemeYontemiTipi.ONLINE,
                    ],
                ))
                if plan_std:
                    self.stdout.write(self.style.ERROR(
                        f'[FAIL] {sube.ad}/{m.ad}: dropdown\'da kurum plan kanoniği var: '
                        + ', '.join(p.ad for p in plan_std)
                    ))
                    ok = False
                elif not linked:
                    self.stdout.write(self.style.ERROR(
                        f'[FAIL] {sube.ad}/{m.ad}: hesaba bağlı ödeme yöntemi yok'
                    ))
                    ok = False
                else:
                    tips = [x.tip for x in linked]
                    self.stdout.write(self.style.SUCCESS(
                        f'[OK] {sube.ad}/{m.ad}: yöntemler={tips} (plan kanoniği yok)'
                    ))

            # Şube izolasyonu: başka şubenin hesabı bu şube listesinde olmamalı
            foreign = MaliHesap.objects.filter(
                aktif_mi=True, silindi_mi=False,
            ).exclude(sube_id=sube.id)
            # sadece kontrol notu — API zaten filtreler
            self.stdout.write(
                f'  (bilgi) diğer şube hesap sayısı={foreign.count()} — API şube filtresi ile gizlenir'
            )

        # Hareket sayıları
        soz = Sozlesme.objects.all()
        tah = Tahsilat.objects.all()
        gelir = GelirKaydi.objects.all()
        gider = GiderKaydi.objects.all()
        if kurum_id:
            soz = soz.filter(kurum_id=kurum_id)
            tah = tah.filter(sozlesme__kurum_id=kurum_id)
            gelir = gelir.filter(kurum_id=kurum_id)
            gider = gider.filter(kurum_id=kurum_id)
        self.stdout.write(
            f'Hareketler → sözleşme={soz.count()} tahsilat={tah.count()} '
            f'gelir={gelir.count()} gider={gider.count()}'
        )

        if ok:
            self.stdout.write(self.style.SUCCESS('Checklist: TÜM KONTROLLER GEÇTİ'))
        else:
            raise CommandError('Checklist: bazı kontroller başarısız')


def models_q_kaynak_or_hedef(mh_ids):
    from django.db.models import Q
    return Q(kaynak_hesap_id__in=mh_ids) | Q(hedef_hesap_id__in=mh_ids)
