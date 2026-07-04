"""
Dashboard demo verisi — öğrenci, personel, sınıf, sözleşme ve finans kayıtları.
"""
from __future__ import annotations

import random
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.egitim_paketleri.models import GrupDersi, OzelDers
from apps.egitim_tanimlari.models import Brans, Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.finans.application.bakiye_hareketi_service import BakiyeHareketiService
from apps.finans.constants.cari_types import GelirDurum
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.cari_hesap import CariHesap
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_kategorisi import GelirKategorisi
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_kategorisi import GiderKategorisi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.finans.domain.payment_method import OdemeYontemi
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.domain.enums import (
    EgitimTuru,
    KalemTuru,
    OdemeTuru,
    SozlesmeDurum,
    TaksitDurum,
    TahsilatDurum,
    TahsilatTuru,
)
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi, Taksit, Tahsilat, TahsilatDagitim
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.roller.models import Role
from apps.roller.seed import ensure_default_roles
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

DEMO_PREFIX = 'DEMO'
DEMO_TC_BASE = 99000000000

ADLAR = [
    'Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Can', 'Emre', 'Deniz', 'Burak',
    'Selin', 'Merve', 'Kerem', 'Ece', 'Arda', 'Yusuf', 'Hakan', 'Gizem', 'Oğuz', 'Seda',
]
SOYADLAR = [
    'Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Aydın', 'Öztürk', 'Arslan', 'Doğan',
    'Kılıç', 'Aslan', 'Koç', 'Kurt', 'Özkan', 'Polat', 'Erdoğan', 'Güneş', 'Aksoy', 'Taş',
]
SINIF_ADLARI = [
    '9-A', '9-B', '10-A', '10-B', '11 Sayısal', '11 Eşit', '11 Sözel',
    '12 Sayısal', '12 Eşit', '12 Sözel', 'Mezun-A', 'Mezun-B', 'YKS-A', 'YKS-B', 'YKS-C',
]

DEMO_PRESETS = {
    'full': {
        'students': 250,
        'mezun': 80,
        'teachers': 20,
        'classes': 15,
        'include_finance': True,
        'finance_scale': 1.0,
    },
    'dashboard': {
        'students': 80,
        'mezun': 15,
        'teachers': 8,
        'classes': 8,
        'include_finance': True,
        'finance_scale': 0.35,
    },
    'students': {
        'students': 120,
        'mezun': 30,
        'teachers': 12,
        'classes': 10,
        'include_finance': False,
    },
    'finance': {
        'finance_only': True,
        'include_finance': True,
        'finance_scale': 0.6,
    },
}

_FULL_SLICE_COUNTS = {
    'yks': 70,
    'grup': 120,
    'birebir': 30,
    'lgs': 30,
    'mezun': 60,
}


class DemoDataService:
    """Demo öğrenci, personel, sınıf ve finans verisi oluşturma / temizleme."""

    def resolve_context(self, kurum_id=None, sube_id=None) -> tuple:
        kurum = (
            Kurum.objects.filter(id=kurum_id).first()
            if kurum_id
            else Kurum.objects.filter(aktif_mi=True).first()
        )
        if not kurum:
            raise ValueError('Kurum bulunamadı.')
        sube = (
            Sube.objects.filter(id=sube_id).first()
            if sube_id
            else Sube.objects.filter(kurum=kurum, aktif_mi=True).order_by('id').first()
        )
        if not sube:
            raise ValueError('Şube bulunamadı.')
        ey = (
            EgitimYili.objects.filter(aktif_mi=True).first()
            or EgitimYili.objects.order_by('-baslangic_yil').first()
        )
        subeler = list(Sube.objects.filter(kurum=kurum, aktif_mi=True).order_by('id'))
        return kurum, sube, ey, subeler

    def get_status(self, kurum) -> dict:
        demo_soz = Sozlesme.objects.filter(kurum=kurum, sozlesme_no__startswith=f'{DEMO_PREFIX}-')
        has_demo_students = Ogrenci.objects.filter(
            kurum=kurum, tc_kimlik_no__startswith='99',
        ).exists()
        return {
            'students': Ogrenci.objects.filter(kurum=kurum, tc_kimlik_no__startswith='99').count(),
            'personnel': Personel.objects.filter(kurum=kurum, tc_kimlik_no__startswith='98').count(),
            'classes': Sinif.objects.filter(kurum=kurum, kod__startswith='DEMO-').count(),
            'contracts': demo_soz.count(),
            'tahsilat': Tahsilat.objects.filter(sozlesme__in=demo_soz).count(),
            'gelir': GelirKaydi.objects.filter(kurum=kurum, fatura_no__startswith='DEMO-').count(),
            'gider': GiderKaydi.objects.filter(kurum=kurum, fatura_no__startswith='DEMO-').count(),
            'has_demo_students': has_demo_students,
        }

    def purge(self, kurum) -> dict:
        demo_soz = Sozlesme.objects.filter(kurum=kurum, sozlesme_no__startswith=f'{DEMO_PREFIX}-')
        demo_ogr_ids = list(
            Ogrenci.objects.filter(kurum=kurum, tc_kimlik_no__startswith='99').values_list('id', flat=True)
        )
        demo_gider_ids = list(
            GiderKaydi.objects.filter(kurum=kurum, fatura_no__startswith='DEMO-').values_list('id', flat=True)
        )

        deleted = {}
        deleted['bakiye_hareketi'], _ = BakiyeHareketi.objects.filter(
            kurum=kurum, aciklama__icontains='Demo',
        ).delete()
        deleted['tahsilat'], _ = Tahsilat.objects.filter(sozlesme__in=demo_soz).delete()
        deleted['taksit'], _ = Taksit.objects.filter(sozlesme__in=demo_soz).delete()
        deleted['sozlesme_kalemi'], _ = SozlesmeKalemi.objects.filter(sozlesme__in=demo_soz).delete()
        deleted['sozlesme'], _ = demo_soz.delete()
        deleted['gider_odeme'], _ = GiderOdeme.objects.filter(gider_kaydi_id__in=demo_gider_ids).delete()
        deleted['ogrenci_kayit'], _ = OgrenciKayit.objects.filter(ogrenci_id__in=demo_ogr_ids).delete()
        deleted['ogrenci_veli'], _ = OgrenciVeli.objects.filter(ogrenci_id__in=demo_ogr_ids).delete()
        deleted['ogrenci'], _ = Ogrenci.objects.filter(id__in=demo_ogr_ids).delete()
        deleted['personel'], _ = Personel.objects.filter(
            kurum=kurum, tc_kimlik_no__startswith='98',
        ).delete()
        deleted['sinif'], _ = Sinif.objects.filter(kurum=kurum, kod__startswith='DEMO-').delete()
        deleted['gelir'], _ = GelirKaydi.objects.filter(kurum=kurum, fatura_no__startswith='DEMO-').delete()
        deleted['gider'], _ = GiderKaydi.objects.filter(kurum=kurum, fatura_no__startswith='DEMO-').delete()
        deleted['grup_dersi'], _ = GrupDersi.objects.filter(kurum=kurum, kod__startswith='DEMO-').delete()
        deleted['ozel_ders'], _ = OzelDers.objects.filter(kurum=kurum, kod__startswith='DEMO-').delete()
        return deleted

    @transaction.atomic
    def seed(self, kurum, sube, preset='full', purge_first=False, **overrides) -> dict:
        ensure_default_roles()
        preset_cfg = dict(DEMO_PRESETS.get(preset, DEMO_PRESETS['full']))
        cfg = {**preset_cfg, **overrides}

        deleted = {}
        if purge_first:
            deleted = self.purge(kurum)

        finance_only = cfg.pop('finance_only', False)
        include_finance = cfg.pop('include_finance', True)
        finance_scale = float(cfg.pop('finance_scale', 1.0))

        ey = (
            EgitimYili.objects.filter(aktif_mi=True).first()
            or EgitimYili.objects.order_by('-baslangic_yil').first()
        )
        subeler = list(Sube.objects.filter(kurum=kurum, aktif_mi=True).order_by('id'))
        rng = random.Random(42)

        if not finance_only and Ogrenci.objects.filter(
            kurum=kurum, tc_kimlik_no__startswith='99',
        ).exists():
            return {
                'created': False,
                'skipped': True,
                'reason': 'demo_students_exist',
                'preset': preset,
                'purged': bool(deleted),
                'deleted': deleted,
                'status': self.get_status(kurum),
            }

        catalog = self._ensure_catalog(kurum, sube, ey, subeler, rng)
        siniflar: list = []
        ogretmenler: list = []
        ogrenciler: dict

        if finance_only:
            ogrenciler = self._collect_demo_students(kurum)
            if not ogrenciler['active'] and not ogrenciler['mezun']:
                return {
                    'created': False,
                    'skipped': True,
                    'reason': 'no_demo_students',
                    'preset': preset,
                    'purged': bool(deleted),
                    'deleted': deleted,
                    'status': self.get_status(kurum),
                }
        else:
            siniflar = self._create_classes(kurum, subeler, ey, cfg['classes'], rng)
            ogretmenler = self._create_teachers(
                kurum, sube, ey, subeler, cfg['teachers'], siniflar, rng,
            )
            ogrenciler = self._create_students(
                kurum, sube, ey, subeler, siniflar, catalog, cfg, rng,
            )

        contracts = 0
        if include_finance:
            contracts = self._create_financials(
                kurum, sube, ey, catalog, ogrenciler, rng, finance_scale=finance_scale,
            )

        return {
            'created': True,
            'skipped': False,
            'preset': preset,
            'purged': bool(deleted),
            'deleted': deleted,
            'kurum_id': kurum.id,
            'sube_id': sube.id,
            'students_active': len(ogrenciler['active']),
            'students_mezun': len(ogrenciler['mezun']),
            'teachers': len(ogretmenler),
            'classes': len(siniflar),
            'contracts': contracts,
            'status': self.get_status(kurum),
        }

    def _collect_demo_students(self, kurum) -> dict:
        active_records = []
        mezun_records = []
        for idx, ogr in enumerate(
            Ogrenci.objects.filter(kurum=kurum, tc_kimlik_no__startswith='99').order_by('id')
        ):
            kayit = OgrenciKayit.objects.filter(ogrenci=ogr).order_by('-id').first()
            veli = OgrenciVeli.objects.filter(ogrenci=ogr).first()
            rec = {'ogrenci': ogr, 'kayit': kayit, 'veli': veli, 'idx': idx}
            if kayit and kayit.aktif_mi:
                active_records.append(rec)
            else:
                mezun_records.append(rec)
        return {'active': active_records, 'mezun': mezun_records}

    def _scaled_slice_counts(self, finance_scale: float) -> dict:
        return {
            key: max(0, int(count * finance_scale))
            for key, count in _FULL_SLICE_COUNTS.items()
        }

    def _ensure_catalog(self, kurum, sube, ey, subeler, rng):
        seviye = SinifSeviyesi.objects.filter(kurum=kurum, sube=sube, aktif_mi=True).first()
        ders = Ders.objects.filter(kurum=kurum, sube=sube, aktif_mi=True).first()
        brans = Brans.objects.filter(kurum=kurum, sube=sube, aktif_mi=True).first()
        mali_kasa = MaliHesap.objects.filter(sube__kurum=kurum, aktif_mi=True, silindi_mi=False).first()
        mali_banka = (
            MaliHesap.objects.filter(sube__kurum=kurum, aktif_mi=True, silindi_mi=False)
            .exclude(id=mali_kasa.id).first()
            if mali_kasa
            else None
        )
        odeme = OdemeYontemi.objects.filter(kurum=kurum, aktif_mi=True).first()
        cari = CariHesap.objects.filter(kurum=kurum, aktif_mi=True).first()
        gider_kat = GiderKategorisi.objects.filter(kurum=kurum, aktif_mi=True, parent__isnull=True).first()
        gelir_kat = GelirKategorisi.objects.filter(kurum=kurum, aktif_mi=True).first()

        grup, _ = GrupDersi.objects.get_or_create(
            kod=f'{DEMO_PREFIX}-GRUP-YKS',
            sube=sube, egitim_yili=ey,
            defaults={
                'kurum': kurum, 'ad': 'YKS Grup Programı', 'brut_fiyat': 85000,
                'kdv_orani': 10, 'aktif_mi': True,
            },
        )
        if seviye:
            grup.sinif_seviyeleri.add(seviye)
        if ders:
            grup.dersler.add(ders)

        ozel, _ = OzelDers.objects.get_or_create(
            kod=f'{DEMO_PREFIX}-OZEL',
            sube=sube, egitim_yili=ey,
            defaults={
                'kurum': kurum, 'ad': 'Birebir Özel Ders Paketi', 'brut_fiyat': 45000,
                'kdv_orani': 10, 'aktif_mi': True,
            },
        )
        if seviye:
            ozel.sinif_seviyeleri.add(seviye)
        if ders:
            ozel.dersler.add(ders)

        return {
            'seviye': seviye, 'ders': ders, 'brans': brans,
            'mali_kasa': mali_kasa, 'mali_banka': mali_banka or mali_kasa,
            'odeme': odeme, 'cari': cari,
            'gider_kat': gider_kat, 'gelir_kat': gelir_kat,
            'grup': grup, 'ozel': ozel,
        }

    def _create_classes(self, kurum, subeler, ey, count, rng):
        siniflar = []
        for i in range(count):
            sube = subeler[i % len(subeler)]
            ad = SINIF_ADLARI[i] if i < len(SINIF_ADLARI) else f'DEMO-{i + 1}'
            sinif, _ = Sinif.objects.get_or_create(
                kurum=kurum, sube=sube, egitim_yili=ey, ad=ad,
                defaults={'kod': f'{DEMO_PREFIX}-SNF-{i + 1:02d}', 'kapasite': 30, 'aktif_mi': True},
            )
            siniflar.append(sinif)
        return siniflar

    def _create_teachers(self, kurum, sube, ey, subeler, count, siniflar, rng):
        rol = Role.objects.filter(code='ogretmen', silindi_mi=False).first()
        personeller = []
        for i in range(count):
            tc = str(98000000000 + i)
            p, created = Personel.objects.get_or_create(
                kurum=kurum, sube=sube, tc_kimlik_no=tc,
                defaults={
                    'ad': ADLAR[i % len(ADLAR)],
                    'soyad': SOYADLAR[i % len(SOYADLAR)],
                    'cep_telefon': f'0532{1000000 + i:07d}'[-10:],
                    'aktif_mi': True,
                },
            )
            if created:
                gorev_sube = subeler[i % len(subeler)]
                g = PersonelGorevlendirme.objects.create(
                    personel=p, egitim_yili=ey, rol=rol, gorev_sube=gorev_sube, aktif_mi=True,
                )
                if siniflar:
                    g.siniflar.add(siniflar[i % len(siniflar)])
            personeller.append(p)
        return personeller

    def _make_student(self, kurum, sube, idx, rng):
        tc = str(DEMO_TC_BASE + idx)
        ad = ADLAR[idx % len(ADLAR)]
        soyad = SOYADLAR[(idx // len(ADLAR)) % len(SOYADLAR)]
        return Ogrenci.objects.create(
            kurum=kurum, sube=sube, tc_kimlik_no=tc,
            ad=ad, soyad=soyad, cinsiyet='E' if idx % 2 else 'K', aktif_mi=True,
        )

    def _create_students(self, kurum, sube, ey, subeler, siniflar, catalog, options, rng):
        n_active = options['students']
        n_mezun = options['mezun']
        mezun_ey = EgitimYili.objects.filter(
            baslangic_yil__lt=ey.baslangic_yil,
        ).order_by('-baslangic_yil').first()

        active_records = []
        idx = 0

        for i in range(n_active):
            ogr_sub = subeler[i % len(subeler)]
            ogr = self._make_student(kurum, ogr_sub, idx, rng)
            idx += 1
            sinif = siniflar[i % len(siniflar)]
            kayit = OgrenciKayit.objects.create(
                ogrenci=ogr, sinif=sinif, egitim_yili=ey,
                kurum=kurum, sube=ogr_sub, okul_no=f'{DEMO_PREFIX}-{1000 + i}',
                aktif_mi=True,
            )
            veli = OgrenciVeli.objects.create(
                ogrenci=ogr, veli_turu='anne', ad=f'{ogr.ad} Anne', soyad=ogr.soyad,
                telefon=f'0533{2000000 + i:07d}'[-10:],
            )
            active_records.append({'ogrenci': ogr, 'kayit': kayit, 'veli': veli, 'idx': i})

        mezun_records = []
        for j in range(n_mezun):
            ogr_sub = subeler[j % len(subeler)]
            ogr = self._make_student(kurum, ogr_sub, idx, rng)
            idx += 1
            kayit = OgrenciKayit.objects.create(
                ogrenci=ogr, sinif=siniflar[j % len(siniflar)],
                egitim_yili=mezun_ey or ey,
                kurum=kurum, sube=ogr_sub, okul_no=f'{DEMO_PREFIX}-M{1000 + j}',
                aktif_mi=False,
            )
            veli = OgrenciVeli.objects.create(
                ogrenci=ogr, veli_turu='baba', ad=f'{ogr.ad} Baba', soyad=ogr.soyad,
                telefon=f'0534{3000000 + j:07d}'[-10:],
            )
            mezun_records.append({'ogrenci': ogr, 'kayit': kayit, 'veli': veli, 'idx': j})

        return {'active': active_records, 'mezun': mezun_records, 'catalog': catalog}

    def _create_sozlesme(self, rec, kurum, sube, ey, catalog, cfg, rng, soz_no):
        ogr, kayit, veli = rec['ogrenci'], rec['kayit'], rec['veli']
        brut = cfg['brut']
        today = timezone.localdate()
        soz = Sozlesme(
            sozlesme_no=soz_no,
            ogrenci=ogr, ogrenci_kayit=kayit, egitim_yili=ey,
            kurum=kurum, sube=sube, veli=veli,
            odeme_yontemi=catalog['odeme'], mali_hesap=catalog['mali_kasa'],
            baslangic_tarihi=today - timedelta(days=rng.randint(30, 180)),
            bitis_tarihi=today + timedelta(days=rng.randint(120, 365)),
            brut_tutar=brut, kdv_orani=10, toplam_indirim_tutari=0,
            odeme_turu=OdemeTuru.TAKSITLI, taksit_sayisi=cfg['taksit'],
            durum=cfg['durum'], egitim_turu=cfg['egitim_turu'],
            paket_adi=cfg.get('paket_adi', ''), paket_turu=cfg.get('paket_turu', ''),
        )
        soz.hesapla_tutarlar()
        soz.save()

        if cfg.get('kalem_turu'):
            kalem_id = cfg.get('kalem_id') or catalog['grup'].id
            SozlesmeKalemi.objects.create(
                sozlesme=soz, kalem_turu=cfg['kalem_turu'],
                kalem_id=kalem_id, kalem_adi=cfg.get('kalem_adi', cfg.get('paket_adi', '')),
                brut_tutar=brut, net_tutar=brut,
            )
        return soz

    def _create_taksit_plan(self, soz, rng, overdue=False, partial=False, paid=False):
        today = timezone.localdate()
        taksit_sayisi = soz.taksit_sayisi or 6
        parca = soz.net_tutar // taksit_sayisi
        taksitler = []
        for n in range(1, taksit_sayisi + 1):
            if overdue and n <= 2:
                vade = today - timedelta(days=rng.randint(5, 45))
            elif n == 3:
                vade = today + timedelta(days=rng.randint(0, 3))
            else:
                vade = today + timedelta(days=30 * n)
            t = Taksit.objects.create(
                sozlesme=soz, taksit_no=n, vade_tarihi=vade,
                tutar=parca, kalan_tutar=parca, odenen_tutar=0,
                durum=TaksitDurum.BEKLEMEDE, odeme_yontemi=soz.odeme_yontemi,
            )
            taksitler.append(t)

        if paid or partial:
            odenecek = taksitler[: (taksit_sayisi if paid else rng.randint(1, 2))]
            for t in odenecek:
                self._pay_taksit(soz, t, t.kalan_tutar, today - timedelta(days=rng.randint(1, 20)))
        return taksitler

    def _pay_taksit(self, soz, taksit, tutar, odeme_tarihi):
        catalog_mali = soz.mali_hesap_id
        tahsilat = Tahsilat.objects.create(
            sozlesme=soz, taksit=taksit, odeme_yontemi=soz.odeme_yontemi,
            mali_hesap_id=catalog_mali, tutar=tutar,
            tahsilat_tarihi=odeme_tarihi, tahsilat_turu=TahsilatTuru.NORMAL,
            durum=TahsilatDurum.AKTIF,
        )
        TahsilatDagitim.objects.create(tahsilat=tahsilat, taksit=taksit, tutar=tutar)
        if catalog_mali:
            BakiyeHareketiService().tahsilat_giris(
                mali_hesap_id=catalog_mali,
                kurum_id=soz.kurum_id, sube_id=soz.sube_id,
                egitim_yili_id=soz.egitim_yili_id,
                tutar=tutar, islem_tarihi=odeme_tarihi,
                tahsilat_id=tahsilat.pk,
                aciklama=f'Demo tahsilat {soz.sozlesme_no}',
            )
        taksit.bakiye_guncelle()

    def _create_financials(self, kurum, sube, ey, catalog, ogrenciler, rng, finance_scale=1.0):
        today = timezone.localdate()
        soz_counter = 1
        active = ogrenciler['active']
        mezun = ogrenciler['mezun']
        slice_counts = self._scaled_slice_counts(finance_scale)

        configs = []
        offset = 0

        for rec in active[offset:offset + slice_counts['yks']]:
            configs.append((rec, {
                'brut': 120000, 'taksit': 8, 'egitim_turu': EgitimTuru.YKS,
                'durum': SozlesmeDurum.AKTIF, 'kalem_turu': KalemTuru.GRUP_DERSI,
                'kalem_id': catalog['grup'].id, 'kalem_adi': catalog['grup'].ad,
                'paket_adi': catalog['grup'].ad, 'scenario': 'yks_grup',
            }))
        offset += slice_counts['yks']

        for rec in active[offset:offset + slice_counts['grup']]:
            configs.append((rec, {
                'brut': 85000, 'taksit': 6, 'egitim_turu': EgitimTuru.ARA_SINIF,
                'durum': SozlesmeDurum.AKTIF, 'kalem_turu': KalemTuru.GRUP_DERSI,
                'kalem_id': catalog['grup'].id, 'kalem_adi': catalog['grup'].ad,
                'paket_adi': catalog['grup'].ad, 'scenario': 'grup',
            }))
        offset += slice_counts['grup']

        for rec in active[offset:offset + slice_counts['birebir']]:
            configs.append((rec, {
                'brut': 45000, 'taksit': 4, 'egitim_turu': EgitimTuru.DIGER,
                'durum': SozlesmeDurum.AKTIF, 'kalem_turu': KalemTuru.OZEL_DERS,
                'kalem_id': catalog['ozel'].id, 'kalem_adi': catalog['ozel'].ad,
                'paket_adi': catalog['ozel'].ad, 'scenario': 'birebir',
            }))
        offset += slice_counts['birebir']

        for rec in active[offset:offset + slice_counts['lgs']]:
            configs.append((rec, {
                'brut': 65000, 'taksit': 5, 'egitim_turu': EgitimTuru.LGS,
                'durum': SozlesmeDurum.AKTIF, 'kalem_turu': KalemTuru.PAKET,
                'kalem_adi': 'LGS Hazırlık Paketi', 'paket_adi': 'LGS Hazırlık Paketi',
                'scenario': 'regular',
            }))

        for rec in mezun[:slice_counts['mezun']]:
            configs.append((rec, {
                'brut': 90000, 'taksit': 6, 'egitim_turu': EgitimTuru.MEZUN,
                'durum': SozlesmeDurum.TAMAMLANDI, 'kalem_turu': KalemTuru.GRUP_DERSI,
                'kalem_id': catalog['grup'].id, 'kalem_adi': 'Mezun Programı',
                'paket_adi': 'Mezun Programı', 'scenario': 'mezun_paid',
            }))

        for rec, cfg in configs:
            soz_no = f'{DEMO_PREFIX}-SZ-{soz_counter:05d}'
            soz_counter += 1
            rec_sub = rec['kayit'].sube
            soz = self._create_sozlesme(rec, kurum, rec_sub, ey, catalog, cfg, rng, soz_no)
            scenario = cfg['scenario']
            if scenario == 'mezun_paid':
                self._create_taksit_plan(soz, rng, paid=True)
            elif scenario == 'yks_grup':
                self._create_taksit_plan(
                    soz, rng, overdue=(soz_counter % 5 == 0), partial=(soz_counter % 3 == 0),
                )
            elif scenario == 'grup':
                self._create_taksit_plan(
                    soz, rng, overdue=(soz_counter % 7 == 0), partial=(soz_counter % 4 == 0),
                )
            elif scenario == 'birebir':
                self._create_taksit_plan(soz, rng, partial=True)
            else:
                self._create_taksit_plan(soz, rng, paid=(soz_counter % 6 == 0))

        if active and catalog['odeme'] and catalog['mali_kasa']:
            today_tahsilat_count = max(0, int(8 * finance_scale))
            for _ in range(today_tahsilat_count):
                rec = active[rng.randint(0, len(active) - 1)]
                soz = Sozlesme.objects.filter(
                    ogrenci=rec['ogrenci'], durum=SozlesmeDurum.AKTIF,
                ).first()
                if not soz:
                    continue
                taksit = soz.taksitler.filter(kalan_tutar__gt=0).order_by('taksit_no').first()
                if taksit:
                    pay = min(taksit.kalan_tutar, rng.randint(2000, 8000))
                    self._pay_taksit(soz, taksit, pay, today)

        gelir_count = max(0, int(25 * finance_scale))
        if catalog['cari'] and catalog['gelir_kat']:
            for g in range(gelir_count):
                brut = Decimal(rng.randint(5, 80) * 1000)
                GelirKaydi.objects.create(
                    kurum=kurum, sube=sube, egitim_yili=ey,
                    cari_hesap=catalog['cari'], gelir_kategorisi=catalog['gelir_kat'],
                    fatura_no=f'{DEMO_PREFIX}-GLR-{g + 1:03d}',
                    fatura_tarihi=today - timedelta(days=rng.randint(0, 120)),
                    vade_tarihi=today + timedelta(days=rng.randint(7, 30)),
                    brut_tutar=brut, kdv_orani=20, kdv_tutar=brut * Decimal('0.2'),
                    net_tutar=brut * Decimal('1.2'), durum=GelirDurum.ONAYLANDI,
                    aciklama='Demo gelir kaydı',
                )

        gider_count = max(0, int(35 * finance_scale))
        if catalog['cari'] and catalog['gider_kat'] and catalog['mali_kasa']:
            for g in range(gider_count):
                brut = Decimal(rng.randint(3, 50) * 1000)
                fatura_tarihi = today - timedelta(days=rng.randint(0, 150))
                gider = GiderKaydi.objects.create(
                    kurum=kurum, sube=sube, egitim_yili=ey,
                    cari_hesap=catalog['cari'], gider_kategorisi=catalog['gider_kat'],
                    mali_hesap=catalog['mali_kasa'],
                    fatura_no=f'{DEMO_PREFIX}-GDR-{g + 1:03d}',
                    fatura_tarihi=fatura_tarihi,
                    vade_tarihi=fatura_tarihi + timedelta(days=rng.randint(7, 45)),
                    brut_tutar=brut, kdv_orani=20, kdv_tutar=brut * Decimal('0.2'),
                    net_tutar=brut * Decimal('1.2'), durum=GiderDurum.ONAYLANDI,
                    aciklama='Demo gider kaydı',
                )
                if g % 2 == 0:
                    odeme_tarihi = today - timedelta(days=rng.randint(0, 90))
                    GiderOdeme.objects.create(
                        gider_kaydi=gider, tutar=gider.net_tutar * Decimal('0.5'),
                        odeme_tarihi=odeme_tarihi, odeme_yontemi=catalog['odeme'],
                        mali_hesap=catalog['mali_kasa'], durum=OdemeDurum.TAMAMLANDI,
                    )
                    BakiyeHareketiService().hareket_olustur(
                        mali_hesap_id=catalog['mali_kasa'].id,
                        kurum_id=kurum.id, sube_id=sube.id, egitim_yili_id=ey.id,
                        tutar=int(gider.net_tutar * Decimal('0.5')),
                        yon=HareketYonu.CIKIS, kaynak=HareketKaynagi.GIDER,
                        islem_tarihi=odeme_tarihi, kaynak_id=gider.id,
                        aciklama=f'Demo gider ödemesi {gider.fatura_no}',
                    )

        if active:
            hist_lo = max(1, int(15 * finance_scale))
            hist_hi = max(hist_lo, int(25 * finance_scale))
            for month_offset in range(1, 7):
                odeme_gunu = today - timedelta(days=30 * month_offset)
                for _ in range(rng.randint(hist_lo, hist_hi)):
                    rec = active[rng.randint(0, len(active) - 1)]
                    soz = Sozlesme.objects.filter(ogrenci=rec['ogrenci']).first()
                    if not soz:
                        continue
                    taksit = soz.taksitler.filter(kalan_tutar__gt=0).first()
                    if taksit:
                        pay = min(taksit.kalan_tutar, rng.randint(1500, 6000))
                        self._pay_taksit(soz, taksit, pay, odeme_gunu)

        return len(configs)
