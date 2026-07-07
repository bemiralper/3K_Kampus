"""
Gün Sonu raporları — ortak finans hesaplama yardımcıları.

Net nakit yalnızca KASA tipi mali hesaplardaki bakiye hareketlerinden türetilir.
Ödeme türleri birbirinden ayrı kovalar halinde raporlanır.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.finans.constants.account_types import MaliHesapTipi
from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.constants.hareket_types import HareketKaynagi, HareketYonu, TransferTuru
from apps.finans.constants.payment_types import OdemeYontemiTipi
from apps.finans.domain.bakiye_hareketi import BakiyeHareketi
from apps.finans.domain.financial_account import MaliHesap
from apps.finans.domain.gelir_tahsilat import GelirTahsilat
from apps.finans.domain.gider_odeme import GiderOdeme
from apps.odeme_takip.domain.enums import TahsilatDurum, TahsilatTuru


# Raporlarda gösterilecek ödeme kovaları (sıralı)
RAPOR_ODEME_KOVASI = (
    'nakit',
    'havale',
    'kredi_karti',
    'online',
    'cek',
    'senet',
    'diger',
)

RAPOR_ODEME_LABELS = {
    'nakit': 'Nakit',
    'havale': 'Havale / EFT',
    'kredi_karti': 'POS / Kredi Kartı',
    'online': 'Online Ödeme',
    'cek': 'Çek',
    'senet': 'Senet',
    'diger': 'Diğer',
    'cari_mahsup': 'Cari Bakiyeden Mahsup',
}


def int_amount(value) -> int:
    if value is None:
        return 0
    if isinstance(value, Decimal):
        return int(value)
    return int(value)


def gun_datetime_araligi(gun: date) -> tuple[datetime, datetime]:
    """Seçilen iş günü için yerel (Europe/Istanbul) datetime aralığı."""
    tz = timezone.get_current_timezone()
    baslangic = timezone.make_aware(datetime.combine(gun, time.min), tz)
    bitis = timezone.make_aware(datetime.combine(gun, time.max), tz)
    return baslangic, bitis


def bugun_islem_q(islem_tarihi_field: str, gun: date) -> Q:
    """
    İşlem tarihi = gun VEYA kayıt zamanı (created_at) aynı yerel gün.
    Dashboard overview ile aynı mantık — geç tarihli kayıt bugün girildiyse dahil.
    """
    start, end = gun_datetime_araligi(gun)
    return Q(**{islem_tarihi_field: gun}) | Q(created_at__gte=start, created_at__lte=end)


def gun_local_datetime_q(dt_field: str, gun: date) -> Q:
    """Datetime alanı için yerel takvim günü filtresi (__date UTC kayması yok)."""
    start, end = gun_datetime_araligi(gun)
    return Q(**{f'{dt_field}__gte': start, f'{dt_field}__lte': end})


def apply_sube_filter(qs, sube_id, sube_field: str):
    """Şube filtresi — strict equality (Gün Sonu raporu yalnızca aktif şube)."""
    if sube_id:
        return qs.filter(**{sube_field: sube_id})
    return qs


def odeme_tip_to_bucket(tip: str | None) -> str:
    """OdemeYontemiTipi → rapor kovası."""
    mapping = {
        OdemeYontemiTipi.NAKIT: 'nakit',
        OdemeYontemiTipi.POS: 'kredi_karti',
        OdemeYontemiTipi.HAVALE_EFT: 'havale',
        OdemeYontemiTipi.ONLINE: 'online',
        OdemeYontemiTipi.CEK: 'cek',
        OdemeYontemiTipi.SENET: 'senet',
    }
    return mapping.get(tip, 'diger')


def is_nakit_odeme(tip: str | None) -> bool:
    return tip == OdemeYontemiTipi.NAKIT


def kova_listesi_with_yuzde(kova: dict[str, dict]) -> list[dict]:
    """Kova dict → sıralı liste, her satırda yüzde."""
    rows = []
    for key in RAPOR_ODEME_KOVASI:
        val = kova.get(key, {'toplam': 0, 'adet': 0})
        tutar = int(val.get('toplam') or 0)
        if tutar == 0 and int(val.get('adet') or 0) == 0:
            continue
        rows.append({
            'tip': key,
            'label': RAPOR_ODEME_LABELS[key],
            'tutar': tutar,
            'adet': int(val.get('adet') or 0),
        })
    # Diğer / bilinmeyen kovalar
    for key, val in kova.items():
        if key in RAPOR_ODEME_KOVASI or key == 'cari_mahsup':
            continue
        tutar = int(val.get('toplam') or 0)
        if tutar == 0:
            continue
        rows.append({
            'tip': key,
            'label': RAPOR_ODEME_LABELS.get(key, key),
            'tutar': tutar,
            'adet': int(val.get('adet') or 0),
        })
    rows.sort(key=lambda r: -r['tutar'])
    genel = sum(r['tutar'] for r in rows)
    for row in rows:
        row['yuzde'] = round(row['tutar'] * 100 / genel, 1) if genel else 0.0
    if rows:
        rows.append({
            'tip': 'toplam',
            'label': 'Genel Toplam',
            'tutar': genel,
            'adet': sum(r['adet'] for r in rows if r['tip'] != 'toplam'),
            'yuzde': 100.0,
            'is_total': True,
        })
    return rows


def _kasa_hesap_ids(kurum_id: int, sube_id: int | None) -> list[int]:
    qs = MaliHesap.objects.filter(
        sube__kurum_id=kurum_id,
        tip=MaliHesapTipi.KASA,
        aktif_mi=True,
    )
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    return list(qs.values_list('id', flat=True))


def _banka_hesap_ids(kurum_id: int, sube_id: int | None) -> list[int]:
    qs = MaliHesap.objects.filter(
        sube__kurum_id=kurum_id,
        tip=MaliHesapTipi.BANKA,
        aktif_mi=True,
    )
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    return list(qs.values_list('id', flat=True))


def _pos_hesap_ids(kurum_id: int, sube_id: int | None) -> list[int]:
    qs = MaliHesap.objects.filter(
        sube__kurum_id=kurum_id,
        tip__in=(MaliHesapTipi.POS, MaliHesapTipi.SANAL_POS),
        aktif_mi=True,
    )
    if sube_id:
        qs = qs.filter(sube_id=sube_id)
    return list(qs.values_list('id', flat=True))


def kasa_acilis_bakiye(kasa_ids: list[int], gun: date) -> int:
    if not kasa_ids:
        return 0
    total = 0
    for hid in kasa_ids:
        prev = (
            BakiyeHareketi.objects.filter(mali_hesap_id=hid, islem_tarihi__lt=gun)
            .order_by('-islem_tarihi', '-created_at')
            .values_list('bakiye_sonrasi', flat=True)
            .first()
        )
        total += int(prev or 0)
    return total


def kasa_gunluk_hareket(kasa_ids: list[int], gun: date) -> tuple[int, int]:
    """Kasa hesaplarında günlük giriş ve çıkış toplamı."""
    if not kasa_ids:
        return 0, 0
    qs = BakiyeHareketi.objects.filter(mali_hesap_id__in=kasa_ids, islem_tarihi=gun)
    giris = int(qs.filter(yon=HareketYonu.GIRIS).aggregate(t=Sum('tutar'))['t'] or 0)
    cikis = int(qs.filter(yon=HareketYonu.CIKIS).aggregate(t=Sum('tutar'))['t'] or 0)
    return giris, cikis


def net_nakit_degisim(kurum_id: int, gun: date, sube_id: int | None) -> int:
    """Günlük net nakit = kasa girişleri − kasa çıkışları (fiziksel kasa)."""
    kasa_ids = _kasa_hesap_ids(kurum_id, sube_id)
    giris, cikis = kasa_gunluk_hareket(kasa_ids, gun)
    return giris - cikis


def odeme_kirilimi_topla(kurum_id: int, gun: date, sube_id: int | None) -> dict[str, dict]:
    """Sözleşme tahsilat + gelir tahsilat ödeme türü kırılımı."""
    from apps.odeme_takip.domain.models import Tahsilat

    kova: dict[str, dict] = defaultdict(lambda: {'toplam': 0, 'adet': 0})

    t_qs = Tahsilat.objects.filter(
        sozlesme__kurum_id=kurum_id,
        durum=TahsilatDurum.AKTIF,
    ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(
        bugun_islem_q('tahsilat_tarihi', gun),
    )
    if sube_id:
        t_qs = t_qs.filter(sozlesme__sube_id=sube_id)
    for row in t_qs.values('odeme_yontemi__tip').annotate(toplam=Sum('tutar'), adet=Count('id')):
        b = odeme_tip_to_bucket(row['odeme_yontemi__tip'])
        kova[b]['toplam'] += int(row['toplam'] or 0)
        kova[b]['adet'] += row['adet'] or 0

    g_qs = GelirTahsilat.objects.filter(
        gelir_kaydi__kurum_id=kurum_id,
        durum=OdemeDurum.TAMAMLANDI,
    ).filter(bugun_islem_q('tahsilat_tarihi', gun))
    if sube_id:
        g_qs = g_qs.filter(gelir_kaydi__sube_id=sube_id)
    for row in g_qs.values('odeme_yontemi__tip').annotate(toplam=Sum('tutar'), adet=Count('id')):
        b = odeme_tip_to_bucket(row['odeme_yontemi__tip'])
        kova[b]['toplam'] += int_amount(row['toplam'])
        kova[b]['adet'] += row['adet'] or 0

    return dict(kova)


def nakit_tahsilat_toplam(kurum_id: int, gun: date, sube_id: int | None) -> int:
    from apps.odeme_takip.domain.models import Tahsilat

    qs = Tahsilat.objects.filter(
        sozlesme__kurum_id=kurum_id,
        tahsilat_tarihi=gun,
        durum=TahsilatDurum.AKTIF,
        odeme_yontemi__tip=OdemeYontemiTipi.NAKIT,
    ).exclude(tahsilat_turu=TahsilatTuru.IADE)
    if sube_id:
        qs = qs.filter(sozlesme__sube_id=sube_id)
    return int(qs.aggregate(t=Sum('tutar'))['t'] or 0)


def nakit_gelir_toplam(kurum_id: int, gun: date, sube_id: int | None) -> int:
    qs = GelirTahsilat.objects.filter(
        gelir_kaydi__kurum_id=kurum_id,
        tahsilat_tarihi=gun,
        durum=OdemeDurum.TAMAMLANDI,
        odeme_yontemi__tip=OdemeYontemiTipi.NAKIT,
    )
    if sube_id:
        qs = qs.filter(gelir_kaydi__sube_id=sube_id)
    return int_amount(qs.aggregate(t=Sum('tutar'))['t'])


def nakit_gider_toplam(kurum_id: int, gun: date, sube_id: int | None) -> int:
    qs = GiderOdeme.objects.filter(
        gider_kaydi__kurum_id=kurum_id,
        odeme_tarihi=gun,
        durum=OdemeDurum.TAMAMLANDI,
        odeme_yontemi__tip=OdemeYontemiTipi.NAKIT,
        bakiyeden_mahsup=False,
    )
    if sube_id:
        qs = qs.filter(gider_kaydi__sube_id=sube_id)
    return int_amount(qs.aggregate(t=Sum('tutar'))['t'])


def nakit_iade_toplam(kurum_id: int, gun: date, sube_id: int | None) -> int:
    from apps.odeme_takip.domain.models import Tahsilat

    qs = Tahsilat.objects.filter(
        sozlesme__kurum_id=kurum_id,
        tahsilat_tarihi=gun,
        durum=TahsilatDurum.AKTIF,
        tahsilat_turu=TahsilatTuru.IADE,
        odeme_yontemi__tip=OdemeYontemiTipi.NAKIT,
    )
    if sube_id:
        qs = qs.filter(sozlesme__sube_id=sube_id)
    return int(qs.aggregate(t=Sum('tutar'))['t'] or 0)


def transfer_toplamlari(kurum_id: int, gun: date, sube_id: int | None) -> dict[str, int]:
    from apps.finans.domain.hesap_transferi import HesapTransferi

    qs = HesapTransferi.objects.filter(kurum_id=kurum_id, transfer_tarihi=gun)
    if sube_id:
        qs = qs.filter(sube_id=sube_id)

    result = {
        'bankaya_aktarim': 0,
        'bankadan_kasaya': 0,
        'kasa_virman': 0,
    }
    for row in qs.values('transfer_turu').annotate(toplam=Sum('tutar')):
        tur = row['transfer_turu']
        tutar = int(row['toplam'] or 0)
        if tur == TransferTuru.KASADAN_BANKAYA:
            result['bankaya_aktarim'] += tutar
        elif tur == TransferTuru.BANKADAN_KASAYA:
            result['bankadan_kasaya'] += tutar
        elif tur == TransferTuru.VIRMAN:
            result['kasa_virman'] += tutar
    return result


def kasa_manuel_hareketler(kasa_ids: list[int], gun: date) -> tuple[int, int]:
    """Manuel kasa giriş/çıkış (sayım düzeltmesi dahil)."""
    if not kasa_ids:
        return 0, 0
    qs = BakiyeHareketi.objects.filter(
        mali_hesap_id__in=kasa_ids,
        islem_tarihi=gun,
        kaynak=HareketKaynagi.MANUEL,
    )
    giris = int(qs.filter(yon=HareketYonu.GIRIS).aggregate(t=Sum('tutar'))['t'] or 0)
    cikis = int(qs.filter(yon=HareketYonu.CIKIS).aggregate(t=Sum('tutar'))['t'] or 0)
    return giris, cikis


def kasa_sayim_bilgisi(kasa_ids: list[int], gun: date) -> tuple[int | None, bool]:
    """
    Kasa sayımı: MANUEL kaynaklı hareketlerde 'sayım' geçen açıklama varsa
    sayılan tutarı bakiye_sonrasi olarak alır.
    """
    if not kasa_ids:
        return None, False
    hareket = (
        BakiyeHareketi.objects.filter(
            mali_hesap_id__in=kasa_ids,
            islem_tarihi=gun,
            kaynak=HareketKaynagi.MANUEL,
        )
        .filter(aciklama__icontains='sayım')
        .order_by('-created_at')
        .first()
    )
    if hareket:
        return int(hareket.bakiye_sonrasi), True
    return None, False


def build_kasa_ozeti(kurum_id: int, gun: date, sube_id: int | None) -> dict:
    kasa_ids = _kasa_hesap_ids(kurum_id, sube_id)
    acilis = kasa_acilis_bakiye(kasa_ids, gun)
    gunluk_giris, gunluk_cikis = kasa_gunluk_hareket(kasa_ids, gun)
    transfers = transfer_toplamlari(kurum_id, gun, sube_id)
    manuel_giris, manuel_cikis = kasa_manuel_hareketler(kasa_ids, gun)
    sayilan, sayim_yapildi = kasa_sayim_bilgisi(kasa_ids, gun)

    nakit_tahsilat = nakit_tahsilat_toplam(kurum_id, gun, sube_id)
    nakit_gelir = nakit_gelir_toplam(kurum_id, gun, sube_id)
    nakit_gider = nakit_gider_toplam(kurum_id, gun, sube_id)
    nakit_iade = nakit_iade_toplam(kurum_id, gun, sube_id)

    beklenen = acilis + gunluk_giris - gunluk_cikis
    kasa_farki = 0
    if sayilan is not None:
        kasa_farki = sayilan - beklenen

    not_msg = ''
    if not sayim_yapildi:
        not_msg = 'Fiziksel kasa sayımı henüz sisteme girilmedi; beklenen tutar bakiye hareketlerinden hesaplanmıştır.'
    elif kasa_farki != 0:
        not_msg = f'Kasa farkı tespit edildi: {kasa_farki:+,} TL'

    return {
        'acilis_kasa': acilis,
        'nakit_tahsilatlar': nakit_tahsilat,
        'nakit_gelirler': nakit_gelir,
        'nakit_giderler': nakit_gider,
        'nakit_iadeler': nakit_iade,
        'kasaya_para_girisi': manuel_giris + transfers['bankadan_kasaya'],
        'kasadan_para_cikisi': manuel_cikis,
        'bankaya_aktarim': transfers['bankaya_aktarim'],
        'bankadan_kasaya_aktarim': transfers['bankadan_kasaya'],
        'kasa_virmanlari': transfers['kasa_virman'],
        'gunluk_giris': gunluk_giris,
        'gunluk_cikis': gunluk_cikis,
        'beklenen_kasa': beklenen,
        'sayilan_kasa': sayilan,
        'kasa_farki': kasa_farki,
        'sayim_yapildi': sayim_yapildi,
        'not': not_msg,
    }


def build_grafik_verileri(
    odeme_kirilimi: list[dict],
    kategori_gelirler: list[dict],
    kategori_giderler: list[dict],
    saatlik_tahsilat: list[dict],
) -> dict:
    return {
        'odeme_turu_dagilimi': [
            {'label': r['label'], 'tutar': r['tutar']}
            for r in odeme_kirilimi if not r.get('is_total') and r['tutar'] > 0
        ],
        'gelir_dagilimi': [
            {'label': r['kategori'], 'tutar': r['tutar']}
            for r in kategori_gelirler if not r.get('is_total') and r['tutar'] > 0
        ],
        'gider_dagilimi': [
            {'label': r['kategori'], 'tutar': r['tutar']}
            for r in kategori_giderler if not r.get('is_total') and r['tutar'] > 0
        ],
        'saatlik_tahsilat': saatlik_tahsilat,
    }


def bugun_alinan_toplam(kurum_id: int, gun: date, sube_id: int | None = None) -> int:
    """
    Günlük alınan toplam (sözleşme + gelir + cari) — dashboard ile aynı iş günü mantığı,
    strict şube filtresi (yalnızca aktif şube kayıtları).
    """
    from apps.finans.application.cari_balance import cari_bagimsiz_tahsilat_q
    from apps.finans.constants.cari_types import CariHareketTuru
    from apps.finans.domain.cari_hareket import CariHareket
    from apps.odeme_takip.domain.models import Tahsilat

    toplam = 0

    t_qs = Tahsilat.objects.filter(
        sozlesme__kurum_id=kurum_id,
        durum=TahsilatDurum.AKTIF,
    ).exclude(tahsilat_turu=TahsilatTuru.IADE).filter(bugun_islem_q('tahsilat_tarihi', gun))
    if sube_id:
        t_qs = t_qs.filter(sozlesme__sube_id=sube_id)
    toplam += int(t_qs.aggregate(t=Sum('tutar'))['t'] or 0)

    gt_qs = GelirTahsilat.objects.filter(
        gelir_kaydi__kurum_id=kurum_id,
        durum=OdemeDurum.TAMAMLANDI,
    ).filter(bugun_islem_q('tahsilat_tarihi', gun))
    if sube_id:
        gt_qs = gt_qs.filter(gelir_kaydi__sube_id=sube_id)
    toplam += int(gt_qs.aggregate(t=Sum('tutar'))['t'] or 0)

    ch_qs = CariHareket.objects.filter(
        cari_bagimsiz_tahsilat_q(),
        kurum_id=kurum_id,
        islem_turu=CariHareketTuru.TAHSILAT,
    ).filter(bugun_islem_q('islem_tarihi', gun))
    if sube_id:
        ch_qs = ch_qs.filter(sube_id=sube_id)
    toplam += int(ch_qs.aggregate(t=Sum('tutar'))['t'] or 0)
    return toplam
