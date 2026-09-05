"""
Gider ödeme durumu — gider kaydı ≠ gerçekleşen kasa/banka çıkışı.

Ödeme durumu vade ve ödenen tutardan hesaplanır; BakiyeHareketi oluşturmaz.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.finans.constants.gider_types import (
    GiderDurum,
    GiderOdemeDurumu,
    GiderOdemeTakibiDurum,
    GiderTaksitDurum,
)


def resolve_taksit_durum_values(vade_tarihi, tutar, odenen_tutar, *, iptal=False, today=None) -> str:
    """Taksit satırının güncel ödeme durumunu primitive değerlerden hesaplar."""
    today = today or timezone.localdate()
    if iptal:
        return GiderTaksitDurum.IPTAL
    odenen = odenen_tutar or Decimal('0')
    if odenen >= tutar:
        return GiderTaksitDurum.ODENDI
    if odenen > Decimal('0'):
        return GiderTaksitDurum.KISMI_ODENDI
    if vade_tarihi and vade_tarihi > today:
        return GiderTaksitDurum.ILERI_TARIHLI
    if vade_tarihi and vade_tarihi < today:
        return GiderTaksitDurum.GECIKTI
    return GiderTaksitDurum.BEKLEMEDE


def resolve_taksit_durum(taksit, today=None) -> str:
    """Taksit satırının güncel ödeme durumunu döner (kaydetmez)."""
    return resolve_taksit_durum_values(
        taksit.vade_tarihi,
        taksit.tutar,
        taksit.odenen_tutar,
        iptal=taksit.durum == GiderTaksitDurum.IPTAL,
        today=today,
    )


def resolve_odeme_takibi_durum(vade_tarihi, tutar, odenen_tutar, *, iptal=False, today=None) -> str:
    """
    Ödeme Takibi satır durumu. Saklanan taksit durumunu değiştirmez.
    Kısmi ödeme, tarih kovasından önce gelir (kullanıcı kalanı görür).
    """
    today = today or timezone.localdate()
    if iptal:
        return GiderOdemeTakibiDurum.IPTAL
    odenen = odenen_tutar or Decimal('0')
    if tutar is not None and odenen >= tutar and tutar > 0:
        return GiderOdemeTakibiDurum.ODENDI
    if odenen > Decimal('0'):
        return GiderOdemeTakibiDurum.KISMI_ODENDI
    if not vade_tarihi:
        return GiderOdemeTakibiDurum.BEKLIYOR
    if vade_tarihi < today:
        return GiderOdemeTakibiDurum.GECIKTI
    if vade_tarihi == today:
        return GiderOdemeTakibiDurum.BUGUN
    sinir = today + timedelta(days=GiderOdemeTakibiDurum.YAKLASAN_GUN)
    if vade_tarihi <= sinir:
        return GiderOdemeTakibiDurum.YAKLASIYOR
    return GiderOdemeTakibiDurum.ILERI_TARIHLI


def compute_odeme_durumu(gider, today=None) -> str:
    """
    Gider kaydının ödeme durumunu hesaplar.

    İleri tarihli / bekleyen ödeme, gerçekleşmiş kasa hareketi değildir.
    """
    today = today or timezone.localdate()
    if gider.durum == GiderDurum.IPTAL:
        return GiderOdemeDurumu.IPTAL
    if gider.odenen_toplam >= gider.net_tutar and gider.net_tutar > 0:
        return GiderOdemeDurumu.ODENDI
    if gider.odenen_toplam > Decimal('0'):
        return GiderOdemeDurumu.KISMI_ODENDI

    taksitler = list(gider.taksitler.all()) if hasattr(gider, 'taksitler') else []
    acik = [
        t for t in taksitler
        if t.durum != GiderTaksitDurum.IPTAL and t.odenen_tutar < t.tutar
    ]
    if not acik:
        vade = gider.vade_tarihi
        if vade and vade > today:
            return GiderOdemeDurumu.ILERI_TARIHLI
        if vade and vade < today:
            return GiderOdemeDurumu.GECIKTI
        return GiderOdemeDurumu.BEKLIYOR

    if all(t.vade_tarihi and t.vade_tarihi > today for t in acik):
        return GiderOdemeDurumu.ILERI_TARIHLI
    if any(t.vade_tarihi and t.vade_tarihi < today for t in acik):
        return GiderOdemeDurumu.GECIKTI
    return GiderOdemeDurumu.BEKLIYOR
