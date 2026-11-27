"""
Cari bakiye ve işlem türü toplamları — paylaşılan hesaplama yardımcıları.

Bakiye modeli (iki kova):
  toplam_borc  = borç yönlü hareketlerin kümülatif toplamı
  toplam_alacak = alacak yönlü hareketlerin kümülatif toplamı
  net_bakiye = toplam_borc - toplam_alacak

İşlem türü toplamları (islem_turu bazında, yön bağımsız):
  satis, alis, tahsilat, odeme, iade, mahsup

Özet kartlardaki alış/satış/ödeme/tahsilat, iptal ve düzeltme iadeleri
düşülmüş net tutardır. Ham iade toplamı `iade` kovasında kalır.
"""
from __future__ import annotations

from apps.finans.constants.cari_types import CariHareketTuru

ISLEM_TURU_KEYS = (
    CariHareketTuru.SATIS,
    CariHareketTuru.ALIS,
    CariHareketTuru.TAHSILAT,
    CariHareketTuru.ODEME,
    CariHareketTuru.IADE,
    CariHareketTuru.MAHSUP,
)

# İade hareketinin kaynak_tip'i → hangi özet kovadan düşüleceği.
# Gider/gelir iptal ve tutar düzeltmesi eski alış/satışı silmez; ters kayıt IADE'dir.
IADE_NET_HEDEF = {
    'GiderKaydi': CariHareketTuru.ALIS,
    'GelirKaydi': CariHareketTuru.SATIS,
    'GiderOdeme': CariHareketTuru.ODEME,
    'GelirTahsilat': CariHareketTuru.TAHSILAT,
    'SerbestOdemeIptal': CariHareketTuru.ODEME,
    'SerbestTahsilatIptal': CariHareketTuru.TAHSILAT,
}


def empty_islem_totals() -> dict[str, float]:
    return {k: 0.0 for k in ISLEM_TURU_KEYS}


def apply_iade_netting(totals: dict, iade_by_kaynak: dict) -> dict:
    """İptal/düzeltme iadelerini ilgili alış-satış-ödeme-tahsilat toplamından düşer."""
    netted = dict(totals)
    for kaynak, tutar in (iade_by_kaynak or {}).items():
        hedef = IADE_NET_HEDEF.get(kaynak)
        if not hedef:
            continue
        netted[hedef] = max(
            0.0,
            round(float(netted.get(hedef, 0) or 0) - float(tutar or 0), 2),
        )
    return netted


# GelirTahsilat servisi her tahsilat için otomatik bir CariHareket(TAHSILAT)
# üretir. Gün sonu / dashboard / dönem toplamları GelirTahsilat'ı zaten ayrı
# saydığından, aynı kaynaktan gelen cari tahsilat hareketleri toplamlara
# eklenirse çift sayım oluşur. Bu sabit, o hareketleri dışlamak için kullanılır.
GELIR_TAHSILAT_KAYNAK_TIP = 'GelirTahsilat'


def cari_bagimsiz_tahsilat_q():
    """GelirTahsilat kaynaklı olmayan ve iptal edilmemiş bağımsız cari TAHSILAT hareketleri.

    Nakit/gün sonu toplamlarında GelirTahsilat kovasıyla çakışmayı (çift sayımı)
    ve iptal edilmiş SerbestTahsilat satırlarının sayılmasını önler.
    `CariHareket.objects.filter(... & cari_bagimsiz_tahsilat_q())` şeklinde kullanılır.
    """
    from django.db.models import Exists, OuterRef, Q
    from apps.finans.domain.cari_hareket import CariHareket

    iptal_var = CariHareket.objects.filter(
        kaynak_tip='SerbestTahsilatIptal',
        kaynak_id=OuterRef('pk'),
    )
    return ~Q(kaynak_tip=GELIR_TAHSILAT_KAYNAK_TIP) & ~Exists(iptal_var)


def gelir_gercek_tahsilat_q():
    """Nakit/banka girişi olan gerçek GelirTahsilat satırları (bakiyeden mahsup hariç)."""
    from django.db.models import Q
    return Q(bakiye_hareketi_id__isnull=True) | Q(bakiye_hareketi_id__gt=0)


def hesapla_serbest_odeme_bakiye(cari_hesap_id: int):
    """Tedarikçi/gider carisinde faturaya henüz mahsup edilmemiş serbest ödeme bakiyesi."""
    from decimal import Decimal
    from django.db.models import Sum
    from apps.finans.constants.gider_types import OdemeDurum
    from apps.finans.domain.cari_hareket import CariHareket
    from apps.finans.domain.gider_odeme import GiderOdeme

    serbest = (
        CariHareket.objects.filter(
            cari_hesap_id=cari_hesap_id,
            kaynak_tip='SerbestOdeme',
            islem_turu=CariHareketTuru.ODEME,
        ).aggregate(t=Sum('tutar'))['t']
        or Decimal('0.00')
    )
    iptaller = (
        CariHareket.objects.filter(
            cari_hesap_id=cari_hesap_id,
            kaynak_tip='SerbestOdemeIptal',
        ).aggregate(t=Sum('tutar'))['t']
        or Decimal('0.00')
    )
    aktif_mahsuplar = (
        GiderOdeme.objects.filter(
            gider_kaydi__cari_hesap_id=cari_hesap_id,
            bakiyeden_mahsup=True,
            durum=OdemeDurum.TAMAMLANDI,
        ).aggregate(t=Sum('tutar'))['t']
        or Decimal('0.00')
    )
    kalan = serbest - iptaller - aktif_mahsuplar
    return kalan if kalan > Decimal('0.00') else Decimal('0.00')


def hesapla_serbest_tahsilat_bakiye(cari_hesap_id: int):
    """Müşteri/gelir carisinde faturaya henüz mahsup edilmemiş serbest tahsilat bakiyesi."""
    from decimal import Decimal
    from django.db.models import Sum
    from apps.finans.constants.cari_types import CariHareketYonu
    from apps.finans.constants.gider_types import OdemeDurum
    from apps.finans.domain.cari_hareket import CariHareket
    from apps.finans.domain.gelir_tahsilat import GelirTahsilat

    serbest = (
        CariHareket.objects.filter(
            cari_hesap_id=cari_hesap_id,
            kaynak_tip__in=('SerbestTahsilat', 'CekSenetDetay'),
            yon=CariHareketYonu.ALACAK,
            islem_turu=CariHareketTuru.TAHSILAT,
        ).aggregate(t=Sum('tutar'))['t']
        or Decimal('0.00')
    )
    iptaller = (
        CariHareket.objects.filter(
            cari_hesap_id=cari_hesap_id,
            kaynak_tip='SerbestTahsilatIptal',
        ).aggregate(t=Sum('tutar'))['t']
        or Decimal('0.00')
    )
    aktif_mahsuplar = (
        GelirTahsilat.objects.filter(
            gelir_kaydi__cari_hesap_id=cari_hesap_id,
            bakiye_hareketi_id=GelirTahsilat.MAHSUP_SENTINEL_BH_ID,
            durum=OdemeDurum.TAMAMLANDI,
        ).aggregate(t=Sum('tutar'))['t']
        or Decimal('0.00')
    )
    kalan = serbest - iptaller - aktif_mahsuplar
    return kalan if kalan > Decimal('0.00') else Decimal('0.00')


def net_bakiye(toplam_borc: float, toplam_alacak: float) -> float:
    return float(toplam_borc) - float(toplam_alacak)


def bakiye_durumu_from_net(bakiye: float) -> str:
    if bakiye > 0:
        return 'alacakli'
    if bakiye < 0:
        return 'borclu'
    return 'dengede'


def acik_verecek(bakiye: float) -> float:
    """Ödenecek açık tutar (net bakiye negatif)."""
    return abs(float(bakiye)) if float(bakiye) < 0 else 0.0


def acik_alacak(bakiye: float) -> float:
    """Tahsil edilecek açık tutar (net bakiye pozitif)."""
    b = float(bakiye)
    return b if b > 0 else 0.0


def row_bakiye(row: dict) -> float:
    if row.get('bakiye') is not None:
        return float(row['bakiye'])
    return net_bakiye(
        float(row.get('toplam_borc') or 0),
        float(row.get('toplam_alacak') or 0),
    )


def aggregate_list_totals(items: list[dict]) -> dict:
    """
    Filtrelenmiş cari listesi/rapor satırlarından özet toplamlar.
    Borç/alacak özetleri açık bakiye (ödenecek / tahsil edilecek) olarak hesaplanır.
    """
    totals = {
        'toplam_cari': len(items),
        'toplam_borc': 0.0,
        'toplam_alacak': 0.0,
        'net_bakiye': 0.0,
        'toplam_satis': 0.0,
        'toplam_alis': 0.0,
        'toplam_tahsilat': 0.0,
        'toplam_odeme': 0.0,
        'toplam_iade': 0.0,
        'toplam_mahsup': 0.0,
        'borclu_cari': 0,
        'alacakli_cari': 0,
        'sifir_bakiye_cari': 0,
    }
    for row in items:
        bakiye = row_bakiye(row)
        totals['toplam_borc'] += acik_verecek(bakiye)
        totals['toplam_alacak'] += acik_alacak(bakiye)
        totals['net_bakiye'] += bakiye
        totals['toplam_satis'] += float(row.get('toplam_satis') or 0)
        totals['toplam_alis'] += float(row.get('toplam_alis') or 0)
        totals['toplam_tahsilat'] += float(row.get('toplam_tahsilat') or 0)
        totals['toplam_odeme'] += float(row.get('toplam_odeme') or 0)
        totals['toplam_iade'] += float(row.get('toplam_iade') or 0)
        totals['toplam_mahsup'] += float(row.get('toplam_mahsup') or 0)
        durum = row.get('bakiye_durumu')
        if durum == 'borclu':
            totals['borclu_cari'] += 1
        elif durum == 'alacakli':
            totals['alacakli_cari'] += 1
        else:
            totals['sifir_bakiye_cari'] += 1
    return totals
