"""
Gün Sonu Detay Raporu — 12 bölümlü tam gün kapanış raporu.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.finans.application.gun_sonu_report_service import (
    GunSonuReportService,
    _fmt_date,
    _fmt_datetime,
    _user_display,
)
from apps.finans.application.gun_sonu_service import GunSonuService
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import GelirDurum
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.constants.hareket_types import HareketYonu
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru


def _fmt_saat(dt: datetime | None) -> str:
    if not dt:
        return '—'
    local = timezone.localtime(dt) if timezone.is_aware(dt) else dt
    return local.strftime('%H:%M')


def _int_amount(value) -> int:
    if value is None:
        return 0
    if isinstance(value, Decimal):
        return int(value)
    return int(value)


def _odeme_label(odeme_yontemi) -> str:
    if not odeme_yontemi:
        return '—'
    return getattr(odeme_yontemi, 'ad', None) or odeme_yontemi.get_tip_display()


class GunSonuDetayReportService:
    """Gün sonu detay raporu — satır bazlı tüm bölümler."""

    def __init__(self):
        self._gun_sonu = GunSonuService()
        self._ozet_svc = GunSonuReportService()

    def build_detay_rapor(
        self,
        kurum_id: int,
        gun: date | None = None,
        sube_id: int | None = None,
        *,
        hazirlayan: str | None = None,
        notlar: str = '',
        kurum_ad: str | None = None,
        sube_ad: str | None = None,
    ) -> dict:
        gun = gun or date.today()
        base = self._gun_sonu.ozet(kurum_id, gun, sube_id)
        ozet_wrap = self._ozet_svc.build_ozet_rapor(
            kurum_id, gun, sube_id,
            hazirlayan=hazirlayan, notlar=notlar,
            kurum_ad=kurum_ad, sube_ad=sube_ad,
        )
        ozet = ozet_wrap.get('ozet_rapor') or {}

        if not kurum_ad:
            kurum_ad = self._ozet_svc._kurum_ad(kurum_id)
        if not sube_ad and sube_id:
            sube_ad = self._ozet_svc._sube_ad(sube_id)

        tahsilat_listesi = self._tahsilat_listesi(kurum_id, gun, sube_id)
        gelir_hareketleri = self._gelir_hareketleri(kurum_id, gun, sube_id)
        gider_hareketleri = self._gider_hareketleri(kurum_id, gun, sube_id)
        cari_hareketleri = self._cari_hareketleri(kurum_id, gun, sube_id)
        iptal_islemleri = self._iptal_islemleri(kurum_id, gun, sube_id)
        iade_islemleri = self._iade_islemleri(kurum_id, gun, sube_id)
        odeme_turu_dagilimi = self._odeme_turu_dagilimi(base, tahsilat_listesi, gelir_hareketleri)
        kategori_gelirler = self._kategori_gelirler(kurum_id, gun, sube_id)
        kategori_giderler = self._kategori_giderler(kurum_id, gun, sube_id)
        kullanici_detay = self._kullanici_islem_detayi(
            tahsilat_listesi, gelir_hareketleri, gider_hareketleri,
        )
        kasa_ozeti = self._kasa_ozeti(kurum_id, gun, sube_id)

        meta = {
            'marka': kurum_ad or '',
            'baslik': 'GÜN SONU DETAY RAPORU',
            'tarih': _fmt_date(gun),
            'tarih_iso': str(gun),
            'sube': sube_ad or 'Tüm Şubeler',
            'sube_id': sube_id,
            'hazirlayan': hazirlayan or 'Sistem',
            'olusturulma': _fmt_datetime(timezone.now()),
            'kurum_ad': kurum_ad or '',
            'rapor_turu': 'detay',
        }

        detay = {
            'meta': meta,
            'kapak': {
                'baslik': 'GÜN SONU DETAY RAPORU',
                'kurum_ad': kurum_ad or '',
                'sube': sube_ad or 'Tüm Şubeler',
                'tarih': _fmt_date(gun),
                'hazirlayan': hazirlayan or 'Sistem',
            },
            'ozet': ozet.get('gunluk_ozet') or {},
            'tahsilat_listesi': tahsilat_listesi,
            'gelir_hareketleri': gelir_hareketleri,
            'gider_hareketleri': gider_hareketleri,
            'cari_hareketleri': cari_hareketleri,
            'iptal_islemleri': iptal_islemleri,
            'iade_islemleri': iade_islemleri,
            'odeme_turu_dagilimi': odeme_turu_dagilimi,
            'kategori_gelirler': kategori_gelirler,
            'kategori_giderler': kategori_giderler,
            'kullanici_islem_detayi': kullanici_detay,
            'kasa_ozeti': kasa_ozeti,
            'sistem': {
                'olusturma_tarihi': meta['olusturulma'],
                'raporu_olusturan': meta['hazirlayan'],
                'sube': meta['sube'],
                'tarih': meta['tarih'],
                'filtreler': {
                    'kurum_id': kurum_id,
                    'sube_id': sube_id,
                    'gun': str(gun),
                },
            },
            'notlar': (notlar or '').strip(),
            'islem_sayilari': ozet.get('islem_sayilari') or {},
        }

        return {**base, 'ozet_rapor': ozet, 'detay_rapor': detay}

    def _tahsilat_listesi(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            tahsilat_tarihi=gun,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).select_related(
            'sozlesme__ogrenci', 'sozlesme__veli', 'odeme_yontemi', 'islem_yapan',
        ).order_by('created_at')
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)

        rows = []
        for t in qs:
            ogr = t.sozlesme.ogrenci
            veli = t.sozlesme.veli
            rows.append({
                'saat': _fmt_saat(t.created_at),
                'makbuz': t.referans_no or f'TH-{t.id}',
                'ogrenci': f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—',
                'veli': veli.tam_ad if veli else '—',
                'odeme_turu': _odeme_label(t.odeme_yontemi),
                'tutar': int(t.tutar or 0),
                'personel': _user_display(t.islem_yapan),
                'sozlesme_no': t.sozlesme.sozlesme_no,
            })
        return rows

    def _gelir_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            tahsilat_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        ).select_related(
            'gelir_kaydi__gelir_kategorisi', 'islem_yapan', 'odeme_yontemi',
        ).order_by('created_at')
        if sube_id:
            qs = qs.filter(gelir_kaydi__sube_id=sube_id)

        rows = []
        for g in qs:
            kayit = g.gelir_kaydi
            kat = kayit.gelir_kategorisi
            rows.append({
                'saat': _fmt_saat(g.created_at),
                'gelir_kodu': kayit.fatura_no or f'GL-{kayit.id}',
                'kategori': kat.ad if kat else 'Diğer',
                'aciklama': (g.aciklama or kayit.aciklama or '').strip() or '—',
                'tutar': _int_amount(g.tutar),
                'personel': _user_display(g.islem_yapan),
                'odeme_turu': _odeme_label(g.odeme_yontemi),
            })
        return rows

    def _gider_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            odeme_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        ).select_related(
            'gider_kaydi__gider_kategorisi', 'islem_yapan',
        ).order_by('created_at')
        if sube_id:
            qs = qs.filter(gider_kaydi__sube_id=sube_id)

        rows = []
        for g in qs:
            kayit = g.gider_kaydi
            kat = kayit.gider_kategorisi
            rows.append({
                'saat': _fmt_saat(g.created_at),
                'gider_kodu': kayit.fatura_no or f'GD-{kayit.id}',
                'kategori': kat.ad if kat else 'Diğer',
                'aciklama': (g.aciklama or kayit.aciklama or '').strip() or '—',
                'tutar': _int_amount(g.tutar),
                'personel': _user_display(g.islem_yapan),
            })
        return rows

    def _cari_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = CariHareket.objects.filter(
            kurum_id=kurum_id,
            islem_tarihi=gun,
        ).select_related('cari_hesap').order_by('cari_hesap__unvan', 'created_at')
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        agg: dict[int, dict] = {}
        for h in qs:
            cid = h.cari_hesap_id
            if cid not in agg:
                agg[cid] = {
                    'cari': h.cari_hesap.unvan if h.cari_hesap else '—',
                    'borc': 0,
                    'alacak': 0,
                    'bakiye': 0,
                }
            tutar = _int_amount(h.tutar)
            if h.yon == 'borc':
                agg[cid]['borc'] += tutar
            else:
                agg[cid]['alacak'] += tutar
            agg[cid]['bakiye'] = _int_amount(h.alacak_sonrasi) - _int_amount(h.borc_sonrasi)

        rows = list(agg.values())
        rows.sort(key=lambda r: r['cari'])
        return rows

    def _iptal_islemleri(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        rows: list[dict] = []

        t_qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            iptal_tarihi__date=gun,
            durum=TahsilatDurum.IPTAL_EDILDI,
        ).select_related('iptal_eden').order_by('-iptal_tarihi')
        if sube_id:
            t_qs = t_qs.filter(sozlesme__sube_id=sube_id)
        for t in t_qs:
            rows.append({
                'saat': _fmt_saat(t.iptal_tarihi),
                'islem_no': t.referans_no or f'TH-{t.id}',
                'sebep': (t.iptal_nedeni or '').strip() or '—',
                'kullanici': _user_display(t.iptal_eden),
                'tur': 'Tahsilat İptali',
                'tutar': int(t.tutar or 0),
            })

        gt_qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.IPTAL,
            updated_at__date=gun,
        ).select_related('islem_yapan', 'gelir_kaydi').order_by('-updated_at')
        if sube_id:
            gt_qs = gt_qs.filter(gelir_kaydi__sube_id=sube_id)
        for g in gt_qs:
            rows.append({
                'saat': _fmt_saat(g.updated_at),
                'islem_no': g.gelir_kaydi.fatura_no or f'GT-{g.id}',
                'sebep': 'Gelir tahsilat iptali',
                'kullanici': _user_display(g.islem_yapan),
                'tur': 'Gelir Tahsilat İptali',
                'tutar': _int_amount(g.tutar),
            })

        go_qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.IPTAL,
            updated_at__date=gun,
        ).select_related('islem_yapan', 'gider_kaydi').order_by('-updated_at')
        if sube_id:
            go_qs = go_qs.filter(gider_kaydi__sube_id=sube_id)
        for g in go_qs:
            rows.append({
                'saat': _fmt_saat(g.updated_at),
                'islem_no': g.gider_kaydi.fatura_no or f'GO-{g.id}',
                'sebep': 'Gider ödeme iptali',
                'kullanici': _user_display(g.islem_yapan),
                'tur': 'Gider Ödeme İptali',
                'tutar': _int_amount(g.tutar),
            })

        for gk in GelirKaydi.objects.filter(
            kurum_id=kurum_id, durum=GelirDurum.IPTAL, updated_at__date=gun,
        ).select_related('olusturan'):
            if sube_id and gk.sube_id != sube_id:
                continue
            rows.append({
                'saat': _fmt_saat(gk.updated_at),
                'islem_no': gk.fatura_no or f'GK-{gk.id}',
                'sebep': 'Gelir kaydı iptali',
                'kullanici': _user_display(gk.olusturan),
                'tur': 'Gelir Kaydı İptali',
                'tutar': _int_amount(gk.net_tutar),
            })

        for gd in GiderKaydi.objects.filter(
            kurum_id=kurum_id, durum=GiderDurum.IPTAL, updated_at__date=gun,
        ).select_related('olusturan'):
            if sube_id and gd.sube_id != sube_id:
                continue
            rows.append({
                'saat': _fmt_saat(gd.updated_at),
                'islem_no': gd.fatura_no or f'GK-{gd.id}',
                'sebep': 'Gider kaydı iptali',
                'kullanici': _user_display(gd.olusturan),
                'tur': 'Gider Kaydı İptali',
                'tutar': _int_amount(gd.net_tutar),
            })

        rows.sort(key=lambda r: r['saat'])
        return rows

    def _iade_islemleri(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            tahsilat_tarihi=gun,
            durum=TahsilatDurum.AKTIF,
            tahsilat_turu=TahsilatTuru.IADE,
        ).select_related('sozlesme__ogrenci').order_by('created_at')
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)

        rows = []
        for t in qs:
            ogr = t.sozlesme.ogrenci
            rows.append({
                'saat': _fmt_saat(t.created_at),
                'ogrenci': f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—',
                'tutar': int(t.tutar or 0),
                'aciklama': (t.aciklama or '').strip() or '—',
            })
        return rows

    def _odeme_turu_dagilimi(
        self, base: dict, tahsilat_listesi: list[dict], gelir_hareketleri: list[dict],
    ) -> dict:
        ozet_rows = base.get('tahsilatlar', {}).get('kirilim') or []
        detay = []
        for row in tahsilat_listesi:
            detay.append({
                'kaynak': 'Sözleşme Tahsilat',
                'saat': row['saat'],
                'odeme_turu': row['odeme_turu'],
                'tutar': row['tutar'],
                'aciklama': row['ogrenci'],
            })
        for row in gelir_hareketleri:
            detay.append({
                'kaynak': 'Gelir Tahsilat',
                'saat': row['saat'],
                'odeme_turu': row.get('odeme_turu', '—'),
                'tutar': row['tutar'],
                'aciklama': row['kategori'],
            })
        return {
            'ozet': [
                {
                    'tip': r['tip'],
                    'label': r['label'],
                    'tutar': r['toplam'],
                    'adet': r['adet'],
                }
                for r in ozet_rows
            ],
            'detay': detay,
        }

    def _kategori_gelirler(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            tahsilat_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        ).values('gelir_kaydi__gelir_kategorisi__ad').annotate(toplam=Sum('tutar'))
        if sube_id:
            qs = qs.filter(gelir_kaydi__sube_id=sube_id)

        rows = []
        for row in qs:
            rows.append({
                'kategori': row['gelir_kaydi__gelir_kategorisi__ad'] or 'Diğer',
                'tutar': _int_amount(row['toplam']),
            })
        rows.sort(key=lambda r: -r['tutar'])
        toplam = sum(r['tutar'] for r in rows)
        if rows:
            rows.append({'kategori': 'TOPLAM', 'tutar': toplam, 'is_total': True})
        return rows

    def _kategori_giderler(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            odeme_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        ).values('gider_kaydi__gider_kategorisi__ad').annotate(toplam=Sum('tutar'))
        if sube_id:
            qs = qs.filter(gider_kaydi__sube_id=sube_id)

        rows = []
        for row in qs:
            rows.append({
                'kategori': row['gider_kaydi__gider_kategorisi__ad'] or 'Diğer',
                'tutar': _int_amount(row['toplam']),
            })
        rows.sort(key=lambda r: -r['tutar'])
        toplam = sum(r['tutar'] for r in rows)
        if rows:
            rows.append({'kategori': 'TOPLAM', 'tutar': toplam, 'is_total': True})
        return rows

    def _kullanici_islem_detayi(
        self,
        tahsilat_listesi: list[dict],
        gelir_hareketleri: list[dict],
        gider_hareketleri: list[dict],
    ) -> list[dict]:
        grouped: dict[str, list[dict]] = defaultdict(list)

        for row in tahsilat_listesi:
            grouped[row['personel']].append({
                'saat': row['saat'],
                'tur': 'Tahsilat',
                'aciklama': f"{row['ogrenci']} — {row['makbuz']}",
                'tutar': row['tutar'],
            })
        for row in gelir_hareketleri:
            grouped[row['personel']].append({
                'saat': row['saat'],
                'tur': 'Gelir',
                'aciklama': f"{row['kategori']} — {row['gelir_kodu']}",
                'tutar': row['tutar'],
            })
        for row in gider_hareketleri:
            grouped[row['personel']].append({
                'saat': row['saat'],
                'tur': 'Gider',
                'aciklama': f"{row['kategori']} — {row['gider_kodu']}",
                'tutar': row['tutar'],
            })

        result = []
        for personel, islemler in grouped.items():
            islemler.sort(key=lambda x: x['saat'])
            result.append({
                'personel': personel,
                'islemler': islemler,
                'toplam': sum(i['tutar'] for i in islemler),
                'adet': len(islemler),
            })
        result.sort(key=lambda r: -r['toplam'])
        return result

    def _kasa_ozeti(self, kurum_id, gun, sube_id) -> dict:
        kasa_qs = MaliHesap.objects.filter(
            sube__kurum_id=kurum_id,
            tip=MaliHesapTipi.KASA,
            aktif_mi=True,
        )
        if sube_id:
            kasa_qs = kasa_qs.filter(sube_id=sube_id)

        acilis = 0
        gunluk_giris = 0
        gunluk_cikis = 0

        for hesap in kasa_qs:
            prev = BakiyeHareketi.objects.filter(
                mali_hesap_id=hesap.id,
                islem_tarihi__lt=gun,
            ).order_by('-islem_tarihi', '-created_at').first()
            acilis += int(prev.bakiye_sonrasi if prev else 0)

            day_qs = BakiyeHareketi.objects.filter(mali_hesap_id=hesap.id, islem_tarihi=gun)
            giris = day_qs.filter(yon=HareketYonu.GIRIS).aggregate(t=Sum('tutar'))['t'] or 0
            cikis = day_qs.filter(yon=HareketYonu.CIKIS).aggregate(t=Sum('tutar'))['t'] or 0
            gunluk_giris += int(giris)
            gunluk_cikis += int(cikis)

        beklenen = acilis + gunluk_giris - gunluk_cikis
        return {
            'acilis_kasa': acilis,
            'gunluk_giris': gunluk_giris,
            'gunluk_cikis': gunluk_cikis,
            'beklenen_kasa': beklenen,
            'sayilan_kasa': None,
            'kasa_farki': 0,
            'sayim_yapildi': False,
            'not': 'Fiziksel kasa sayımı henüz sisteme girilmedi; beklenen tutar hesaplanmıştır.',
        }
