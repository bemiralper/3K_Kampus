"""
Şube finans smoke test — reset_sube_finans sonrası doğrulama.

Kullanım (Docker / local DB):
  python manage.py e2e_sube_finans_smoke
  python manage.py e2e_sube_finans_smoke --sube-id=1
  python manage.py e2e_sube_finans_smoke --kurum-id=2 --sube-id=2

Varsayılan: kurum_id=2, tüm şubeler.
Oluşturulan kayıtların açıklamasında [E2E-SMOKE] etiketi vardır.
Mevcut veriyi silmez (yalnızca kendi smoke kayıtlarını ekler).
Başarısızlıkta exit code != 0.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.finans.application.cari_hesap_service import CariHesapService
from apps.finans.application.cek_senet.cek_senet_helpers import cek_senet_v2_enabled
from apps.finans.application.cek_senet.cek_senet_service import CekSenetService
from apps.finans.application.gelir_service import GelirService
from apps.finans.application.gelir_tahsilat_service import GelirTahsilatService
from apps.finans.application.gider_odeme_service import GiderOdemeService
from apps.finans.application.gider_service import GiderService
from apps.finans.application.odeme_yontemi_plan_helpers import (
    STANDARD_PLAN_TIPS,
    filter_odeme_yontemleri_for_mali_hesap,
)
from apps.finans.application.selectors.bakiye_hareketi_selector import BakiyeHareketiSelector
from apps.finans.application.selectors.financial_account_selector import MaliHesapSelector
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import CariHesapTuru
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

SMOKE_TAG = '[E2E-SMOKE]'
DEFAULT_KURUM_ID = 2
GELIR_TUTAR = Decimal('150.00')
GIDER_TUTAR = Decimal('75.00')
SOZLESME_TAHSILAT = 50  # integer-only (TL)


@dataclass
class CheckResult:
    name: str
    status: str  # PASS | FAIL | SKIP
    detail: str = ''
    sube_id: int | None = None


@dataclass
class SmokeContext:
    kurum: Kurum
    sube: Sube
    user: object
    today: object
    mali_hesaplar: list = field(default_factory=list)
    kasa: MaliHesap | None = None
    kasa_yontem: OdemeYontemi | None = None
    musteri: CariHesap | None = None
    tedarikci: CariHesap | None = None
    gelir_kat: GelirKategorisi | None = None
    gider_kat: GiderKategorisi | None = None
    created_hareket_ids: list[int] = field(default_factory=list)


class Command(BaseCommand):
    help = (
        'Kurum şubelerinde gelir/gider tahsilat-ödeme + ödeme yöntemi filtresi '
        '+ şube izolasyonu smoke testi ([E2E-SMOKE] etiketli kayıtlar).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--kurum-id',
            type=int,
            default=DEFAULT_KURUM_ID,
            help=f'Kurum ID (varsayılan: {DEFAULT_KURUM_ID}).',
        )
        parser.add_argument(
            '--sube-id',
            type=int,
            default=None,
            help='Tek şube (varsayılan: kurumun tüm şubeleri).',
        )

    def handle(self, *args, **options):
        kurum_id = options['kurum_id']
        sube_id = options.get('sube_id')

        kurum = Kurum.objects.filter(pk=kurum_id).first()
        if not kurum:
            raise CommandError(f'Kurum bulunamadı: id={kurum_id}')

        subeler = list(
            Sube.objects.filter(kurum_id=kurum_id).order_by('id')
        )
        if sube_id is not None:
            subeler = [s for s in subeler if s.id == sube_id]
            if not subeler:
                raise CommandError(
                    f'Şube bulunamadı: id={sube_id} (kurum={kurum_id})'
                )

        if not subeler:
            raise CommandError(f'Kurum {kurum_id} için şube yok.')

        user = (
            get_user_model().objects.filter(is_superuser=True, is_active=True).first()
            or get_user_model().objects.filter(is_active=True).first()
        )
        if not user:
            raise CommandError('Aktif kullanıcı bulunamadı (olusturan/islem_yapan için).')

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'=== E2E şube finans smoke — kurum={kurum.id} ({kurum.ad}) '
            f'şubeler={[s.id for s in subeler]} ==='
        ))

        results: list[CheckResult] = []
        hareket_by_sube: dict[int, list[int]] = {}
        all_kurum_subeler = list(
            Sube.objects.filter(kurum_id=kurum.id).order_by('id')
        )

        for sube in subeler:
            self.stdout.write('')
            self.stdout.write(self.style.HTTP_INFO(
                f'── Şube {sube.id}: {sube.ad} ──'
            ))
            ctx_results, hareket_ids = self._run_sube(kurum, sube, user)
            results.extend(ctx_results)
            hareket_by_sube[sube.id] = hareket_ids

        # Cross-şube izolasyon: smoke şubeleri + kurumdaki diğer şubeler
        if len(all_kurum_subeler) >= 2 and any(hareket_by_sube.values()):
            results.extend(
                self._check_cross_sube_isolation(all_kurum_subeler, hareket_by_sube)
            )

        self._print_checklist(results)

        failed = [r for r in results if r.status == 'FAIL']
        if failed:
            raise CommandError(
                f'Smoke checklist: {len(failed)} kontrol başarısız '
                f'(toplam {len(results)}).'
            )

        self.stdout.write(self.style.SUCCESS(
            f'Smoke checklist: TÜM ZORUNLU KONTROLLER GEÇTİ '
            f'({len(results)} satır, '
            f'SKIP={sum(1 for r in results if r.status == "SKIP")})'
        ))

    # ─── Per-şube ─────────────────────────────────

    def _run_sube(self, kurum, sube, user) -> tuple[list[CheckResult], list[int]]:
        results: list[CheckResult] = []
        today = timezone.localdate()
        selector = MaliHesapSelector()
        bakiye_sel = BakiyeHareketiSelector()

        mali_hesaplar = list(selector.get_active_by_sube(sube.id))
        ctx = SmokeContext(
            kurum=kurum,
            sube=sube,
            user=user,
            today=today,
            mali_hesaplar=mali_hesaplar,
        )

        # 1) Mali hesap listesi yalnızca bu şubeye ait
        foreign = [h for h in mali_hesaplar if h.sube_id != sube.id]
        if not mali_hesaplar:
            results.append(CheckResult(
                'mali_hesap_listesi', 'FAIL',
                'Aktif mali hesap yok — önce reset_sube_finans çalıştırın',
                sube.id,
            ))
            return results, []
        if foreign:
            results.append(CheckResult(
                'mali_hesap_listesi', 'FAIL',
                f'Yabancı şube hesabı döndü: {[h.id for h in foreign]}',
                sube.id,
            ))
        else:
            results.append(CheckResult(
                'mali_hesap_listesi', 'PASS',
                f'{len(mali_hesaplar)} hesap — hepsi sube_id={sube.id}',
                sube.id,
            ))

        # 2) filter_odeme_yontemleri_for_mali_hesap — plan kanoniği yok
        plan_ok = True
        plan_details = []
        for mh in mali_hesaplar:
            qs = OdemeYontemi.objects.filter(
                kurum_id=kurum.id, aktif_mi=True, silindi_mi=False,
            )
            filtered = filter_odeme_yontemleri_for_mali_hesap(
                qs, mh.id, kurum_id=kurum.id,
            )
            plan_std = list(filtered.filter(
                mali_hesap__isnull=True,
                tip__in=list(STANDARD_PLAN_TIPS),
            ))
            linked = list(filtered.filter(mali_hesap_id=mh.id))
            if plan_std:
                plan_ok = False
                plan_details.append(
                    f'{mh.ad}: plan kanoniği sızdı={[p.ad for p in plan_std]}'
                )
            elif not linked:
                plan_ok = False
                plan_details.append(f'{mh.ad}: hesaba bağlı yöntem yok')
            else:
                plan_details.append(
                    f'{mh.ad}: {[x.tip for x in linked]}'
                )

        results.append(CheckResult(
            'odeme_yontemi_filtre',
            'PASS' if plan_ok else 'FAIL',
            '; '.join(plan_details),
            sube.id,
        ))

        # Resolve kasa + nakit yöntem
        ctx.kasa = next(
            (h for h in mali_hesaplar if h.tip == MaliHesapTipi.KASA),
            mali_hesaplar[0],
        )
        ctx.kasa_yontem = (
            OdemeYontemi.objects.filter(
                mali_hesap_id=ctx.kasa.id,
                aktif_mi=True,
                silindi_mi=False,
            ).order_by('siralama', 'id').first()
        )
        if not ctx.kasa_yontem:
            results.append(CheckResult(
                'prerequisites', 'FAIL',
                f'Mali hesap {ctx.kasa.id} için ödeme yöntemi yok',
                sube.id,
            ))
            return results, []

        # Cari + kategori
        prep_err = self._ensure_masters(ctx)
        if prep_err:
            results.append(CheckResult(
                'prerequisites', 'FAIL', prep_err, sube.id,
            ))
            return results, []
        results.append(CheckResult(
            'prerequisites', 'PASS',
            f'musteri={ctx.musteri.id} tedarikci={ctx.tedarikci.id} '
            f'kasa={ctx.kasa.id}',
            sube.id,
        ))

        # 3) Gelir + tahsilat + BakiyeHareketi
        results.append(self._smoke_gelir_tahsilat(ctx, bakiye_sel))

        # 4) Gider + ödeme + BakiyeHareketi
        results.append(self._smoke_gider_odeme(ctx, bakiye_sel))

        # 5) Opsiyonel sözleşme tahsilatı
        results.append(self._smoke_sozlesme_tahsilat(ctx, bakiye_sel))

        # 6) Opsiyonel çek/senet
        results.append(self._smoke_cek_senet(ctx))

        return results, list(ctx.created_hareket_ids)

    def _ensure_masters(self, ctx: SmokeContext) -> str | None:
        """Demo cari / kategori bul veya [E2E-SMOKE] ile oluştur."""
        sube = ctx.sube
        kurum = ctx.kurum

        ctx.gelir_kat = (
            GelirKategorisi.objects.filter(
                sube_id=sube.id, aktif_mi=True, silindi_mi=False,
            ).first()
            or GelirKategorisi.objects.filter(
                kurum_id=kurum.id, aktif_mi=True, silindi_mi=False,
            ).first()
        )
        if not ctx.gelir_kat:
            ctx.gelir_kat = GelirKategorisi.objects.create(
                kurum_id=kurum.id,
                sube=sube,
                ad=f'{SMOKE_TAG} Genel Gelirler',
                aktif_mi=True,
            )

        ctx.gider_kat = (
            GiderKategorisi.objects.filter(
                sube_id=sube.id, aktif_mi=True, silindi_mi=False,
            ).first()
            or GiderKategorisi.objects.filter(
                kurum_id=kurum.id, aktif_mi=True, silindi_mi=False,
            ).first()
        )
        if not ctx.gider_kat:
            ctx.gider_kat = GiderKategorisi.objects.create(
                kurum_id=kurum.id,
                sube=sube,
                ad=f'{SMOKE_TAG} Genel Giderler',
                aktif_mi=True,
            )

        ctx.musteri = CariHesap.objects.filter(
            sube_id=sube.id,
            hesap_turu=CariHesapTuru.MUSTERI,
            aktif_mi=True,
            silindi_mi=False,
        ).first()
        if not ctx.musteri:
            ctx.musteri = CariHesap.objects.filter(
                sube_id=sube.id,
                hesap_turu=CariHesapTuru.KARMA,
                aktif_mi=True,
                silindi_mi=False,
            ).first()
        if not ctx.musteri:
            musteri, err = CariHesapService().create({
                'kurum_id': kurum.id,
                'sube_id': sube.id,
                'unvan': f'{SMOKE_TAG} Müşteri Ş{sube.id}',
                'hesap_turu': CariHesapTuru.MUSTERI,
            })
            if err:
                return f'Müşteri cari oluşturulamadı: {err}'
            ctx.musteri = musteri

        ctx.tedarikci = CariHesap.objects.filter(
            sube_id=sube.id,
            hesap_turu=CariHesapTuru.TEDARIKCI,
            aktif_mi=True,
            silindi_mi=False,
        ).first()
        if not ctx.tedarikci:
            ctx.tedarikci = CariHesap.objects.filter(
                sube_id=sube.id,
                hesap_turu=CariHesapTuru.KARMA,
                aktif_mi=True,
                silindi_mi=False,
            ).exclude(pk=ctx.musteri.pk).first()
        if not ctx.tedarikci:
            tedarikci, err = CariHesapService().create({
                'kurum_id': kurum.id,
                'sube_id': sube.id,
                'unvan': f'{SMOKE_TAG} Tedarikçi Ş{sube.id}',
                'hesap_turu': CariHesapTuru.TEDARIKCI,
            })
            if err:
                return f'Tedarikçi cari oluşturulamadı: {err}'
            ctx.tedarikci = tedarikci

        return None

    def _smoke_gelir_tahsilat(
        self, ctx: SmokeContext, bakiye_sel: BakiyeHareketiSelector,
    ) -> CheckResult:
        name = 'gelir_tahsilat_bakiye'
        try:
            with transaction.atomic():
                gelir, err = GelirService().create({
                    'kurum_id': ctx.kurum.id,
                    'sube_id': ctx.sube.id,
                    'cari_hesap_id': ctx.musteri.id,
                    'gelir_kategorisi_id': ctx.gelir_kat.id,
                    'fatura_tarihi': ctx.today,
                    'vade_tarihi': ctx.today,
                    'brut_tutar': GELIR_TUTAR,
                    'kdv_orani': 0,
                    'aciklama': f'{SMOKE_TAG} gelir kaydı sube={ctx.sube.id}',
                    'olusturan': ctx.user,
                })
                if err:
                    return CheckResult(name, 'FAIL', f'Gelir create: {err}', ctx.sube.id)

                tahsilat, err = GelirTahsilatService().tahsilat_yap({
                    'gelir_kaydi_id': gelir.id,
                    'tutar': GELIR_TUTAR,
                    'tahsilat_tarihi': ctx.today,
                    'mali_hesap_id': ctx.kasa.id,
                    'odeme_yontemi_id': ctx.kasa_yontem.id,
                    'aciklama': f'{SMOKE_TAG} gelir tahsilat sube={ctx.sube.id}',
                    'islem_yapan': ctx.user,
                })
                if err:
                    return CheckResult(name, 'FAIL', f'Tahsilat: {err}', ctx.sube.id)

                if not tahsilat.bakiye_hareketi_id:
                    return CheckResult(
                        name, 'FAIL',
                        'GelirTahsilat.bakiye_hareketi_id boş',
                        ctx.sube.id,
                    )

                hareket = bakiye_sel.get_by_id(tahsilat.bakiye_hareketi_id)
                if not hareket:
                    return CheckResult(
                        name, 'FAIL',
                        f'BakiyeHareketi yok id={tahsilat.bakiye_hareketi_id}',
                        ctx.sube.id,
                    )
                if hareket.mali_hesap_id != ctx.kasa.id:
                    return CheckResult(
                        name, 'FAIL',
                        f'Hareket mali_hesap={hareket.mali_hesap_id} != {ctx.kasa.id}',
                        ctx.sube.id,
                    )
                if hareket.sube_id != ctx.sube.id:
                    return CheckResult(
                        name, 'FAIL',
                        f'Hareket sube_id={hareket.sube_id} != {ctx.sube.id}',
                        ctx.sube.id,
                    )

                ctx.created_hareket_ids.append(hareket.id)
                return CheckResult(
                    name, 'PASS',
                    f'gelir={gelir.id} tahsilat={tahsilat.id} '
                    f'hareket={hareket.id} tutar={GELIR_TUTAR}',
                    ctx.sube.id,
                )
        except Exception as exc:
            return CheckResult(name, 'FAIL', f'Exception: {exc}', ctx.sube.id)

    def _smoke_gider_odeme(
        self, ctx: SmokeContext, bakiye_sel: BakiyeHareketiSelector,
    ) -> CheckResult:
        name = 'gider_odeme_bakiye'
        try:
            with transaction.atomic():
                gider, err = GiderService().create({
                    'kurum_id': ctx.kurum.id,
                    'sube_id': ctx.sube.id,
                    'cari_hesap_id': ctx.tedarikci.id,
                    'gider_kategorisi_id': ctx.gider_kat.id,
                    'fatura_tarihi': ctx.today,
                    'vade_tarihi': ctx.today,
                    'brut_tutar': GIDER_TUTAR,
                    'kdv_orani': 0,
                    'taksit_sayisi': 1,
                    'aciklama': f'{SMOKE_TAG} gider kaydı sube={ctx.sube.id}',
                    'olusturan': ctx.user,
                })
                if err:
                    return CheckResult(name, 'FAIL', f'Gider create: {err}', ctx.sube.id)

                odeme_data = {
                    'gider_kaydi_id': gider.id,
                    'tutar': GIDER_TUTAR,
                    'odeme_tarihi': ctx.today,
                    'mali_hesap_id': ctx.kasa.id,
                    'odeme_yontemi_id': ctx.kasa_yontem.id,
                    'aciklama': f'{SMOKE_TAG} gider ödeme sube={ctx.sube.id}',
                    'islem_yapan': ctx.user,
                }
                # İlk taksit varsa bağla
                taksit = gider.taksitler.order_by('taksit_no').first()
                if taksit:
                    odeme_data['gider_taksit_id'] = taksit.id

                odeme, err = GiderOdemeService().odeme_yap(odeme_data)
                if err:
                    return CheckResult(name, 'FAIL', f'Ödeme: {err}', ctx.sube.id)

                if not odeme.bakiye_hareketi_id:
                    return CheckResult(
                        name, 'FAIL',
                        'GiderOdeme.bakiye_hareketi_id boş',
                        ctx.sube.id,
                    )

                hareket = bakiye_sel.get_by_id(odeme.bakiye_hareketi_id)
                if not hareket:
                    return CheckResult(
                        name, 'FAIL',
                        f'BakiyeHareketi yok id={odeme.bakiye_hareketi_id}',
                        ctx.sube.id,
                    )
                if hareket.mali_hesap_id != ctx.kasa.id or hareket.sube_id != ctx.sube.id:
                    return CheckResult(
                        name, 'FAIL',
                        f'Hareket uyumsuz mh={hareket.mali_hesap_id} '
                        f'sube={hareket.sube_id}',
                        ctx.sube.id,
                    )

                ctx.created_hareket_ids.append(hareket.id)
                return CheckResult(
                    name, 'PASS',
                    f'gider={gider.id} odeme={odeme.id} '
                    f'hareket={hareket.id} tutar={GIDER_TUTAR}',
                    ctx.sube.id,
                )
        except Exception as exc:
            return CheckResult(name, 'FAIL', f'Exception: {exc}', ctx.sube.id)

    def _smoke_sozlesme_tahsilat(
        self, ctx: SmokeContext, bakiye_sel: BakiyeHareketiSelector,
    ) -> CheckResult:
        """Minimal sözleşme oluştur → AKTIF → tahsilat → bakiye hareketi."""
        name = 'sozlesme_tahsilat'
        try:
            from apps.egitim_yili.domain.models import EgitimYili
            from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
            from apps.odeme_takip.application.services.tahsilat_service import TahsilatService
            from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum, TaksitDurum
            from apps.odeme_takip.domain.models import Sozlesme, Taksit
            from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit

            # Plan ödeme yöntemi (kurum) — sözleşme kanalı için
            from apps.finans.application.odeme_yontemi_plan_helpers import (
                ensure_kurum_plan_odeme_yontemleri,
            )
            plan_ids = ensure_kurum_plan_odeme_yontemleri(ctx.kurum.id)
            plan_nakit_id = plan_ids.get(OdemeYontemiTipi.NAKIT)

            ogr = (
                Ogrenci.objects.filter(sube_id=ctx.sube.id, aktif_mi=True).order_by('id').first()
                or Ogrenci.objects.filter(kurum_id=ctx.kurum.id, aktif_mi=True).order_by('id').first()
            )
            if not ogr:
                return CheckResult(name, 'SKIP', 'Öğrenci yok', ctx.sube.id)

            kayit = (
                OgrenciKayit.objects.filter(ogrenci=ogr, aktif_mi=True)
                .order_by('-id')
                .first()
            )
            ey_id = kayit.egitim_yili_id if kayit else None
            if not ey_id:
                ey = EgitimYili.objects.filter(aktif_mi=True).first()
                ey_id = ey.id if ey else None
            if not ey_id:
                return CheckResult(name, 'SKIP', 'Eğitim yılı yok', ctx.sube.id)

            # Aynı öğrenci+yıl için mevcut taslak/aktif varsa onu kullan; yoksa oluştur
            sozlesme = Sozlesme.objects.filter(
                ogrenci_id=ogr.id,
                egitim_yili_id=ey_id,
                durum__in=[SozlesmeDurum.TASLAK, SozlesmeDurum.AKTIF, SozlesmeDurum.DONDURULMUS],
            ).order_by('-id').first()

            svc = SozlesmeService()
            if not sozlesme:
                today = ctx.today
                sozlesme, err = svc.create({
                    'ogrenci_id': ogr.id,
                    'ogrenci_kayit_id': kayit.id if kayit else None,
                    'egitim_yili_id': ey_id,
                    'kurum_id': ctx.kurum.id,
                    'sube_id': ctx.sube.id,
                    'baslangic_tarihi': today,
                    'bitis_tarihi': today + timedelta(days=365),
                    'brut_tutar': 0,
                    'kdv_orani': 0,
                    'odeme_turu': 'pesin',
                    'taksit_sayisi': 1,
                    'ilk_odeme_tarihi': today,
                    'taksit_periyodu': 'aylik',
                    'paket_adi': f'{SMOKE_TAG} Test Paket',
                    'odeme_yontemi_id': plan_nakit_id,
                    'mali_hesap_id': ctx.kasa.id,
                    'kalemler': [{
                        'kalem_turu': KalemTuru.EK_HIZMET,
                        'kalem_id': 900001,
                        'kalem_adi': f'{SMOKE_TAG} Ek Hizmet',
                        'brut_tutar': 1000,
                        'kdv_orani': 0,
                        'indirim_orani': 0,
                    }],
                    'notlar': SMOKE_TAG,
                }, user=ctx.user)
                if err or not sozlesme:
                    return CheckResult(name, 'FAIL', f'Sözleşme create: {err}', ctx.sube.id)

            if sozlesme.durum == SozlesmeDurum.TASLAK:
                sozlesme, err = svc.change_status(
                    sozlesme.id, SozlesmeDurum.AKTIF, user=ctx.user, aciklama=SMOKE_TAG,
                )
                if err or not sozlesme:
                    return CheckResult(name, 'FAIL', f'Aktivasyon: {err}', ctx.sube.id)

            open_durumlar = [
                TaksitDurum.BEKLEMEDE,
                TaksitDurum.KISMI_ODENDI,
                TaksitDurum.GECIKTI,
            ]
            taksit = (
                Taksit.objects.filter(
                    sozlesme=sozlesme,
                    durum__in=open_durumlar,
                    kalan_tutar__gt=0,
                )
                .order_by('vade_tarihi', 'taksit_no')
                .first()
            )
            if not taksit:
                return CheckResult(
                    name, 'FAIL',
                    f'Sözleşme {sozlesme.sozlesme_no} aktif ama açık taksit yok',
                    ctx.sube.id,
                )

            kalan = int(getattr(taksit, 'kalan_tutar', None) or taksit.tutar or 0)
            tutar = min(SOZLESME_TAHSILAT, kalan)
            before_ids = set(
                bakiye_sel.get_by_mali_hesap(ctx.kasa.id).values_list('id', flat=True)
            )

            tahsilat, err = TahsilatService().create({
                'sozlesme_id': sozlesme.id,
                'taksit_id': taksit.id,
                'odeme_yontemi_id': ctx.kasa_yontem.id,
                'mali_hesap_id': ctx.kasa.id,
                'tutar': tutar,
                'tahsilat_tarihi': ctx.today,
                'aciklama': SMOKE_TAG,
            }, user=ctx.user)
            if err or not tahsilat:
                return CheckResult(name, 'FAIL', f'Tahsilat: {err}', ctx.sube.id)

            after = list(bakiye_sel.get_by_mali_hesap(ctx.kasa.id))
            new_h = [h for h in after if h.id not in before_ids]
            if not new_h:
                return CheckResult(
                    name, 'FAIL',
                    f'Tahsilat={tahsilat.id} ama BakiyeHareketi yok',
                    ctx.sube.id,
                )
            ctx.created_hareket_ids.extend(h.id for h in new_h)
            return CheckResult(
                name, 'PASS',
                f'soz={sozlesme.sozlesme_no} tahsilat={tahsilat.id} tutar={tutar} hareket={new_h[0].id}',
                ctx.sube.id,
            )
        except Exception as exc:
            return CheckResult(name, 'FAIL', f'Exception: {exc}', ctx.sube.id)

    def _smoke_cek_senet(self, ctx: SmokeContext) -> CheckResult:
        name = 'cek_senet_alinan'
        if not cek_senet_v2_enabled():
            return CheckResult(
                name, 'SKIP', 'CEK_SENET_V2_ENABLED=False', ctx.sube.id,
            )

        yontem = OdemeYontemi.objects.filter(
            kurum_id=ctx.kurum.id,
            tip=OdemeYontemiTipi.CEK,
            mali_hesap__isnull=True,
            aktif_mi=True,
            silindi_mi=False,
        ).first()
        if not yontem:
            return CheckResult(
                name, 'SKIP',
                'Kurum geneli Çek ödeme yöntemi yok',
                ctx.sube.id,
            )

        try:
            vade = ctx.today + timedelta(days=30)
            result, err = CekSenetService().create_alinan({
                'kurum_id': ctx.kurum.id,
                'sube_id': ctx.sube.id,
                'odeme_yontemi_id': yontem.id,
                'cari_hesap_id': ctx.musteri.id,
                'tutar': 100,
                'vade_tarihi': vade,
                'aciklama': f'{SMOKE_TAG} alınan çek sube={ctx.sube.id}',
                'cek_senet_no': f'E2E-{ctx.sube.id}-{ctx.today.strftime("%Y%m%d")}',
            }, user=ctx.user)
            if err:
                return CheckResult(name, 'FAIL', f'create_alinan: {err}', ctx.sube.id)
            return CheckResult(
                name, 'PASS',
                f'cek_senet id={result.get("id")} tutar={result.get("tutar")}',
                ctx.sube.id,
            )
        except Exception as exc:
            return CheckResult(name, 'FAIL', f'Exception: {exc}', ctx.sube.id)

    def _check_cross_sube_isolation(
        self,
        subeler: list,
        hareket_by_sube: dict[int, list[int]],
    ) -> list[CheckResult]:
        results = []
        bakiye_sel = BakiyeHareketiSelector()
        mh_sel = MaliHesapSelector()

        for sube in subeler:
            others = [s for s in subeler if s.id != sube.id]
            other_hareket_ids = {
                hid
                for o in others
                for hid in hareket_by_sube.get(o.id, [])
            }
            own_ids = set(hareket_by_sube.get(sube.id, []))

            # Bu şubenin hareket listesinde başka şubenin smoke hareketi olmamalı
            own_qs = bakiye_sel.get_by_sube(sube.id)
            leaked = list(
                own_qs.filter(id__in=other_hareket_ids).values_list('id', flat=True)
            ) if other_hareket_ids else []

            # Mali hesap listesinde yabancı şube hesabı olmamalı
            own_hesaplar = list(mh_sel.get_active_by_sube(sube.id))
            foreign_hesap = [h.id for h in own_hesaplar if h.sube_id != sube.id]

            # Bu şubenin smoke hareketleri diğer şube mali hesaplarında görünmemeli
            other_mh_ids = set(
                MaliHesap.objects.filter(
                    sube_id__in=[o.id for o in others],
                    aktif_mi=True,
                    silindi_mi=False,
                ).values_list('id', flat=True)
            )
            balance_leak = []
            if own_ids and other_mh_ids:
                from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
                balance_leak = list(
                    BakiyeHareketi.objects.filter(
                        id__in=own_ids,
                        mali_hesap_id__in=other_mh_ids,
                    ).values_list('id', flat=True)
                )

            # Diğer şube hareket sorgusunda bu şubenin smoke id'leri olmamalı
            query_leak = []
            for o in others:
                if not own_ids:
                    break
                leaked_in_other = list(
                    bakiye_sel.get_by_sube(o.id)
                    .filter(id__in=own_ids)
                    .values_list('id', flat=True)
                )
                query_leak.extend(leaked_in_other)

            ok = not leaked and not foreign_hesap and not balance_leak and not query_leak
            detail_parts = []
            if leaked:
                detail_parts.append(f'hareket sızıntısı(in)={leaked}')
            if query_leak:
                detail_parts.append(f'hareket sızıntısı(out)={query_leak}')
            if foreign_hesap:
                detail_parts.append(f'yabancı mali hesap={foreign_hesap}')
            if balance_leak:
                detail_parts.append(f'bakiye cross-mh={balance_leak}')
            if ok:
                detail_parts.append(
                    f'şube {sube.id} izolasyonu OK '
                    f'(own_hareket={len(own_ids)}, other_hareket={len(other_hareket_ids)})'
                )

            results.append(CheckResult(
                'sube_izolasyon',
                'PASS' if ok else 'FAIL',
                '; '.join(detail_parts),
                sube.id,
            ))

        return results

    def _print_checklist(self, results: list[CheckResult]):
        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('=== Checklist ==='))

        width = max((len(r.name) for r in results), default=10)
        for r in results:
            prefix = f'[{r.status}]'
            loc = f'sube={r.sube_id} ' if r.sube_id is not None else ''
            line = f'{prefix:8} {r.name:<{width}}  {loc}{r.detail}'
            if r.status == 'PASS':
                self.stdout.write(self.style.SUCCESS(line))
            elif r.status == 'FAIL':
                self.stdout.write(self.style.ERROR(line))
            else:
                self.stdout.write(self.style.WARNING(line))

        counts = {
            'PASS': sum(1 for r in results if r.status == 'PASS'),
            'FAIL': sum(1 for r in results if r.status == 'FAIL'),
            'SKIP': sum(1 for r in results if r.status == 'SKIP'),
        }
        self.stdout.write(
            f'\nÖzet: PASS={counts["PASS"]} FAIL={counts["FAIL"]} '
            f'SKIP={counts["SKIP"]} toplam={len(results)}'
        )
