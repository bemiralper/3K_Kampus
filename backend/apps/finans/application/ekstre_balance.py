"""
Cari dönem bakiyesi — Cari Ekstre raporu ve Hareketler sekmesinin ortak hesabı.

Bakiye, satırlardaki anlık görüntüden (bakiye_oncesi / bakiye_sonrasi) değil,
hareketlerin işlem tarihine göre sıralı toplamından hesaplanır. Geriye tarihli
girilen bir hareket görüntü alanlarını o anki toplamla yazar; dönem bakiyesi
yine de doğru kalır.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from django.utils.dateparse import parse_date

from apps.finans.constants.cari_types import CariHareketYonu
from apps.finans.domain.cari_hareket import CariHareket

KRONOLOJIK_SIRA = ('islem_tarihi', 'created_at', 'id')


@dataclass
class CariDonemBakiyesi:
    devreden: Decimal = Decimal('0')
    toplam_borc: Decimal = Decimal('0')
    toplam_alacak: Decimal = Decimal('0')
    kapanis: Decimal = Decimal('0')
    satir_bakiyeleri: dict[int, Decimal] = field(default_factory=dict)


def tarih_parametresi(value) -> date | None:
    """'YYYY-MM-DD' / date → date. Boş değer None; hatalı değer ValueError."""
    if value in (None, ''):
        return None
    if isinstance(value, date):
        return value
    parsed = parse_date(str(value)[:10])
    if parsed is None:
        raise ValueError(f'Geçersiz tarih: {value}')
    return parsed


def cari_donem_bakiyesi(
    cari_hesap_id,
    *,
    baslangic: date | None = None,
    bitis: date | None = None,
    islem_turleri=None,
    yon: str | None = None,
) -> CariDonemBakiyesi:
    """
    devreden  = başlangıçtan önceki tüm hareketlerin borç − alacak toplamı
    kapanış   = bitişe kadar tüm hareketlerin borç − alacak toplamı
    satır bakiyesi = o satır dahil kronolojik yürüyen bakiye

    `islem_turleri` / `yon` yalnızca dönem borç/alacak toplamlarını daraltır;
    devreden, kapanış ve satır bakiyeleri hesabın tüm hareketlerinden gelir.
    Dönemde hareket yoksa kapanış devredene eşittir.
    """
    qs = CariHareket.objects.filter(cari_hesap_id=cari_hesap_id)
    if bitis:
        qs = qs.filter(islem_tarihi__lte=bitis)
    turler = set(islem_turleri) if islem_turleri else None

    sonuc = CariDonemBakiyesi()
    bakiye = Decimal('0')
    for hid, tarih, satir_yon, tur, tutar in qs.order_by(*KRONOLOJIK_SIRA).values_list(
        'id', 'islem_tarihi', 'yon', 'islem_turu', 'tutar',
    ):
        tutar = Decimal(tutar or 0)
        borc_mu = satir_yon == CariHareketYonu.BORC
        bakiye += tutar if borc_mu else -tutar
        if baslangic and tarih < baslangic:
            sonuc.devreden = bakiye
            continue
        sonuc.satir_bakiyeleri[hid] = bakiye
        if (turler is None or tur in turler) and (not yon or satir_yon == yon):
            if borc_mu:
                sonuc.toplam_borc += tutar
            else:
                sonuc.toplam_alacak += tutar
    sonuc.kapanis = bakiye
    return sonuc
