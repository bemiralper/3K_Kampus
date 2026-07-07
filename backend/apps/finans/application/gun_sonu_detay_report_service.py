"""
Gün Sonu Detay Raporu — yönetim odaklı tam gün kapanış raporu.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime

from django.db.models import Count, Sum
from django.utils import timezone

from apps.finans.application.gun_sonu_finans_helpers import (
    build_grafik_verileri,
    build_kasa_ozeti,
    bugun_islem_q,
    gun_local_datetime_q,
    int_amount,
    kova_listesi_with_yuzde,
    net_nakit_degisim,
    odeme_kirilimi_topla,
)
from apps.finans.application.gun_sonu_report_service import (
    GunSonuReportService,
    _fmt_date,
    _fmt_datetime,
    _user_display,
)
from apps.finans.application.gun_sonu_service import GunSonuService
from apps.finans.constants.account_types import BankaKodu, MaliHesapTipi
from apps.finans.constants.cari_types import GelirDurum
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu, TransferTuru
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_kaydi import GelirKaydi
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.odeme_takip.domain.enums import SozlesmeDurum, TahsilatDurum, TahsilatTuru, TaksitDurum


def _fmt_saat(dt: datetime | None) -> str:
    if not dt:
        return '—'
    local = timezone.localtime(dt) if timezone.is_aware(dt) else dt
    return local.strftime('%H:%M')


def _odeme_label(odeme_yontemi) -> str:
    if not odeme_yontemi:
        return '—'
    return getattr(odeme_yontemi, 'ad', None) or odeme_yontemi.get_tip_display()


def _taksit_donem_label(taksit) -> str:
    if not taksit or not taksit.vade_tarihi:
        return '—'
    return taksit.vade_tarihi.strftime('%m.%Y')


def _banka_label(mali_hesap) -> str:
    if not mali_hesap:
        return '—'
    if getattr(mali_hesap, 'banka', None):
        return BankaKodu.get_label(mali_hesap.banka)
    return (getattr(mali_hesap, 'banka_adi', None) or '').strip() or '—'


class GunSonuDetayReportService:
    """Gün sonu detay raporu — operasyonel + finansal yönetim raporu."""

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
            base=base,
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

        odeme_kova = odeme_kirilimi_topla(kurum_id, gun, sube_id)
        tahsilat_ozeti = kova_listesi_with_yuzde(odeme_kova)
        odeme_turu_dagilimi = self._odeme_turu_dagilimi(tahsilat_ozeti, tahsilat_listesi, gelir_hareketleri)

        kategori_gelirler = self._kategori_gelirler(kurum_id, gun, sube_id)
        kategori_giderler = self._kategori_giderler(kurum_id, gun, sube_id)
        saatlik = self._saatlik_tahsilat(tahsilat_listesi, gelir_hareketleri)

        personel_performans = self._personel_performans(
            kurum_id, gun, sube_id,
            tahsilat_listesi, gelir_hareketleri, gider_hareketleri,
            iptal_islemleri, iade_islemleri,
        )
        kullanici_detay = self._kullanici_islem_detayi(
            tahsilat_listesi, gelir_hareketleri, gider_hareketleri,
        )

        kasa_ozeti = build_kasa_ozeti(kurum_id, gun, sube_id)
        kasa_hareketleri = self._kasa_hareketleri(kurum_id, gun, sube_id)
        banka_hareketleri = self._banka_hareketleri(kurum_id, gun, sube_id)
        pos_hareketleri = self._pos_hareketleri(kurum_id, gun, sube_id)
        ogrenci_hareketleri = self._ogrenci_hareketleri(kurum_id, gun, sube_id)
        gunluk_finans_ozeti = self._gunluk_finans_ozeti(kurum_id, gun, sube_id, ozet)
        yonetici_ozeti = self._yonetici_ozeti(
            kurum_id, gun, sube_id, ozet, gunluk_finans_ozeti, ogrenci_hareketleri,
        )
        uyarilar = self._uyarilar(kasa_ozeti, gunluk_finans_ozeti, iptal_islemleri, kurum_id, gun, sube_id)
        grafikler = build_grafik_verileri(tahsilat_ozeti, kategori_gelirler, kategori_giderler, saatlik)

        gunluk_ozet = dict(ozet.get('gunluk_ozet') or {})
        gunluk_ozet['net_nakit_girisi'] = net_nakit_degisim(kurum_id, gun, sube_id)

        meta = {
            'marka': kurum_ad or '',
            'baslik': 'GÜN SONU DETAY RAPORU',
            'tarih': _fmt_date(gun),
            'tarih_iso': str(gun),
            'sube': sube_ad or 'Tüm Şubeler',
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
            'yonetici_ozeti': yonetici_ozeti,
            'uyarilar': uyarilar,
            'ozet': gunluk_ozet,
            'gunluk_finans_ozeti': gunluk_finans_ozeti,
            'tahsilat_ozeti': tahsilat_ozeti,
            'tahsilat_listesi': tahsilat_listesi,
            'gelir_hareketleri': gelir_hareketleri,
            'gider_hareketleri': gider_hareketleri,
            'cari_hareketleri': cari_hareketleri,
            'ogrenci_hareketleri': ogrenci_hareketleri,
            'iptal_islemleri': iptal_islemleri,
            'iade_islemleri': iade_islemleri,
            'odeme_turu_dagilimi': odeme_turu_dagilimi,
            'kategori_gelirler': kategori_gelirler,
            'kategori_giderler': kategori_giderler,
            'personel_performans': personel_performans,
            'kullanici_islem_detayi': kullanici_detay,
            'kasa_hareketleri': kasa_hareketleri,
            'banka_hareketleri': banka_hareketleri,
            'pos_hareketleri': pos_hareketleri,
            'kasa_ozeti': kasa_ozeti,
            'grafikler': grafikler,
            'sistem': {
                'olusturulma_tarihi': meta['olusturulma'],
                'raporu_olusturan': meta['hazirlayan'],
                'sube': meta['sube'],
                'tarih': meta['tarih'],
            },
            'notlar': (notlar or '').strip(),
            'islem_sayilari': ozet.get('islem_sayilari') or {},
        }

        return {**base, 'ozet_rapor': ozet, 'detay_rapor': detay}

    # ─── Bölüm veri toplayıcıları ───────────────────────────────

    def _tahsilat_listesi(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(
            bugun_islem_q('tahsilat_tarihi', gun),
        ).select_related(
            'sozlesme__ogrenci', 'sozlesme__veli', 'odeme_yontemi', 'islem_yapan', 'taksit',
        ).order_by('created_at')
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)

        rows = []
        for t in qs:
            ogr = t.sozlesme.ogrenci
            veli = t.sozlesme.veli
            taksit = t.taksit
            rows.append({
                'saat': _fmt_saat(t.created_at),
                'sozlesme_no': t.sozlesme.sozlesme_no or '—',
                'makbuz': t.referans_no or f'TH-{t.id}',
                'ogrenci': f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—',
                'veli': veli.tam_ad if veli else '—',
                'taksit_no': taksit.taksit_no if taksit else '—',
                'odeme_donemi': _taksit_donem_label(taksit),
                'odeme_turu': _odeme_label(t.odeme_yontemi),
                'tutar': int(t.tutar or 0),
                'personel': _user_display(t.islem_yapan),
                'aciklama': (t.aciklama or '').strip() or '—',
            })
        return rows

    def _gelir_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).filter(bugun_islem_q('tahsilat_tarihi', gun)).select_related(
            'gelir_kaydi__gelir_kategorisi', 'islem_yapan', 'odeme_yontemi', 'mali_hesap',
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
                'kasa': g.mali_hesap.ad if g.mali_hesap else '—',
                'odeme_turu': _odeme_label(g.odeme_yontemi),
                'belge_no': kayit.fatura_no or '—',
                'tutar': int_amount(g.tutar),
                'personel': _user_display(g.islem_yapan),
            })
        return rows

    def _gider_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            odeme_tarihi=gun,
            durum=OdemeDurum.TAMAMLANDI,
        ).select_related(
            'gider_kaydi__gider_kategorisi',
            'gider_kaydi__cari_hesap',
            'gider_kaydi__onaylayan',
            'islem_yapan',
            'odeme_yontemi',
            'mali_hesap',
        ).order_by('created_at')
        if sube_id:
            qs = qs.filter(gider_kaydi__sube_id=sube_id)

        rows = []
        for g in qs:
            kayit = g.gider_kaydi
            kat = kayit.gider_kategorisi
            cari = kayit.cari_hesap
            rows.append({
                'saat': _fmt_saat(g.created_at),
                'gider_kodu': kayit.fatura_no or f'GD-{kayit.id}',
                'kategori': kat.ad if kat else 'Diğer',
                'cari': cari.unvan if cari else '—',
                'odeme_turu': _odeme_label(g.odeme_yontemi) if not g.bakiyeden_mahsup else 'Cari Mahsup',
                'kasa': g.mali_hesap.ad if g.mali_hesap else ('—' if g.bakiyeden_mahsup else '—'),
                'aciklama': (g.aciklama or kayit.aciklama or '').strip() or '—',
                'onaylayan': _user_display(kayit.onaylayan),
                'tutar': int_amount(g.tutar),
                'personel': _user_display(g.islem_yapan),
            })
        return rows

    def _cari_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        """Yalnızca bugün hareket gören cariler."""
        qs = CariHareket.objects.filter(
            kurum_id=kurum_id,
            islem_tarihi=gun,
        ).select_related('cari_hesap').order_by('cari_hesap__unvan', 'created_at')
        if sube_id:
            qs = qs.filter(sube_id=sube_id)

        agg: dict[int, dict] = {}
        last_balance: dict[int, int] = {}
        for h in qs:
            cid = h.cari_hesap_id
            if cid not in agg:
                agg[cid] = {
                    'cari': h.cari_hesap.unvan if h.cari_hesap else '—',
                    'borc': 0,
                    'alacak': 0,
                    'bakiye': 0,
                }
            tutar = int_amount(h.tutar)
            if h.yon == 'borc':
                agg[cid]['borc'] += tutar
            else:
                agg[cid]['alacak'] += tutar
            last_balance[cid] = int_amount(h.alacak_sonrasi) - int_amount(h.borc_sonrasi)

        for cid, bakiye in last_balance.items():
            agg[cid]['bakiye'] = bakiye

        rows = list(agg.values())
        rows.sort(key=lambda r: r['cari'])
        return rows

    def _iptal_islemleri(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        rows: list[dict] = []

        t_qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.IPTAL_EDILDI,
        ).filter(gun_local_datetime_q('iptal_tarihi', gun)).select_related('iptal_eden').order_by('-iptal_tarihi')
        if sube_id:
            t_qs = t_qs.filter(sozlesme__sube_id=sube_id)
        for t in t_qs:
            rows.append({
                'saat': _fmt_saat(t.iptal_tarihi),
                'islem_no': t.referans_no or f'TH-{t.id}',
                'islem_turu': 'Tahsilat İptali',
                'eski_tutar': int(t.tutar or 0),
                'yeni_durum': 'İptal Edildi',
                'sebep': (t.iptal_nedeni or '').strip() or '—',
                'kullanici': _user_display(t.iptal_eden),
                'tur': 'Tahsilat İptali',
                'tutar': int(t.tutar or 0),
            })

        gt_qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun)).select_related('islem_yapan', 'gelir_kaydi').order_by('-updated_at')
        if sube_id:
            gt_qs = gt_qs.filter(gelir_kaydi__sube_id=sube_id)
        for g in gt_qs:
            rows.append({
                'saat': _fmt_saat(g.updated_at),
                'islem_no': g.gelir_kaydi.fatura_no or f'GT-{g.id}',
                'islem_turu': 'Gelir Tahsilat İptali',
                'eski_tutar': int_amount(g.tutar),
                'yeni_durum': 'İptal',
                'sebep': 'Gelir tahsilat iptali',
                'kullanici': _user_display(g.islem_yapan),
                'tur': 'Gelir Tahsilat İptali',
                'tutar': int_amount(g.tutar),
            })

        go_qs = GiderOdeme.objects.filter(
            gider_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun)).select_related('islem_yapan', 'gider_kaydi').order_by('-updated_at')
        if sube_id:
            go_qs = go_qs.filter(gider_kaydi__sube_id=sube_id)
        for g in go_qs:
            rows.append({
                'saat': _fmt_saat(g.updated_at),
                'islem_no': g.gider_kaydi.fatura_no or f'GO-{g.id}',
                'islem_turu': 'Gider Ödeme İptali',
                'eski_tutar': int_amount(g.tutar),
                'yeni_durum': 'İptal',
                'sebep': 'Gider ödeme iptali',
                'kullanici': _user_display(g.islem_yapan),
                'tur': 'Gider Ödeme İptali',
                'tutar': int_amount(g.tutar),
            })

        for gk in GelirKaydi.objects.filter(
            kurum_id=kurum_id, durum=GelirDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun)).select_related('olusturan'):
            if sube_id and gk.sube_id != sube_id:
                continue
            rows.append({
                'saat': _fmt_saat(gk.updated_at),
                'islem_no': gk.fatura_no or f'GK-{gk.id}',
                'islem_turu': 'Gelir Kaydı İptali',
                'eski_tutar': int_amount(gk.net_tutar),
                'yeni_durum': 'İptal',
                'sebep': 'Gelir kaydı iptali',
                'kullanici': _user_display(gk.olusturan),
                'tur': 'Gelir Kaydı İptali',
                'tutar': int_amount(gk.net_tutar),
            })

        for gd in GiderKaydi.objects.filter(
            kurum_id=kurum_id, durum=GiderDurum.IPTAL,
        ).filter(gun_local_datetime_q('updated_at', gun)).select_related('olusturan'):
            if sube_id and gd.sube_id != sube_id:
                continue
            rows.append({
                'saat': _fmt_saat(gd.updated_at),
                'islem_no': gd.fatura_no or f'GD-{gd.id}',
                'islem_turu': 'Gider Kaydı İptali',
                'eski_tutar': int_amount(gd.net_tutar),
                'yeni_durum': 'İptal',
                'sebep': 'Gider kaydı iptali',
                'kullanici': _user_display(gd.olusturan),
                'tur': 'Gider Kaydı İptali',
                'tutar': int_amount(gd.net_tutar),
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
        ).select_related('sozlesme__ogrenci', 'islem_yapan').order_by('created_at')
        if sube_id:
            qs = qs.filter(sozlesme__sube_id=sube_id)

        rows = []
        for t in qs:
            ogr = t.sozlesme.ogrenci
            rows.append({
                'saat': _fmt_saat(t.created_at),
                'ogrenci': f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—',
                'iade_nedeni': (t.aciklama or '').strip() or '—',
                'tutar': int(t.tutar or 0),
                'iade_tarihi': _fmt_date(t.tahsilat_tarihi),
                'onaylayan': _user_display(t.islem_yapan),
                'kullanici': _user_display(t.islem_yapan),
                'aciklama': (t.aciklama or '').strip() or '—',
            })
        return rows

    def _odeme_turu_dagilimi(
        self, tahsilat_ozeti: list[dict], tahsilat_listesi: list[dict], gelir_hareketleri: list[dict],
    ) -> dict:
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
                    'tutar': r['tutar'],
                    'adet': r.get('adet'),
                    'yuzde': r.get('yuzde'),
                }
                for r in tahsilat_ozeti
            ],
            'detay': detay,
        }

    def _kategori_gelirler(self, kurum_id, gun, sube_id) -> list[dict]:
        qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
        ).filter(bugun_islem_q('tahsilat_tarihi', gun)).values('gelir_kaydi__gelir_kategorisi__ad').annotate(toplam=Sum('tutar'))
        if sube_id:
            qs = qs.filter(gelir_kaydi__sube_id=sube_id)

        rows = []
        for row in qs:
            rows.append({
                'kategori': row['gelir_kaydi__gelir_kategorisi__ad'] or 'Diğer',
                'tutar': int_amount(row['toplam']),
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
                'tutar': int_amount(row['toplam']),
            })
        rows.sort(key=lambda r: -r['tutar'])
        toplam = sum(r['tutar'] for r in rows)
        if rows:
            rows.append({'kategori': 'TOPLAM', 'tutar': toplam, 'is_total': True})
        return rows

    def _saatlik_tahsilat(
        self,
        tahsilat_listesi: list[dict],
        gelir_hareketleri: list[dict] | None = None,
    ) -> list[dict]:
        buckets: dict[str, int] = defaultdict(int)
        for row in tahsilat_listesi:
            saat = row.get('saat', '—')
            if saat == '—':
                continue
            hour = saat.split(':')[0]
            buckets[hour] += int(row.get('tutar') or 0)
        for row in gelir_hareketleri or []:
            saat = row.get('saat', '—')
            if saat == '—':
                continue
            hour = saat.split(':')[0]
            buckets[hour] += int(row.get('tutar') or 0)
        return [{'saat': f'{h}:00', 'tutar': t} for h, t in sorted(buckets.items())]

    def _personel_performans(
        self, kurum_id, gun, sube_id,
        tahsilat_listesi, gelir_hareketleri, gider_hareketleri,
        iptal_islemleri, iade_islemleri,
    ) -> list[dict]:
        stats: dict[str, dict] = defaultdict(lambda: {
            'tahsilat_sayisi': 0, 'tahsilat_tutari': 0,
            'gelir_sayisi': 0, 'gider_sayisi': 0,
            'iade_sayisi': 0, 'iptal_sayisi': 0,
        })

        for row in tahsilat_listesi:
            p = row['personel']
            stats[p]['tahsilat_sayisi'] += 1
            stats[p]['tahsilat_tutari'] += row['tutar']

        for row in gelir_hareketleri:
            stats[row['personel']]['gelir_sayisi'] += 1

        for row in gider_hareketleri:
            stats[row['personel']]['gider_sayisi'] += 1

        for row in iade_islemleri:
            stats[row['kullanici']]['iade_sayisi'] += 1

        for row in iptal_islemleri:
            stats[row['kullanici']]['iptal_sayisi'] += 1

        result = []
        for personel, s in stats.items():
            toplam_islem = (
                s['tahsilat_sayisi'] + s['gelir_sayisi'] + s['gider_sayisi']
                + s['iade_sayisi'] + s['iptal_sayisi']
            )
            if toplam_islem == 0:
                continue
            result.append({
                'personel': personel,
                'tahsilat_sayisi': s['tahsilat_sayisi'],
                'tahsilat_tutari': s['tahsilat_tutari'],
                'gelir_sayisi': s['gelir_sayisi'],
                'gider_sayisi': s['gider_sayisi'],
                'iade_sayisi': s['iade_sayisi'],
                'iptal_sayisi': s['iptal_sayisi'],
                'toplam_islem': toplam_islem,
            })
        result.sort(key=lambda r: -r['tahsilat_tutari'])
        return result

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

    def _kasa_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.finans.domain.hesap_transferi import HesapTransferi

        kasa_qs = MaliHesap.objects.filter(
            sube__kurum_id=kurum_id, tip=MaliHesapTipi.KASA, aktif_mi=True,
        )
        if sube_id:
            kasa_qs = kasa_qs.filter(sube_id=sube_id)
        kasa_ids = list(kasa_qs.values_list('id', flat=True))

        rows: list[dict] = []
        hareket_qs = BakiyeHareketi.objects.filter(
            mali_hesap_id__in=kasa_ids,
            islem_tarihi=gun,
        ).select_related('mali_hesap', 'islem_yapan').order_by('created_at')

        for h in hareket_qs:
            rows.append({
                'saat': _fmt_saat(h.created_at),
                'kasa': h.mali_hesap.ad if h.mali_hesap else '—',
                'yon': 'Giriş' if h.yon == HareketYonu.GIRIS else 'Çıkış',
                'kaynak': HareketKaynagi.get_label(h.kaynak),
                'tutar': int(h.tutar),
                'aciklama': (h.aciklama or '').strip() or '—',
                'personel': _user_display(h.islem_yapan),
            })

        transfer_qs = HesapTransferi.objects.filter(
            kurum_id=kurum_id, transfer_tarihi=gun,
        ).select_related('kaynak_hesap', 'hedef_hesap', 'islem_yapan')
        if sube_id:
            transfer_qs = transfer_qs.filter(sube_id=sube_id)

        for t in transfer_qs:
            if t.kaynak_hesap_id in kasa_ids:
                rows.append({
                    'saat': _fmt_saat(t.created_at),
                    'kasa': t.kaynak_hesap.ad,
                    'yon': 'Çıkış',
                    'kaynak': TransferTuru.get_label(t.transfer_turu),
                    'tutar': int(t.tutar),
                    'aciklama': (t.aciklama or '').strip() or f'{t.kaynak_hesap.ad} → {t.hedef_hesap.ad}',
                    'personel': _user_display(t.islem_yapan),
                })
            if t.hedef_hesap_id in kasa_ids:
                rows.append({
                    'saat': _fmt_saat(t.created_at),
                    'kasa': t.hedef_hesap.ad,
                    'yon': 'Giriş',
                    'kaynak': TransferTuru.get_label(t.transfer_turu),
                    'tutar': int(t.tutar),
                    'aciklama': (t.aciklama or '').strip() or f'{t.kaynak_hesap.ad} → {t.hedef_hesap.ad}',
                    'personel': _user_display(t.islem_yapan),
                })

        rows.sort(key=lambda r: r['saat'])
        return rows

    def _banka_hareketleri(self, kurum_id, gun, sube_id) -> dict:
        from apps.finans.domain.hesap_transferi import HesapTransferi

        banka_qs = MaliHesap.objects.filter(
            sube__kurum_id=kurum_id, tip=MaliHesapTipi.BANKA, aktif_mi=True,
        )
        if sube_id:
            banka_qs = banka_qs.filter(sube_id=sube_id)
        banka_ids = list(banka_qs.values_list('id', flat=True))

        detay: list[dict] = []
        toplamlar: dict[str, dict] = defaultdict(lambda: {'giris': 0, 'cikis': 0})

        hareket_qs = BakiyeHareketi.objects.filter(
            mali_hesap_id__in=banka_ids,
            islem_tarihi=gun,
        ).select_related('mali_hesap').order_by('created_at')

        for h in hareket_qs:
            hesap_ad = h.mali_hesap.ad if h.mali_hesap else '—'
            if h.yon == HareketYonu.GIRIS:
                toplamlar[hesap_ad]['giris'] += int(h.tutar)
            else:
                toplamlar[hesap_ad]['cikis'] += int(h.tutar)
            detay.append({
                'saat': _fmt_saat(h.created_at),
                'banka': hesap_ad,
                'yon': 'Giriş' if h.yon == HareketYonu.GIRIS else 'Çıkış',
                'tur': HareketKaynagi.get_label(h.kaynak),
                'tutar': int(h.tutar),
                'aciklama': (h.aciklama or '').strip() or '—',
            })

        transfer_qs = HesapTransferi.objects.filter(
            kurum_id=kurum_id, transfer_tarihi=gun,
        ).select_related('kaynak_hesap', 'hedef_hesap')
        if sube_id:
            transfer_qs = transfer_qs.filter(sube_id=sube_id)

        havale_toplam = 0
        eft_toplam = 0
        for t in transfer_qs:
            if t.kaynak_hesap_id in banka_ids or t.hedef_hesap_id in banka_ids:
                if t.transfer_turu == TransferTuru.KASADAN_BANKAYA:
                    eft_toplam += int(t.tutar)
                elif t.transfer_turu == TransferTuru.BANKADAN_KASAYA:
                    havale_toplam += int(t.tutar)

        banka_bazli = [
            {
                'banka': ad,
                'giris': vals['giris'],
                'cikis': vals['cikis'],
                'net': vals['giris'] - vals['cikis'],
            }
            for ad, vals in sorted(toplamlar.items())
        ]

        return {
            'havale': havale_toplam,
            'eft': eft_toplam,
            'banka_girisleri': sum(v['giris'] for v in toplamlar.values()),
            'banka_cikislari': sum(v['cikis'] for v in toplamlar.values()),
            'banka_bazli_toplamlar': banka_bazli,
            'detay': detay,
        }

    def _pos_hareketleri(self, kurum_id, gun, sube_id) -> list[dict]:
        from apps.odeme_takip.domain.models import Tahsilat

        agg: dict[tuple, dict] = defaultdict(lambda: {'tutar': 0, 'adet': 0})

        t_qs = Tahsilat.objects.filter(
            sozlesme__kurum_id=kurum_id,
            durum=TahsilatDurum.AKTIF,
            odeme_yontemi__tip=OdemeYontemiTipi.POS,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(
            bugun_islem_q('tahsilat_tarihi', gun),
        ).select_related('mali_hesap', 'odeme_yontemi')
        if sube_id:
            t_qs = t_qs.filter(sozlesme__sube_id=sube_id)

        for t in t_qs:
            pos_ad = t.mali_hesap.ad if t.mali_hesap else (t.odeme_yontemi.ad if t.odeme_yontemi else 'POS')
            banka = _banka_label(t.mali_hesap)
            key = (pos_ad, banka, 'POS')
            agg[key]['tutar'] += int(t.tutar or 0)
            agg[key]['adet'] += 1

        g_qs = GelirTahsilat.objects.filter(
            gelir_kaydi__kurum_id=kurum_id,
            durum=OdemeDurum.TAMAMLANDI,
            odeme_yontemi__tip=OdemeYontemiTipi.POS,
        ).filter(bugun_islem_q('tahsilat_tarihi', gun)).select_related('mali_hesap', 'odeme_yontemi')
        if sube_id:
            g_qs = g_qs.filter(gelir_kaydi__sube_id=sube_id)
        for g in g_qs:
            pos_ad = g.mali_hesap.ad if g.mali_hesap else (g.odeme_yontemi.ad if g.odeme_yontemi else 'POS')
            banka = _banka_label(g.mali_hesap)
            key = (pos_ad, banka, 'POS')
            agg[key]['tutar'] += int_amount(g.tutar)
            agg[key]['adet'] += 1

        rows = []
        for (pos, banka, kart), val in sorted(agg.items(), key=lambda x: -x[1]['tutar']):
            rows.append({
                'pos_cihazi': pos,
                'banka': banka or '—',
                'kart_turu': kart,
                'tutar': val['tutar'],
                'islem_sayisi': val['adet'],
            })
        return rows

    def _ogrenci_hareketleri(self, kurum_id, gun, sube_id) -> dict:
        from apps.odeme_takip.domain.models import Sozlesme, SozlesmeFesih
        from apps.ogrenci.domain.models import OgrenciKayit

        kayit_qs = OgrenciKayit.objects.filter(kurum_id=kurum_id).select_related('ogrenci')
        if sube_id:
            kayit_qs = kayit_qs.filter(sube_id=sube_id)

        on_kayit = []
        kesin_kayit = []
        kayit_iptalleri = []
        ayrilan = []

        for k in kayit_qs.filter(created_at__date=gun):
            ogr_ad = k.ogrenci.tam_ad if hasattr(k.ogrenci, 'tam_ad') else f'{k.ogrenci.ad} {k.ogrenci.soyad}'
            row = {'ogrenci': ogr_ad.strip(), 'tarih': _fmt_date(gun), 'giris_turu': k.get_giris_turu_display()}
            if k.giris_turu == 'on_kayit':
                on_kayit.append(row)
            elif k.giris_turu in ('yeni_kayit', 'kayit_yenileme', 'zorunlu_kayit'):
                kesin_kayit.append(row)

        for k in kayit_qs.filter(updated_at__date=gun, aktif_mi=False):
            ogr_ad = k.ogrenci.tam_ad if hasattr(k.ogrenci, 'tam_ad') else f'{k.ogrenci.ad} {k.ogrenci.soyad}'
            kayit_iptalleri.append({
                'ogrenci': ogr_ad.strip(),
                'tarih': _fmt_date(gun),
                'aciklama': 'Kayıt pasifleştirildi',
            })

        nakil = []
        try:
            from apps.academic.domain.student_class_placement import PlacementType, StudentClassPlacement

            placement_qs = StudentClassPlacement.objects.filter(
                created_at__date=gun,
                placement_type=PlacementType.TRANSFER,
                student__kurum_id=kurum_id,
            ).select_related('student')
            if sube_id:
                placement_qs = placement_qs.filter(classroom__sube_id=sube_id)
            for p in placement_qs:
                nakil.append({
                    'ogrenci': f'{p.student.ad} {p.student.soyad}'.strip(),
                    'tarih': _fmt_date(gun),
                    'aciklama': 'Nakil işlemi',
                })
        except Exception:
            nakil = []

        fesih_qs = SozlesmeFesih.objects.filter(
            fesih_tarihi=gun,
            sozlesme__kurum_id=kurum_id,
        ).select_related('sozlesme__ogrenci')
        if sube_id:
            fesih_qs = fesih_qs.filter(sozlesme__sube_id=sube_id)
        for f in fesih_qs:
            ogr = f.sozlesme.ogrenci
            ayrilan.append({
                'ogrenci': f'{ogr.ad} {ogr.soyad}'.strip(),
                'tarih': _fmt_date(f.fesih_tarihi),
                'aciklama': f.get_fesih_nedeni_display() if f.fesih_nedeni else 'Sözleşme feshi',
            })

        sozlesme_qs = Sozlesme.objects.filter(kurum_id=kurum_id, created_at__date=gun).exclude(
            durum=SozlesmeDurum.TASLAK,
        )
        if sube_id:
            sozlesme_qs = sozlesme_qs.filter(sube_id=sube_id)
        yeni_sozlesme = sozlesme_qs.count()

        return {
            'yeni_on_kayit': on_kayit,
            'yeni_kesin_kayit': kesin_kayit,
            'kayit_iptalleri': kayit_iptalleri,
            'nakil_islemleri': nakil,
            'ayrilan_ogrenciler': ayrilan,
            'ozet': {
                'yeni_on_kayit': len(on_kayit),
                'yeni_kesin_kayit': len(kesin_kayit),
                'kayit_iptali': len(kayit_iptalleri),
                'nakil': len(nakil),
                'ayrilan': len(ayrilan),
                'yeni_sozlesme': yeni_sozlesme,
            },
        }

    def _gunluk_finans_ozeti(self, kurum_id, gun, sube_id, ozet: dict) -> dict:
        from apps.odeme_takip.domain.models import Sozlesme, Taksit

        gunluk = ozet.get('gunluk_ozet') or {}
        soz_qs = Sozlesme.objects.filter(
            kurum_id=kurum_id,
            created_at__date=gun,
        ).exclude(durum=SozlesmeDurum.TASLAK)
        if sube_id:
            soz_qs = soz_qs.filter(sube_id=sube_id)
        toplam_sozlesme = int(soz_qs.aggregate(t=Sum('net_tutar'))['t'] or 0)

        iskonto = 0
        for s in soz_qs.only('brut_tutar', 'net_tutar'):
            iskonto += max(0, int(s.brut_tutar or 0) - int(s.net_tutar or 0))

        bekleyen_qs = Taksit.objects.filter(
            sozlesme__kurum_id=kurum_id,
            vade_tarihi=gun,
            durum=TaksitDurum.BEKLEMEDE,
            kalan_tutar__gt=0,
        )
        if sube_id:
            bekleyen_qs = bekleyen_qs.filter(sozlesme__sube_id=sube_id)
        bekleyen_tahsilat = int(bekleyen_qs.aggregate(t=Sum('kalan_tutar'))['t'] or 0)

        return {
            'toplam_sozlesme_tutari': toplam_sozlesme,
            'gunluk_tahsilat': gunluk.get('toplam_tahsilat', 0),
            'gunluk_gelir': gunluk.get('toplam_gelir', 0),
            'gunluk_gider': gunluk.get('toplam_gider', 0),
            'gunluk_iade': gunluk.get('toplam_iade', 0),
            'gunluk_iskonto': iskonto,
            'bekleyen_tahsilatlar': bekleyen_tahsilat,
            'net_gunluk_finansal_sonuc': gunluk.get(
                'net_gunluk_finansal_sonuc',
                gunluk.get('toplam_tahsilat', 0) + gunluk.get('toplam_gelir', 0)
                - gunluk.get('toplam_gider', 0) - gunluk.get('toplam_iade', 0),
            ),
        }

    def _yonetici_ozeti(
        self, kurum_id, gun, sube_id, ozet, finans, ogrenci_h,
    ) -> dict:
        from apps.odeme_takip.domain.models import Taksit

        gunluk = ozet.get('gunluk_ozet') or {}
        ogr_oz = ogrenci_h.get('ozet') or {}

        geciken_qs = Taksit.objects.filter(
            sozlesme__kurum_id=kurum_id,
            vade_tarihi=gun,
            durum=TaksitDurum.GECIKTI,
        )
        if sube_id:
            geciken_qs = geciken_qs.filter(sozlesme__sube_id=sube_id)

        gelir_fatura = GelirKaydi.objects.filter(kurum_id=kurum_id, fatura_tarihi=gun).exclude(
            durum=GelirDurum.IPTAL,
        )
        if sube_id:
            gelir_fatura = gelir_fatura.filter(sube_id=sube_id)

        islem = ozet.get('islem_sayilari') or {}

        return {
            'yeni_ogrenci': ogr_oz.get('yeni_on_kayit', 0) + ogr_oz.get('yeni_kesin_kayit', 0),
            'yeni_sozlesme': ogr_oz.get('yeni_sozlesme', 0),
            'tahsilat': gunluk.get('toplam_alinan', gunluk.get('toplam_tahsilat', 0)),
            'gelir': gunluk.get('toplam_gelir', 0),
            'gider': gunluk.get('toplam_gider', 0),
            'iade': gunluk.get('toplam_iade', 0),
            'iptal': islem.get('iptal', 0),
            'gecikmeye_dusen_yeni_taksit': geciken_qs.count(),
            'bekleyen_tahsilatlar': finans.get('bekleyen_tahsilatlar', 0),
            'kesilen_fatura': gelir_fatura.count(),
        }

    def _uyarilar(self, kasa_ozeti, finans, iptaller, kurum_id, gun, sube_id) -> list[dict]:
        uyarilar: list[dict] = []

        if kasa_ozeti.get('sayim_yapildi') and kasa_ozeti.get('kasa_farki', 0) != 0:
            uyarilar.append({
                'seviye': 'kritik',
                'mesaj': f"Kasada fark var: {kasa_ozeti['kasa_farki']:+,} TL",
            })
        elif not kasa_ozeti.get('sayim_yapildi'):
            uyarilar.append({
                'seviye': 'bilgi',
                'mesaj': 'Eksik kasa sayımı — fiziksel sayım henüz girilmedi.',
            })

        if finans.get('bekleyen_tahsilatlar', 0) > 0:
            uyarilar.append({
                'seviye': 'uyari',
                'mesaj': f"Bekleyen tahsilatlar: {finans['bekleyen_tahsilatlar']:,} TL".replace(',', '.'),
            })

        onaysiz = GiderKaydi.objects.filter(
            kurum_id=kurum_id,
            fatura_tarihi=gun,
            durum=GiderDurum.ONAY_BEKLIYOR,
        )
        if sube_id:
            onaysiz = onaysiz.filter(sube_id=sube_id)
        if onaysiz.exists():
            uyarilar.append({
                'seviye': 'uyari',
                'mesaj': f'Onaysız gider kayıtları: {onaysiz.count()} adet',
            })

        if iptaller:
            uyarilar.append({
                'seviye': 'uyari',
                'mesaj': f'İptal edilen işlemler: {len(iptaller)} adet',
            })

        from apps.odeme_takip.domain.models import Taksit
        yeni_geciken = Taksit.objects.filter(
            sozlesme__kurum_id=kurum_id,
            vade_tarihi=gun,
            durum=TaksitDurum.GECIKTI,
            updated_at__date=gun,
        )
        if sube_id:
            yeni_geciken = yeni_geciken.filter(sozlesme__sube_id=sube_id)
        if yeni_geciken.exists():
            uyarilar.append({
                'seviye': 'uyari',
                'mesaj': f'Gecikmeye düşen yeni taksitler: {yeni_geciken.count()} adet',
            })

        return uyarilar
