"""
Finans Dashboard Overview — tek response'ta tüm özet blokları.
Mevcut PeriodService, DonemBakiyeSelector ve gider aggregation'ları compose eder.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.finans.application.period.period_service import PeriodService, _sozlesme_ids
from apps.finans.application.selectors.donem_bakiye_selector import DonemBakiyeSelector
from apps.finans.application.selectors.gider_selector import GiderSelector
from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.cari_types import CariHareketTuru
from apps.finans.constants.gider_types import GiderDurum, OdemeDurum
from apps.finans.domain.cari_hareket import CariHareket
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru
from apps.odeme_takip.domain.models import Tahsilat
from apps.odeme_takip.domain.overdue import gecikme_gunu, get_overdue_taksit_queryset
from apps.finans.application.period.period_service import parse_date


def _month_end(d: date) -> date:
    return d.replace(day=monthrange(d.year, d.month)[1])


def _gun_datetime_araligi(gun: date) -> tuple[datetime, datetime]:
    """Yerel iş günü için created_at aralığı (Europe/Istanbul)."""
    tz = timezone.get_current_timezone()
    baslangic = timezone.make_aware(datetime.combine(gun, time.min), tz)
    bitis = timezone.make_aware(datetime.combine(gun, time.max), tz)
    return baslangic, bitis


def _bugun_islem_q(islem_tarihi_field: str, gun: date) -> Q:
    """
    İşlem tarihi = gun VEYA kayıt zamanı (created_at) aynı yerel gün.
    Formda dünün tarihi seçilip bugün girilen kayıtları da 'bugün'e dahil eder.
    """
    start, end = _gun_datetime_araligi(gun)
    return Q(**{islem_tarihi_field: gun}) | Q(created_at__gte=start, created_at__lte=end)


def _vade_durumu(vade: date | None, bugun: date) -> str:
    if not vade:
        return 'normal'
    if vade < bugun:
        return 'gecikmis'
    if vade == bugun:
        return 'bugun'
    if vade <= bugun + timedelta(days=3):
        return 'yakin'
    return 'normal'


def _context_scope_q(*, sube_id=None, egitim_yili_id=None, sube_field: str, yil_field: str) -> Q:
    """
    Kurum bağlamı filtreleri — NULL alanlı eski kayıtları dışlama.
    Gider listesi (gider_repository) ile aynı mantık.
    """
    q = Q()
    if sube_id:
        q &= Q(**{sube_field: sube_id}) | Q(**{f'{sube_field}__isnull': True})
    if egitim_yili_id:
        q &= Q(**{yil_field: egitim_yili_id}) | Q(**{f'{yil_field}__isnull': True})
    return q


def _gider_odeme_qs(kurum_id, baslangic, bitis, sube_id=None, egitim_yili_id=None, *, gun_dahil_kayit=False):
    q = Q(
        gider_kaydi__kurum_id=kurum_id,
        durum=OdemeDurum.TAMAMLANDI,
    )
    if gun_dahil_kayit and baslangic == bitis:
        q &= _bugun_islem_q('odeme_tarihi', baslangic)
    else:
        q &= Q(odeme_tarihi__gte=baslangic, odeme_tarihi__lte=bitis)
    q &= _context_scope_q(
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        sube_field='gider_kaydi__sube_id',
        yil_field='gider_kaydi__egitim_yili_id',
    )
    return GiderOdeme.objects.filter(q).select_related(
        'gider_kaydi', 'gider_kaydi__cari_hesap', 'odeme_yontemi', 'mali_hesap',
    )


def _bugun_alinan_toplam(kurum_id, gun, sube_id=None, egitim_yili_id=None) -> int:
    """Sözleşme + gelir + cari — işlem tarihi veya kayıt günü."""
    toplam = 0
    gun_q = _bugun_islem_q('tahsilat_tarihi', gun)

    soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
    if soz_ids:
        toplam += int(
            Tahsilat.objects.filter(
                sozlesme_id__in=soz_ids,
                durum=TahsilatDurum.AKTIF,
            ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(gun_q).aggregate(t=Sum('tutar'))['t'] or 0
        )

    gt_q = Q(gelir_kaydi__kurum_id=kurum_id, durum=OdemeDurum.TAMAMLANDI) & _bugun_islem_q('tahsilat_tarihi', gun)
    gt_q &= _context_scope_q(
        sube_id=sube_id, egitim_yili_id=egitim_yili_id,
        sube_field='gelir_kaydi__sube_id', yil_field='gelir_kaydi__egitim_yili_id',
    )
    toplam += int(GelirTahsilat.objects.filter(gt_q).aggregate(t=Sum('tutar'))['t'] or 0)

    ch_q = Q(
        kurum_id=kurum_id,
        islem_turu=CariHareketTuru.TAHSILAT,
    ) & _bugun_islem_q('islem_tarihi', gun)
    ch_q &= _context_scope_q(
        sube_id=sube_id, egitim_yili_id=egitim_yili_id,
        sube_field='sube_id', yil_field='egitim_yili_id',
    )
    toplam += int(CariHareket.objects.filter(ch_q).aggregate(t=Sum('tutar'))['t'] or 0)
    return toplam


def _kayit_zamani_str(dt) -> str | None:
    if not dt:
        return None
    return timezone.localtime(dt).isoformat()


def _gider_odeme_toplam(qs) -> int:
    """Ödeme queryset toplamını tam sayıya yuvarlar (kuruş kaybını azaltır)."""
    raw = qs.aggregate(t=Sum('tutar'))['t'] or 0
    return int(round(float(raw)))


def _gider_kategori_dagilimi(kurum_id, baslangic, bitis, sube_id=None, egitim_yili_id=None) -> list[dict]:
    rows = (
        _gider_odeme_qs(kurum_id, baslangic, bitis, sube_id, egitim_yili_id)
        .values('gider_kaydi__gider_kategorisi_id', 'gider_kaydi__gider_kategorisi__ad')
        .annotate(toplam=Sum('tutar'), adet=Count('id'))
        .order_by('-toplam')
    )
    toplam = sum(int(r['toplam'] or 0) for r in rows)
    result = []
    for r in rows:
        tutar = int(r['toplam'] or 0)
        result.append({
            'kategori_id': r['gider_kaydi__gider_kategorisi_id'],
            'kategori_adi': r['gider_kaydi__gider_kategorisi__ad'] or 'Belirtilmemiş',
            'toplam': tutar,
            'adet': int(r['adet'] or 0),
            'oran': round(tutar / toplam * 100, 1) if toplam else 0,
        })
    return result


def _gunluk_gider_seri(kurum_id, baslangic, bitis, sube_id=None, egitim_yili_id=None) -> dict[str, int]:
    """
    Günlük gider serisi — bugün kartı ile aynı mantık (ödeme tarihi veya kayıt günü).
    """
    result: dict[str, int] = {}
    cur = baslangic
    while cur <= bitis:
        result[cur.isoformat()] = _gider_odeme_toplam(
            _gider_odeme_qs(
                kurum_id, cur, cur, sube_id, egitim_yili_id, gun_dahil_kayit=True,
            ),
        )
        cur += timedelta(days=1)
    return result


def _gunluk_gelir_gider_net(
    gelir_grafik: list[dict],
    gider_by_day: dict[str, int],
    baslangic: date,
    bitis: date,
) -> list[dict]:
    gelir_map = {str(g['label'])[:10]: int(g['tutar']) for g in gelir_grafik}
    days: list[dict] = []
    cur = baslangic
    while cur <= bitis:
        key = cur.isoformat()
        gelir = gelir_map.get(key, 0)
        gider = gider_by_day.get(key, 0)
        days.append({
            'tarih': key,
            'gelir': gelir,
            'gider': gider,
            'net': gelir - gider,
        })
        cur += timedelta(days=1)
    return days


def _mali_hesap_bloklari(kurum_id, sube_id, egitim_yili_id) -> tuple[list[dict], list[dict], int, int]:
    if not egitim_yili_id:
        return [], [], 0, 0

    selector = DonemBakiyeSelector()
    if sube_id:
        ozet = selector.get_sube_ozet(int(sube_id), int(egitim_yili_id))
        hesaplar = ozet.get('hesaplar', [])
    else:
        donemler = selector.repo.get_by_kurum_ve_yil(int(kurum_id), int(egitim_yili_id))
        hesap_map: dict[int, dict] = {}
        for d in donemler:
            hid = d.mali_hesap_id
            if hid not in hesap_map:
                hesap_map[hid] = {
                    'id': d.id,
                    'mali_hesap_id': hid,
                    'mali_hesap_ad': d.mali_hesap.ad,
                    'mali_hesap_tip': d.mali_hesap.tip,
                    'donem_basi_bakiye': 0,
                    'toplam_gelir': 0,
                    'toplam_gider': 0,
                    'donem_sonu_bakiye': 0,
                }
            hesap_map[hid]['donem_basi_bakiye'] += d.donem_basi_bakiye
            hesap_map[hid]['toplam_gelir'] += d.toplam_gelir
            hesap_map[hid]['toplam_gider'] += d.toplam_gider
            hesap_map[hid]['donem_sonu_bakiye'] += d.donem_sonu_bakiye
        hesaplar = list(hesap_map.values())

    kasa = [h for h in hesaplar if h.get('mali_hesap_tip') == MaliHesapTipi.KASA]
    banka = [h for h in hesaplar if h.get('mali_hesap_tip') == MaliHesapTipi.BANKA]
    kasa_toplam = sum(int(h.get('donem_sonu_bakiye') or 0) for h in kasa)
    banka_toplam = sum(int(h.get('donem_sonu_bakiye') or 0) for h in banka)
    return kasa, banka, kasa_toplam, banka_toplam


def _serialize_gider_odeme(odeme) -> dict:
    gk = odeme.gider_kaydi
    cari = gk.cari_hesap
    kat = gk.gider_kategorisi
    return {
        'id': odeme.id,
        'gider_kaydi_id': odeme.gider_kaydi_id,
        'kayit_tipi': 'odeme',
        'cari_hesap_adi': cari.gorunen_ad if cari else '—',
        'kategori_adi': kat.ad if kat else '',
        'fatura_no': gk.fatura_no or '',
        'tutar': int(odeme.tutar),
        'net_tutar': int(gk.net_tutar),
        'odenen_toplam': int(gk.odenen_toplam),
        'kalan_tutar': int(gk.kalan_tutar),
        'odeme_tarihi': odeme.odeme_tarihi.isoformat(),
        'vade_tarihi': (
            (gk.vade_tarihi or gk.fatura_tarihi).isoformat()
            if (gk.vade_tarihi or gk.fatura_tarihi) else None
        ),
        'odeme_yontemi_adi': (
            odeme.odeme_yontemi.ad if odeme.odeme_yontemi_id
            else ('Bakiyeden Mahsup' if odeme.bakiyeden_mahsup else None)
        ),
        'mali_hesap_adi': (
            odeme.mali_hesap.ad if odeme.mali_hesap_id
            else ('Cari Bakiye' if odeme.bakiyeden_mahsup else None)
        ),
        'aciklama': odeme.aciklama or gk.fatura_no or f'Gider #{gk.id}',
        'kayit_zamani': _kayit_zamani_str(odeme.created_at),
        'durum': gk.durum,
        'durum_label': gk.get_durum_display(),
    }


def _serialize_gider_kaydi(gk) -> dict:
    """Gider işlemleri listesiyle uyumlu son gider kaydı özeti."""
    cari = gk.cari_hesap
    kat = gk.gider_kategorisi
    vade = gk.vade_tarihi or gk.fatura_tarihi
    return {
        'id': gk.id,
        'gider_kaydi_id': gk.id,
        'kayit_tipi': 'kayit',
        'cari_hesap_adi': cari.gorunen_ad if cari else '—',
        'kategori_adi': kat.ad if kat else '',
        'fatura_no': gk.fatura_no or '',
        'tutar': int(gk.net_tutar),
        'net_tutar': int(gk.net_tutar),
        'odenen_toplam': int(gk.odenen_toplam),
        'kalan_tutar': int(gk.kalan_tutar),
        'odeme_tarihi': vade.isoformat() if vade else '',
        'vade_tarihi': vade.isoformat() if vade else None,
        'odeme_yontemi_adi': gk.odeme_yontemi.ad if gk.odeme_yontemi_id else None,
        'mali_hesap_adi': gk.mali_hesap.ad if gk.mali_hesap_id else None,
        'aciklama': gk.aciklama or gk.fatura_no or f'Gider #{gk.id}',
        'kayit_zamani': _kayit_zamani_str(gk.updated_at or gk.created_at),
        'durum': gk.durum,
        'durum_label': gk.get_durum_display(),
    }


def _son_gider_kayitlari(kurum_id, limit=15, sube_id=None, egitim_yili_id=None):
    q = Q(kurum_id=kurum_id)
    q &= _context_scope_q(
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        sube_field='sube_id',
        yil_field='egitim_yili_id',
    )
    return (
        GiderKaydi.objects.filter(q)
        .exclude(durum=GiderDurum.IPTAL)
        .select_related('cari_hesap', 'gider_kategorisi', 'odeme_yontemi', 'mali_hesap')
        .order_by('-updated_at', '-created_at')[:limit]
    )


def _bugun_gider_kaydi_satirlari(kurum_id, gun, sube_id=None, egitim_yili_id=None) -> list[dict]:
    """
    Bugün oluşturulan gider kayıtları — henüz bugün ödemesi yapılmamış olanlar.
    Kısmi/tam ödeme aynı gün yapıldıysa yalnızca ödeme satırı gösterilir (çift sayım önlenir).
    """
    start, end = _gun_datetime_araligi(gun)
    q = Q(kurum_id=kurum_id, created_at__gte=start, created_at__lte=end)
    q &= _context_scope_q(
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        sube_field='sube_id',
        yil_field='egitim_yili_id',
    )
    odendi_bugun_ids = set(
        _gider_odeme_qs(
            kurum_id, gun, gun, sube_id, egitim_yili_id, gun_dahil_kayit=True,
        ).values_list('gider_kaydi_id', flat=True),
    )
    rows = []
    for gk in GiderKaydi.objects.filter(q).select_related(
        'cari_hesap', 'gider_kategorisi', 'odeme_yontemi',
    ):
        if gk.id in odendi_bugun_ids:
            continue
        cari = gk.cari_hesap
        kisi = cari.gorunen_ad if cari else (gk.fatura_no or f'Gider #{gk.id}')
        vade = gk.vade_tarihi or gk.fatura_tarihi
        rows.append({
            'id': gk.id,
            'kaynak': 'gider_kayit',
            'kaynak_label': f'Gider ({gk.get_durum_display()})',
            'kisi_adi': kisi,
            'tutar': int(gk.net_tutar),
            'odeme_yontemi': gk.odeme_yontemi.ad if gk.odeme_yontemi_id else None,
            'odeme_yontemi_tipi': gk.odeme_yontemi.tip if gk.odeme_yontemi_id else None,
            'tarih': vade.isoformat() if vade else gun.isoformat(),
            'kayit_zamani': _kayit_zamani_str(gk.created_at),
            'vade_tarihi': vade.isoformat() if vade else None,
            'aciklama': gk.aciklama or gk.fatura_no or f'Gider #{gk.id}',
            'sozlesme_id': None,
            'sozlesme_no': None,
            'gelir_id': None,
            'gider_id': gk.id,
            'cari_hesap_id': gk.cari_hesap_id,
        })
    return rows


def _gider_islem_satirlari(kurum_id, baslangic, bitis, sube_id=None, egitim_yili_id=None, *, gun_dahil_kayit=False) -> list[dict]:
    """Bugünkü işlemler / birleşik hareket listesi için gider ödeme satırları."""
    rows = []
    for o in _gider_odeme_qs(
        kurum_id, baslangic, bitis, sube_id, egitim_yili_id, gun_dahil_kayit=gun_dahil_kayit,
    ):
        gk = o.gider_kaydi
        cari = gk.cari_hesap
        kisi = cari.gorunen_ad if cari else (gk.fatura_no or f'Gider #{gk.id}')
        rows.append({
            'id': o.id,
            'kaynak': 'gider',
            'kaynak_label': 'Gider Ödemesi',
            'kisi_adi': kisi,
            'tutar': int(o.tutar),
            'odeme_yontemi': (
                o.odeme_yontemi.ad if o.odeme_yontemi_id
                else ('Bakiyeden Mahsup' if o.bakiyeden_mahsup else None)
            ),
            'odeme_yontemi_tipi': o.odeme_yontemi.tip if o.odeme_yontemi_id else None,
            'tarih': o.odeme_tarihi.isoformat(),
            'kayit_zamani': _kayit_zamani_str(o.created_at),
            'vade_tarihi': None,
            'aciklama': o.aciklama or gk.fatura_no or f'Gider #{gk.id}',
            'sozlesme_id': None,
            'sozlesme_no': None,
            'gelir_id': None,
            'gider_id': gk.id,
            'cari_hesap_id': gk.cari_hesap_id,
        })
    return rows


def _yaklasan_gider_satirlari(kurum_id, bugun, bitis, sube_id=None, egitim_yili_id=None) -> list[dict]:
    """Önümüzdeki günlerde vadesi gelen gider taksitleri."""
    gun = (bitis - bugun).days
    taksitler = GiderSelector().yaklasan_vadeler(kurum_id, gun=max(gun, 1))
    rows = []
    for t in taksitler:
        gk = t.gider_kaydi
        if sube_id and gk.sube_id not in (int(sube_id), None):
            continue
        if egitim_yili_id and gk.egitim_yili_id not in (int(egitim_yili_id), None):
            continue
        cari = gk.cari_hesap
        kisi = cari.gorunen_ad if cari else (gk.fatura_no or f'Gider #{gk.id}')
        kalan = int(t.kalan_tutar or t.tutar or 0)
        if kalan <= 0:
            continue
        rows.append({
            'id': t.id,
            'kaynak': 'gider',
            'kaynak_label': 'Gider Taksiti',
            'kisi_adi': kisi,
            'tutar': kalan,
            'odeme_yontemi': gk.odeme_yontemi.ad if gk.odeme_yontemi_id else None,
            'odeme_yontemi_tipi': gk.odeme_yontemi.tip if gk.odeme_yontemi_id else None,
            'tarih': t.vade_tarihi.isoformat(),
            'vade_tarihi': t.vade_tarihi.isoformat(),
            'kayit_zamani': None,
            'aciklama': f"{gk.fatura_no or f'Gider #{gk.id}'} — Taksit {t.taksit_no}",
            'sozlesme_id': None,
            'sozlesme_no': None,
            'gelir_id': None,
            'gider_id': gk.id,
            'cari_hesap_id': gk.cari_hesap_id,
        })
    return rows


def _bugun_islem_satirlari(kurum_id, gun, sube_id=None, egitim_yili_id=None) -> list[dict]:
    """Bugünkü tüm hareketler — işlem tarihi veya kayıt günü."""
    from apps.finans.application.period.period_service import KAYNAK_LABELS

    rows: list[dict] = []
    gun_q = _bugun_islem_q('tahsilat_tarihi', gun)

    soz_ids = _sozlesme_ids(kurum_id, sube_id, egitim_yili_id)
    if soz_ids:
        for th in Tahsilat.objects.filter(
            sozlesme_id__in=soz_ids,
            durum=TahsilatDurum.AKTIF,
        ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(gun_q).select_related(
            'sozlesme__ogrenci', 'odeme_yontemi',
        ):
            ogr = th.sozlesme.ogrenci
            kisi = f'{ogr.ad} {ogr.soyad}'.strip() if ogr else '—'
            rows.append({
                'id': th.id,
                'kaynak': 'sozlesme',
                'kaynak_label': KAYNAK_LABELS['sozlesme'],
                'kisi_adi': kisi,
                'tutar': int(th.tutar),
                'odeme_yontemi': th.odeme_yontemi.ad if th.odeme_yontemi_id else None,
                'odeme_yontemi_tipi': th.odeme_yontemi.tip if th.odeme_yontemi_id else None,
                'tarih': th.tahsilat_tarihi.isoformat(),
                'kayit_zamani': _kayit_zamani_str(th.created_at),
                'vade_tarihi': None,
                'aciklama': f"Söz. {th.sozlesme.sozlesme_no}",
                'sozlesme_id': th.sozlesme_id,
                'sozlesme_no': th.sozlesme.sozlesme_no,
                'gelir_id': None,
                'cari_hesap_id': None,
            })

    gt_q = Q(gelir_kaydi__kurum_id=kurum_id, durum=OdemeDurum.TAMAMLANDI) & _bugun_islem_q('tahsilat_tarihi', gun)
    gt_q &= _context_scope_q(
        sube_id=sube_id, egitim_yili_id=egitim_yili_id,
        sube_field='gelir_kaydi__sube_id', yil_field='gelir_kaydi__egitim_yili_id',
    )
    for gt in GelirTahsilat.objects.filter(gt_q).select_related(
        'gelir_kaydi__cari_hesap', 'odeme_yontemi',
    ):
        gk = gt.gelir_kaydi
        kisi = gk.cari_hesap.unvan if gk.cari_hesap_id else (gk.fatura_no or f'Gelir #{gk.id}')
        rows.append({
            'id': gt.id,
            'kaynak': 'gelir',
            'kaynak_label': KAYNAK_LABELS['gelir'],
            'kisi_adi': kisi,
            'tutar': int(gt.tutar),
            'odeme_yontemi': gt.odeme_yontemi.ad if gt.odeme_yontemi_id else None,
            'odeme_yontemi_tipi': gt.odeme_yontemi.tip if gt.odeme_yontemi_id else None,
            'tarih': gt.tahsilat_tarihi.isoformat(),
            'kayit_zamani': _kayit_zamani_str(gt.created_at),
            'vade_tarihi': None,
            'aciklama': gk.fatura_no or f'Gelir #{gk.id}',
            'sozlesme_id': None,
            'sozlesme_no': None,
            'gelir_id': gk.id,
            'cari_hesap_id': gk.cari_hesap_id,
        })

    ch_q = Q(kurum_id=kurum_id, islem_turu=CariHareketTuru.TAHSILAT) & _bugun_islem_q('islem_tarihi', gun)
    ch_q &= _context_scope_q(
        sube_id=sube_id, egitim_yili_id=egitim_yili_id,
        sube_field='sube_id', yil_field='egitim_yili_id',
    )
    for ch in CariHareket.objects.filter(ch_q).select_related('cari_hesap'):
        rows.append({
            'id': ch.id,
            'kaynak': 'cari',
            'kaynak_label': KAYNAK_LABELS['cari'],
            'kisi_adi': str(ch.cari_hesap) if ch.cari_hesap_id else '—',
            'tutar': int(ch.tutar),
            'odeme_yontemi': None,
            'odeme_yontemi_tipi': None,
            'tarih': ch.islem_tarihi.isoformat(),
            'kayit_zamani': _kayit_zamani_str(ch.created_at),
            'vade_tarihi': None,
            'aciklama': ch.aciklama or str(ch.cari_hesap),
            'sozlesme_id': None,
            'sozlesme_no': None,
            'gelir_id': None,
            'cari_hesap_id': ch.cari_hesap_id,
        })

    rows.extend(_bugun_gider_kaydi_satirlari(kurum_id, gun, sube_id, egitim_yili_id))
    rows.extend(_gider_islem_satirlari(
        kurum_id, gun, gun, sube_id, egitim_yili_id, gun_dahil_kayit=True,
    ))
    rows.sort(
        key=lambda r: (r.get('kayit_zamani') or r.get('tarih') or '', r.get('id', 0)),
        reverse=True,
    )
    return rows


def _geciken_listesi(kurum_id, sube_id, egitim_yili_id, limit=20) -> tuple[list[dict], dict]:
    base_qs = get_overdue_taksit_queryset(
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
    ).order_by('vade_tarihi')

    all_taksitler = list(base_qs)
    adet = len(all_taksitler)
    toplam_kalan = sum(int(t.kalan_tutar or 0) for t in all_taksitler)
    gecikme_sum = sum(gecikme_gunu(t) for t in all_taksitler)

    rows = []
    for t in all_taksitler[:limit]:
        ogr = t.sozlesme.ogrenci
        veli = t.sozlesme.veli
        rows.append({
            'taksit_id': t.id,
            'sozlesme_id': t.sozlesme_id,
            'sozlesme_no': t.sozlesme.sozlesme_no,
            'ogrenci_id': ogr.id if ogr else None,
            'ogrenci_adi': f'{ogr.ad} {ogr.soyad}' if ogr else '—',
            'veli_adi': veli.tam_ad if veli else None,
            'veli_telefon': (veli.telefon or None) if veli else None,
            'taksit_no': t.taksit_no,
            'vade_tarihi': t.vade_tarihi.isoformat(),
            'kalan_tutar': int(t.kalan_tutar or 0),
            'gecikme_gun': gecikme_gunu(t),
        })

    ozet = {
        'toplam_taksit_sayisi': adet,
        'toplam_kalan_tutar': toplam_kalan,
        'ortalama_gecikme_gun': round(gecikme_sum / adet, 1) if adet else 0,
    }
    return rows, ozet


class DashboardOverviewService:
    """Finans dashboard overview aggregation."""

    @classmethod
    def build(
        cls,
        *,
        kurum_id: int,
        sube_id=None,
        egitim_yili_id=None,
        referans_tarih: date | None = None,
    ) -> dict:
        bugun = referans_tarih or timezone.localdate()
        ay_basi = bugun.replace(day=1)
        ay_sonu = _month_end(bugun)
        yedi_gun = bugun + timedelta(days=7)

        common = dict(
            kurum_id=kurum_id,
            sube_id=sube_id,
            egitim_yili_id=egitim_yili_id,
        )

        bu_ay_alinan = PeriodService.period_summary(
            baslangic=ay_basi, bitis=ay_sonu, mode='alinan', **common,
        )

        bugun_alinan_tutar = _bugun_alinan_toplam(kurum_id, bugun, sube_id, egitim_yili_id)
        bugun_gider = _gider_odeme_toplam(
            _gider_odeme_qs(
                kurum_id, bugun, bugun, sube_id, egitim_yili_id, gun_dahil_kayit=True,
            ),
        )
        bu_ay_gider = _gider_odeme_toplam(
            _gider_odeme_qs(kurum_id, ay_basi, ay_sonu, sube_id, egitim_yili_id),
        )

        bu_ay_alinan_tutar = int(bu_ay_alinan['ozet']['toplam_tutar'])

        kasa_hesaplari, banka_hesaplari, kasa_toplam, banka_toplam = _mali_hesap_bloklari(
            kurum_id, sube_id, egitim_yili_id,
        )

        bugunku_islemler = _bugun_islem_satirlari(kurum_id, bugun, sube_id, egitim_yili_id)

        yaklasan_raw = PeriodService.period_details(
            baslangic=bugun, bitis=yedi_gun, mode='beklenen', **common,
        )
        yaklasan_raw.extend(
            _yaklasan_gider_satirlari(kurum_id, bugun, yedi_gun, sube_id, egitim_yili_id),
        )
        yaklasan_odemeler = []
        for row in sorted(yaklasan_raw, key=lambda r: (r.get('vade_tarihi') or r.get('tarih') or '', r.get('id', 0)))[:30]:
            vade_str = row.get('vade_tarihi') or row.get('tarih')
            vade = date.fromisoformat(str(vade_str)[:10]) if vade_str else None
            yaklasan_odemeler.append({
                **row,
                'vade_durumu': _vade_durumu(vade, bugun),
            })

        geciken_odemeler, geciken_ozet = _geciken_listesi(
            kurum_id, sube_id, egitim_yili_id, limit=20,
        )

        son_tahsilatlar = PeriodService.period_details(
            baslangic=ay_basi - timedelta(days=90),
            bitis=bugun,
            mode='alinan',
            **common,
        )
        son_tahsilatlar.sort(
            key=lambda r: (r.get('kayit_zamani') or r.get('tarih') or '', r.get('id', 0)),
            reverse=True,
        )
        son_tahsilatlar = son_tahsilatlar[:15]

        son_giderler = [
            _serialize_gider_kaydi(gk)
            for gk in _son_gider_kayitlari(
                kurum_id, limit=15, sube_id=sube_id, egitim_yili_id=egitim_yili_id,
            )
        ]

        gider_by_day = _gunluk_gider_seri(kurum_id, ay_basi, ay_sonu, sube_id, egitim_yili_id)
        gunluk_seri = _gunluk_gelir_gider_net(
            bu_ay_alinan['ozet'].get('grafik', []),
            gider_by_day,
            ay_basi,
            ay_sonu,
        )

        return {
            'tarih': bugun.isoformat(),
            'ozet_kartlar': {
                'bugun_alinan': bugun_alinan_tutar,
                'bugun_gider': bugun_gider,
                'bugun_net': bugun_alinan_tutar - bugun_gider,
                'bu_ay_alinan': bu_ay_alinan_tutar,
                'bu_ay_gider': bu_ay_gider,
                'bu_ay_net': bu_ay_alinan_tutar - bu_ay_gider,
                'kasa_toplam': kasa_toplam,
                'banka_toplam': banka_toplam,
            },
            'bugunku_islemler': bugunku_islemler,
            'yaklasan_odemeler': yaklasan_odemeler,
            'geciken_odemeler': geciken_odemeler,
            'geciken_ozet': geciken_ozet,
            'son_tahsilatlar': son_tahsilatlar,
            'son_giderler': son_giderler,
            'kasa_hesaplari': kasa_hesaplari,
            'banka_hesaplari': banka_hesaplari,
            'tahsilat_dagilimi': bu_ay_alinan['ozet'].get('yontem_dagilimi', []),
            'gelir_kaynak_kirilimi': bu_ay_alinan['ozet'].get('kaynak_kirilimi', []),
            'gider_kategori_dagilimi': _gider_kategori_dagilimi(
                kurum_id, ay_basi, ay_sonu, sube_id, egitim_yili_id,
            ),
            'gunluk_gelir_gider_net': gunluk_seri,
        }
