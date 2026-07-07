"""
Cari bakiye ve işlem türü toplamları — paylaşılan hesaplama yardımcıları.

Bakiye modeli (iki kova):
  toplam_borc  = borç yönlü hareketlerin kümülatif toplamı
  toplam_alacak = alacak yönlü hareketlerin kümülatif toplamı
  net_bakiye = toplam_borc - toplam_alacak

İşlem türü toplamları (islem_turu bazında, yön bağımsız):
  satis, alis, tahsilat, odeme, iade, mahsup
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


def empty_islem_totals() -> dict[str, float]:
    return {k: 0.0 for k in ISLEM_TURU_KEYS}


# GelirTahsilat servisi her tahsilat için otomatik bir CariHareket(TAHSILAT)
# üretir. Gün sonu / dashboard / dönem toplamları GelirTahsilat'ı zaten ayrı
# saydığından, aynı kaynaktan gelen cari tahsilat hareketleri toplamlara
# eklenirse çift sayım oluşur. Bu sabit, o hareketleri dışlamak için kullanılır.
GELIR_TAHSILAT_KAYNAK_TIP = 'GelirTahsilat'


def cari_bagimsiz_tahsilat_q():
    """GelirTahsilat kaynaklı olmayan (bağımsız) cari TAHSILAT hareketleri filtresi.

    Nakit/gün sonu toplamlarında GelirTahsilat kovasıyla çakışmayı (çift sayımı)
    önler. `CariHareket.objects.filter(... & cari_bagimsiz_tahsilat_q())` şeklinde
    kullanılır.
    """
    from django.db.models import Q
    return ~Q(kaynak_tip=GELIR_TAHSILAT_KAYNAK_TIP)


def net_bakiye(toplam_borc: float, toplam_alacak: float) -> float:
    return float(toplam_borc) - float(toplam_alacak)


def bakiye_durumu_from_net(bakiye: float) -> str:
    if bakiye > 0:
        return 'alacakli'
    if bakiye < 0:
        return 'borclu'
    return 'dengede'


def aggregate_list_totals(items: list[dict]) -> dict:
    """
    Filtrelenmiş cari listesi/rapor satırlarından özet toplamlar.
    Her satırda toplam_borc, toplam_alacak ve isteğe bağlı işlem türü alanları beklenir.
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
        borc = float(row.get('toplam_borc') or 0)
        alacak = float(row.get('toplam_alacak') or 0)
        totals['toplam_borc'] += borc
        totals['toplam_alacak'] += alacak
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
    totals['net_bakiye'] = totals['toplam_borc'] - totals['toplam_alacak']
    return totals
