"""
Veli telefon listesi yardımcıları.

OgrenciVeli.telefon = WhatsApp varsayılan numarası (mevcut iletişim akışları bunu kullanır).
OgrenciVeli.telefonlar = tüm numaralar (JSON listesi).
"""
from __future__ import annotations


def _clean_numara(value) -> str:
    return (value or '').strip()


def normalize_telefonlar(raw, *, fallback_telefon: str = '') -> list[dict]:
    """
    Ham listeyi normalize eder.
    Her öğe: {numara, etiket, whatsapp_varsayilan}
    En az bir WhatsApp varsayılanı garanti edilir.
    """
    items: list[dict] = []
    if isinstance(raw, list):
        for row in raw:
            if not isinstance(row, dict):
                continue
            numara = _clean_numara(row.get('numara') or row.get('telefon') or '')
            if not numara:
                continue
            items.append({
                'numara': numara,
                'etiket': (row.get('etiket') or '').strip()[:40],
                'whatsapp_varsayilan': bool(row.get('whatsapp_varsayilan')),
            })

    fallback = _clean_numara(fallback_telefon)
    if not items and fallback:
        items = [{'numara': fallback, 'etiket': 'Cep', 'whatsapp_varsayilan': True}]

    if not items:
        return []

    # Tekrarlı numaraları birleştir (ilk etiket / WA bayrağı korunur)
    seen: set[str] = set()
    deduped: list[dict] = []
    for item in items:
        key = ''.join(ch for ch in item['numara'] if ch.isdigit())
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    items = deduped

    if not any(i['whatsapp_varsayilan'] for i in items):
        items[0]['whatsapp_varsayilan'] = True
    else:
        # Tek bir WA varsayılanı
        found = False
        for item in items:
            if item['whatsapp_varsayilan'] and not found:
                found = True
            else:
                item['whatsapp_varsayilan'] = False

    return items


def whatsapp_phone_from_telefonlar(telefonlar, fallback: str = '') -> str:
    items = normalize_telefonlar(telefonlar, fallback_telefon=fallback)
    for item in items:
        if item.get('whatsapp_varsayilan'):
            return item['numara']
    if items:
        return items[0]['numara']
    return _clean_numara(fallback)


def apply_telefonlar(veli, telefonlar=None, telefon=None) -> None:
    """
    Veli üzerinde telefonlar + telefon alanlarını senkron tutar.
    telefonlar verilmezse mevcut telefon'dan tek kayıt üretir.
    """
    if telefonlar is None and telefon is None:
        return
    fallback = telefon if telefon is not None else getattr(veli, 'telefon', '')
    raw = telefonlar if telefonlar is not None else getattr(veli, 'telefonlar', None)
    items = normalize_telefonlar(raw, fallback_telefon=fallback or '')
    veli.telefonlar = items
    veli.telefon = whatsapp_phone_from_telefonlar(items, fallback=fallback or '')


def ensure_telefonlar_populated(veli) -> bool:
    """Eski kayıtlarda telefonlar boşsa telefon alanından doldurur. Değiştiyse True."""
    existing = getattr(veli, 'telefonlar', None) or []
    if existing:
        return False
    phone = (getattr(veli, 'telefon', '') or '').strip()
    if not phone:
        return False
    veli.telefonlar = normalize_telefonlar(None, fallback_telefon=phone)
    return True
