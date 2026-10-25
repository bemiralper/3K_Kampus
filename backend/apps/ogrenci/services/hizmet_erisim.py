"""Güncel hizmet uygunluğu.

Okuma kaynağı, sözleşmeden türetilen aktif `OgrenciEkHizmet` kaydıdır.
Yazma `sozlesme_erisim_sync` içindedir; liste ve işlem kapıları bu sorguyu kullanır.
"""
from __future__ import annotations

def ogrenci_ids_with_hizmet_turu(
    hizmet_turu: str,
    *,
    kurum_id=None,
    sube_id=None,
    egitim_yili_id=None,
    ogrenci_ids=None,
    aktif_ogrenci=True,
) -> set[int]:
    """Aktif hizmet kaydı olan öğrenci kimlikleri.

    Eğitim yılı verilirse yalnızca o yılın satırı döner. Yılı boş satır
    süresiz hak değildir; bütün yıllara yazılmaz. Yıl verilmezse yıl süzgeci
    uygulanmaz.
    """
    from apps.ogrenci.domain.models import OgrenciEkHizmet

    qs = OgrenciEkHizmet.objects.filter(
        aktif_mi=True,
        ek_hizmet__hizmet_turu=hizmet_turu,
        ek_hizmet__aktif_mi=True,
    )
    if kurum_id:
        qs = qs.filter(ek_hizmet__kurum_id=kurum_id, ogrenci__kurum_id=kurum_id)
    if sube_id:
        qs = qs.filter(ek_hizmet__sube_id=sube_id, ogrenci__sube_id=sube_id)
    if aktif_ogrenci:
        qs = qs.filter(ogrenci__aktif_mi=True)
    if ogrenci_ids is not None:
        qs = qs.filter(ogrenci_id__in=list(ogrenci_ids))
    if egitim_yili_id:
        qs = qs.filter(egitim_yili_id=egitim_yili_id)
    return set(qs.values_list('ogrenci_id', flat=True))


def student_has_hizmet_turu(
    ogrenci_id,
    hizmet_turu: str,
    *,
    kurum_id=None,
    sube_id=None,
    egitim_yili_id=None,
) -> bool:
    if not ogrenci_id:
        return False
    return ogrenci_id in ogrenci_ids_with_hizmet_turu(
        hizmet_turu,
        kurum_id=kurum_id,
        sube_id=sube_id,
        egitim_yili_id=egitim_yili_id,
        ogrenci_ids=[ogrenci_id],
        aktif_ogrenci=True,
    )
