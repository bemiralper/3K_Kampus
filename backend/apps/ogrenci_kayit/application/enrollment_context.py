"""Öğrenci kaydı bağlamı: sınıf seviyesi ve alan çözümlemesi (kayıt + sözleşme)."""

from __future__ import annotations

from apps.ogrenci_kayit.domain.sinif_seviyesi_rules import sinif_seviyesi_requires_alan


def infer_alan_id_from_enrolled_grup(ogrenci_id, egitim_yili_id=None) -> int | None:
    """Aktif grup dersi kaydından alan ID'sini çıkar (ör. Sayısal grup → sayısal alan)."""
    if not ogrenci_id:
        return None

    from apps.egitim_paketleri.models import GrupDersi
    from apps.ogrenci.domain.models import OgrenciEgitimPaketi

    grup_ids = list(
        OgrenciEgitimPaketi.objects.filter(
            ogrenci_id=ogrenci_id,
            aktif_mi=True,
            paket_turu="grup_dersi",
        ).values_list("paket_id", flat=True)
    )
    if not grup_ids:
        return None

    return (
        GrupDersi.objects.filter(id__in=grup_ids, alan_id__isnull=False)
        .values_list("alan_id", flat=True)
        .first()
    )


def resolve_kayit_alan_id(kayit, ogrenci_id=None, egitim_yili_id=None) -> int | None:
    """
    Öğrenci kaydı için alan ID:
    1) Kayıt üzerindeki alan (kayıt sihirbazından)
    2) Atanmış sınıfın alanı
    3) Aktif grup dersi kaydından çıkarım
    """
    if kayit is None:
        return infer_alan_id_from_enrolled_grup(ogrenci_id, egitim_yili_id)

    if getattr(kayit, "alan_id", None):
        return kayit.alan_id

    seviye = None
    if kayit.sinif and kayit.sinif.sinif_seviyesi_id:
        seviye = kayit.sinif.sinif_seviyesi
        if kayit.sinif.alan_id:
            return kayit.sinif.alan_id
    elif getattr(kayit, "sinif_seviyesi_id", None) and kayit.sinif_seviyesi:
        seviye = kayit.sinif_seviyesi

    oid = ogrenci_id or kayit.ogrenci_id
    eyid = egitim_yili_id or kayit.egitim_yili_id

    if seviye and sinif_seviyesi_requires_alan(seviye):
        inferred = infer_alan_id_from_enrolled_grup(oid, eyid)
        if inferred:
            return inferred

    return infer_alan_id_from_enrolled_grup(oid, eyid)


def resolve_kayit_sinif_seviyesi_id(kayit) -> int | None:
    if kayit is None:
        return None
    if kayit.sinif and kayit.sinif.sinif_seviyesi_id:
        return kayit.sinif.sinif_seviyesi_id
    return getattr(kayit, "sinif_seviyesi_id", None)
