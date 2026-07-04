"""Sınıf seviyesine göre kayıt sihirbazı kuralları."""

ALAN_REQUIRED_KODLARI = frozenset({"11", "12", "mezun"})


def sinif_seviyesi_requires_alan(seviye) -> bool:
    """11, 12 ve Mezun sınıf seviyelerinde alan seçimi gösterilir."""
    if seviye is None:
        return False

    kod = (getattr(seviye, "kod", None) or "").strip().casefold()
    if kod in ALAN_REQUIRED_KODLARI:
        return True

    ad = (getattr(seviye, "ad", None) or "").strip().casefold()
    if ad.startswith("11") or ad.startswith("12") or "mezun" in ad:
        return True

    return False
