"""
Veli iletişim bilgisi çözümleme — OgrenciVeli kaydı + legacy ogrenci.veli_telefon fallback.
"""
from __future__ import annotations

from apps.communication.application.contact_resolver import ContactResolver


def effective_veli_phone(veli, ogrenci=None) -> str:
    """Veli telefonu; boşsa varsayılan veli için ogrenci.veli_telefon kullanılır."""
    phone = (getattr(veli, 'telefon', '') or '').strip()
    if phone:
        return phone
    ogrenci = ogrenci or getattr(veli, 'ogrenci', None)
    if ogrenci is None:
        return ''
    legacy = (getattr(ogrenci, 'veli_telefon', '') or '').strip()
    if not legacy:
        return ''
    if getattr(veli, 'varsayilan', False):
        return legacy
    return ''


def list_outbound_veliler(ogrenci) -> list[tuple]:
    """
    Mesaj gönderimi için (veli, telefon) çiftleri.
    Aynı E.164 numarası bir kez döner; varsayılan veli önce gelir.
    """
    from apps.ogrenci.domain.models import OgrenciVeli

    veliler = list(
        OgrenciVeli.objects.filter(ogrenci=ogrenci).order_by('-varsayilan', '-id')
    )
    legacy = (getattr(ogrenci, 'veli_telefon', '') or '').strip()
    results: list[tuple] = []
    seen_e164: set[str] = set()

    for veli in veliler:
        phone = effective_veli_phone(veli, ogrenci)
        if not phone and len(veliler) == 1 and legacy:
            phone = legacy
        if not phone:
            continue
        try:
            e164 = ContactResolver.normalize(phone)
        except Exception:
            continue
        if e164 in seen_e164:
            continue
        seen_e164.add(e164)
        results.append((veli, phone))

    if not results and legacy:
        veli = next((v for v in veliler if v.varsayilan), veliler[0] if veliler else None)
        if veli is None:
            veli = ensure_legacy_veli_record(ogrenci)
        if veli:
            try:
                e164 = ContactResolver.normalize(legacy)
                if e164 not in seen_e164:
                    results.append((veli, legacy))
            except Exception:
                pass

    return results


def ensure_legacy_veli_record(ogrenci):
    """
    OgrenciVeli kaydı yoksa legacy veli_ad_soyad / veli_telefon ile oluşturur.
    Kayıt varsa dokunmaz.
    """
    from apps.ogrenci.domain.models import OgrenciVeli

    phone = (getattr(ogrenci, 'veli_telefon', '') or '').strip()
    if not phone:
        return None

    existing = OgrenciVeli.objects.filter(ogrenci=ogrenci).first()
    if existing:
        return existing

    ad_soyad = (getattr(ogrenci, 'veli_ad_soyad', '') or 'Veli').strip().split()
    ad = ad_soyad[0] if ad_soyad else 'Veli'
    soyad = ' '.join(ad_soyad[1:]) if len(ad_soyad) > 1 else ''

    return OgrenciVeli.objects.create(
        ogrenci=ogrenci,
        veli_turu=getattr(ogrenci, 'veli_yakinlik', None) or 'diger',
        ad=ad,
        soyad=soyad,
        telefon=phone,
        sms_bildirimleri=['duyuru', 'devamsizlik'],
        varsayilan=True,
    )


def default_veli_contact(ogrenci_id: int) -> dict | None:
    """Öğrenci başına varsayılan veli telefonu ve id (koç listesi vb.)."""
    from apps.ogrenci.domain.models import Ogrenci

    ogrenci = Ogrenci.objects.filter(id=ogrenci_id).first()
    if not ogrenci:
        return None
    pairs = list_outbound_veliler(ogrenci)
    if not pairs:
        return None
    veli, phone = pairs[0]
    return {'id': veli.id, 'telefon': phone}
