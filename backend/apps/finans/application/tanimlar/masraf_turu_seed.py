"""Varsayılan masraf türlerini kurum bazında oluşturur (idempotent)."""
from __future__ import annotations

from apps.finans.domain.finansman_tanimlari import MasrafTuru

# migration 0032 ile aynı liste
DEFAULT_MASRAF_TURLERI = [
    ('EFT Masrafı', 'eft_masrafi', '', 10),
    ('Havale Masrafı', 'havale_masrafi', '', 20),
    ('FAST Ücreti', 'fast_ucreti', '', 30),
    ('POS Komisyonu', 'pos_komisyonu', '', 40),
    ('Sanal POS Komisyonu', 'sanal_pos_komisyonu', '', 50),
    ('Online Ödeme Komisyonu', 'online_odeme_komisyonu', '', 60),
    ('Hesap İşletim Ücreti', 'hesap_isletim_ucreti', '', 70),
    ('Döviz Çevrim Masrafı', 'doviz_cevrim_masrafi', '', 80),
    ('Diğer Banka Masrafları', 'diger_banka_masraflari', '', 90),
]


def ensure_masraf_turleri(kurum_id: int) -> int:
    """Eksik varsayılan masraf türlerini ekler; eklenen kayıt sayısını döner."""
    created = 0
    for ad, kesinti_turu, odeme_tipi, siralama in DEFAULT_MASRAF_TURLERI:
        if MasrafTuru.objects.filter(
            kurum_id=kurum_id,
            sube__isnull=True,
            ad=ad,
        ).exists():
            continue
        MasrafTuru.objects.create(
            kurum_id=kurum_id,
            sube=None,
            ad=ad,
            kesinti_turu=kesinti_turu,
            odeme_tipi=odeme_tipi,
            siralama=siralama,
            aktif_mi=True,
        )
        created += 1
    return created
