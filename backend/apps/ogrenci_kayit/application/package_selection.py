"""
Ortak paket/hizmet seçim kuralları — kayıt ve sözleşme hattı.
"""
from __future__ import annotations

from apps.egitim_paketleri.models import Deneme, EkHizmet, YayinPaketi, hesapla_kdv
from apps.ogrenci_kayit.application.services import (
    _package_inclusions_for_wizard,
    resolve_grup_dersi_inclusions,
    resolve_premium_paket_inclusions,
)


def validate_student_selection(selection: dict, *, strict: bool = True) -> list[str]:
    """
    selection şekli:
    {
      'parent': {'tur': 'grup_dersi'|'premium', 'id': int} | None,
      'ozel_ders_ids': [int],
      'deneme_paketi_id': int | None,
      'yayin_paketi_ids': [int],
      'ek_hizmet_ids': [int],
    }
    """
    errors: list[str] = []
    parent = selection.get('parent')
    ozel_ders_ids = selection.get('ozel_ders_ids') or []
    deneme_id = selection.get('deneme_paketi_id')
    yayin_ids = selection.get('yayin_paketi_ids') or []
    ek_ids = selection.get('ek_hizmet_ids') or []

    if parent:
        tur = parent.get('tur')
        if tur not in ('grup_dersi', 'premium'):
            errors.append('Geçersiz ana paket türü')
        if tur == 'premium' and ozel_ders_ids:
            errors.append('Premium paket seçiliyken özel ders alınamaz')

    if deneme_id is not None and not isinstance(deneme_id, int):
        errors.append('Deneme paketi geçersiz')

    if strict:
        has_any = bool(
            parent
            or ozel_ders_ids
            or deneme_id is not None
            or yayin_ids
            or ek_ids
        )
        if not has_any:
            errors.append('En az bir paket veya hizmet seçiniz')

    return errors


def enrollment_to_selection(egitim_paketleri: list, ek_hizmetler: list) -> dict:
    """Kayıtlı öğrenci paketlerinden seçim state üret."""
    parent = None
    ozel_ders_ids = []
    deneme_paketi_id = None
    yayin_paketi_ids = []
    ek_hizmet_ids = []

    for ep in egitim_paketleri:
        tur = ep.get('paket_turu') if isinstance(ep, dict) else getattr(ep, 'paket_turu', None)
        pid = ep.get('paket_id') if isinstance(ep, dict) else getattr(ep, 'paket_id', None)
        if tur == 'grup_dersi' and parent is None:
            parent = {'tur': 'grup_dersi', 'id': pid}
        elif tur == 'premium' and parent is None:
            parent = {'tur': 'premium', 'id': pid}
        elif tur == 'ozel_ders':
            ozel_ders_ids.append(pid)
        elif tur == 'deneme' and deneme_paketi_id is None:
            deneme_paketi_id = pid
        elif tur == 'yayin':
            yayin_paketi_ids.append(pid)

    for eh in ek_hizmetler:
        eid = eh.get('ek_hizmet_id') if isinstance(eh, dict) else getattr(eh, 'ek_hizmet_id', None)
        if eid is not None:
            ek_hizmet_ids.append(eid)

    return {
        'parent': parent,
        'ozel_ders_ids': ozel_ders_ids,
        'deneme_paketi_id': deneme_paketi_id,
        'yayin_paketi_ids': yayin_paketi_ids,
        'ek_hizmet_ids': ek_hizmet_ids,
    }


def legacy_package_payload_to_selection(package_data: dict) -> dict:
    """Wizard PackageData (composite paketler) → selection dict."""
    parent = None
    ozel_ders_ids = []
    paketler = package_data.get('paketler') or []

    for pid_str in paketler:
        if '_' not in pid_str:
            continue
        kategori, db_id_str = pid_str.rsplit('_', 1)
        try:
            db_id = int(db_id_str)
        except (TypeError, ValueError):
            continue
        if kategori in ('grup_dersleri', 'grup_dersi') and parent is None:
            parent = {'tur': 'grup_dersi', 'id': db_id}
        elif kategori in ('premium_paketler', 'premium') and parent is None:
            parent = {'tur': 'premium', 'id': db_id}
        elif kategori in ('ozel_dersler', 'ozel_ders'):
            ozel_ders_ids.append(db_id)

    deneme_ids = package_data.get('deneme_paketi_ids') or []
    deneme_id = package_data.get('deneme_paketi_id')
    if deneme_id is None and deneme_ids:
        deneme_id = deneme_ids[0] if isinstance(deneme_ids, list) else None

    return {
        'parent': parent,
        'ozel_ders_ids': ozel_ders_ids,
        'deneme_paketi_id': deneme_id,
        'yayin_paketi_ids': package_data.get('yayin_paketi_ids') or [],
        'ek_hizmet_ids': package_data.get('ek_hizmet_ids') or [],
    }


def serialize_dahil_detay(paket, paket_turu: str, inclusion_kwargs: dict | None = None) -> dict:
    """Grup/premium paket için dahil kalem detayları (sözleşme + kalem seçenekleri)."""
    inclusion_kwargs = inclusion_kwargs or {}
    is_grup = paket_turu in ('grup_dersi', 'grup_dersleri')
    kaynak_turu = 'grup_dersleri' if is_grup else 'premium_paketler'

    ek_ids, deneme_ids, yayin_ids = _package_inclusions_for_wizard(
        paket, is_grup=is_grup, **inclusion_kwargs
    )

    dahil_hizmet_detay = []
    for h in EkHizmet.objects.filter(id__in=ek_ids, aktif_mi=True).exclude(hizmet_turu='deneme'):
        dahil_hizmet_detay.append({
            'id': -(h.id),
            'ek_hizmet_id': h.id,
            'ad': h.ad,
            'hizmet_turu': h.hizmet_turu,
            'kaynak_paket_turu': kaynak_turu,
            'kaynak_paket_id': paket.id,
            'deneme_paket_id': getattr(h, 'deneme_paketi_id', None),
            'fiyat': h.brut_fiyat or 0,
            'kdv_orani': h.kdv_orani or 10,
            'kdv_dahil_fiyat': h.brut_fiyat or 0,
        })

    for d in Deneme.objects.filter(id__in=deneme_ids, aktif_mi=True):
        iliskili_ek = EkHizmet.objects.filter(
            deneme_paketi_id=d.id, aktif_mi=True, hizmet_turu='deneme',
        ).first()
        dahil_hizmet_detay.append({
            'id': -(100000 + d.id),
            'ek_hizmet_id': iliskili_ek.id if iliskili_ek else None,
            'ad': f'Deneme — {d.ad}',
            'hizmet_turu': 'deneme',
            'kaynak_paket_turu': kaynak_turu,
            'kaynak_paket_id': paket.id,
            'deneme_paket_id': d.id,
            'fiyat': d.brut_fiyat or 0,
            'kdv_orani': d.kdv_orani or 10,
            'kdv_dahil_fiyat': d.brut_fiyat or 0,
        })

    dahil_yayin_detay = []
    for y in YayinPaketi.objects.filter(id__in=yayin_ids, aktif_mi=True):
        dahil_yayin_detay.append({
            'id': -(y.id),
            'paket_turu': 'yayin',
            'paket_turu_label': 'Yayın Paketi',
            'paket_id': y.id,
            'paket_adi': y.ad,
            'kaynak_paket_turu': kaynak_turu,
            'kaynak_paket_id': paket.id,
            'fiyat': y.brut_fiyat or 0,
            'kdv_orani': y.kdv_orani or 10,
            'kdv_dahil_fiyat': y.brut_fiyat or 0,
        })

    return {
        'dahil_ek_hizmet_ids': ek_ids,
        'dahil_deneme_paketi_ids': deneme_ids,
        'dahil_yayin_paketi_ids': yayin_ids,
        'dahil_hizmet_detay': dahil_hizmet_detay,
        'dahil_yayin_detay': dahil_yayin_detay,
    }


def build_dahil_from_catalog(paket_listesi: list, inclusion_kwargs: dict | None = None) -> tuple:
    """
    Kayıtlı grup/premium paketlerinin katalog dahil kalemlerinden
    sözleşme ekranı için dahil hizmet / deneme / yayın listesi üret.
    """
    inclusion_kwargs = inclusion_kwargs or {}
    dahil_hizmet_listesi = []
    dahil_deneme_paket_ids = set()
    dahil_paket_extras = []
    seen_ek_ids = set()
    seen_deneme_ids = set()
    seen_yayin_keys = set()

    for ep in paket_listesi:
        if ep.get('paket_turu') not in ('grup_dersi', 'premium'):
            continue
        dahil_ek_ids = ep.get('dahil_ek_hizmet_ids') or []
        dahil_deneme_ids = ep.get('dahil_deneme_paketi_ids') or []
        dahil_yayin_ids = ep.get('dahil_yayin_paketi_ids') or []
        kaynak_turu = 'grup_dersleri' if ep['paket_turu'] == 'grup_dersi' else 'premium_paketler'
        kaynak_id = ep['paket_id']

        dahil_deneme_paket_ids.update(dahil_deneme_ids)

        for hizmet in EkHizmet.objects.filter(id__in=dahil_ek_ids, aktif_mi=True).exclude(hizmet_turu='deneme'):
            if hizmet.id in seen_ek_ids:
                continue
            seen_ek_ids.add(hizmet.id)
            dahil_hizmet_listesi.append({
                'id': -(hizmet.id),
                'ek_hizmet_id': hizmet.id,
                'ad': hizmet.ad,
                'hizmet_turu': hizmet.hizmet_turu,
                'kaynak_paket_turu': kaynak_turu,
                'kaynak_paket_id': kaynak_id,
                'deneme_paket_id': None,
                'fiyat': hizmet.brut_fiyat or 0,
                'kdv_orani': hizmet.kdv_orani or 10,
                'kdv_dahil_fiyat': hizmet.brut_fiyat or 0,
            })

        for deneme in Deneme.objects.filter(id__in=dahil_deneme_ids, aktif_mi=True):
            if deneme.id in seen_deneme_ids:
                continue
            seen_deneme_ids.add(deneme.id)
            iliskili_ek = EkHizmet.objects.filter(
                deneme_paketi_id=deneme.id, aktif_mi=True, hizmet_turu='deneme',
            ).first()
            dahil_hizmet_listesi.append({
                'id': -(100000 + deneme.id),
                'ek_hizmet_id': iliskili_ek.id if iliskili_ek else None,
                'ad': f'Deneme — {deneme.ad}',
                'hizmet_turu': 'deneme',
                'kaynak_paket_turu': kaynak_turu,
                'kaynak_paket_id': kaynak_id,
                'deneme_paket_id': deneme.id,
                'fiyat': deneme.brut_fiyat or 0,
                'kdv_orani': deneme.kdv_orani or 10,
                'kdv_dahil_fiyat': deneme.brut_fiyat or 0,
            })

        for yp in YayinPaketi.objects.filter(id__in=dahil_yayin_ids, aktif_mi=True):
            key = (yp.id, 'yayin')
            if key in seen_yayin_keys:
                continue
            seen_yayin_keys.add(key)
            brut_fiyat = yp.brut_fiyat or 0
            kdv_orani = yp.kdv_orani or 10
            dahil_paket_extras.append({
                'id': -(yp.id),
                'paket_turu': 'yayin',
                'paket_turu_label': 'Yayın Paketi',
                'paket_id': yp.id,
                'paket_adi': yp.ad,
                'kaynak_paket_turu': kaynak_turu,
                'kaynak_paket_id': kaynak_id,
                'fiyat': brut_fiyat,
                'kdv_orani': kdv_orani,
                'kdv_dahil_fiyat': brut_fiyat,
            })

    return dahil_hizmet_listesi, sorted(dahil_deneme_paket_ids), dahil_paket_extras


def catalog_dahil_ids_for_paket(paket_turu: str, paket_id: int, inclusion_kwargs: dict | None = None):
    """Tek paket için M2M dahil ID listeleri."""
    from apps.egitim_paketleri.models import GrupDersi, PremiumPaket

    inclusion_kwargs = inclusion_kwargs or {}
    if paket_turu == 'grup_dersi':
        try:
            paket = GrupDersi.objects.get(id=paket_id)
            return resolve_grup_dersi_inclusions(paket, **inclusion_kwargs)
        except GrupDersi.DoesNotExist:
            return [], [], []
    if paket_turu == 'premium':
        try:
            paket = PremiumPaket.objects.get(id=paket_id)
            return resolve_premium_paket_inclusions(paket, **inclusion_kwargs)
        except PremiumPaket.DoesNotExist:
            return [], [], []
    return [], [], []
