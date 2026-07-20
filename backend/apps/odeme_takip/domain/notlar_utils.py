"""Sözleşme notları — yapılandırılmış görünürlük desteği."""
from __future__ import annotations

import uuid
from typing import Any

VALID_TIPS = frozenset({'genel', 'odeme_gorusmesi'})


def _parse_bool(value: Any, default: bool = False) -> bool:
    if value is True or value == 1:
        return True
    if value is False or value == 0 or value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', '1', 'yes', 'evet'):
            return True
        if normalized in ('false', '0', 'no', 'hayir', ''):
            return False
    return bool(value)


def _parse_optional_date(value: Any) -> str | None:
    if value is None or value == '':
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[:10]


def _clean_note_item(item: dict[str, Any]) -> dict[str, Any] | None:
    text = str(item.get('text') or '').strip()
    if not text:
        return None
    note_id = str(item.get('id') or '').strip() or str(uuid.uuid4())
    note: dict[str, Any] = {
        'id': note_id,
        'text': text,
        'veli_ile_paylas': _parse_bool(item.get('veli_ile_paylas'), default=False),
    }
    created_at = item.get('created_at')
    if created_at:
        note['created_at'] = str(created_at)
    by_name = str(item.get('created_by_name') or '').strip()
    if by_name:
        note['created_by_name'] = by_name
    soz = _parse_optional_date(item.get('soz_verilen_tarih'))
    if soz:
        note['soz_verilen_tarih'] = soz
    tip = str(item.get('tip') or '').strip()
    if tip in VALID_TIPS:
        note['tip'] = tip
    return note


def normalize_notlar_json(raw: Any) -> list[dict[str, Any]]:
    """API girdisini normalize et."""
    if not raw:
        return []
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        return [{'id': 'legacy-1', 'text': text, 'veli_ile_paylas': True, 'tip': 'genel'}]
    if not isinstance(raw, list):
        return []
    result: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        cleaned = _clean_note_item(item)
        if cleaned:
            result.append(cleaned)
    return result


def notlar_json_from_legacy_text(text: str) -> list[dict[str, Any]]:
    text = (text or '').strip()
    if not text:
        return []
    return [{'id': 'legacy-1', 'text': text, 'veli_ile_paylas': True, 'tip': 'genel'}]


def get_notlar_json(sozlesme) -> list[dict[str, Any]]:
    """Modelden yapılandırılmış not listesi."""
    raw = getattr(sozlesme, 'notlar_json', None)
    if isinstance(raw, list):
        return normalize_notlar_json(raw)
    return notlar_json_from_legacy_text(getattr(sozlesme, 'notlar', '') or '')


def notlar_to_legacy_text(notlar_json: list[dict[str, Any]]) -> str:
    """Geriye dönük uyumluluk — yalnızca veli ile paylaşılan notlar."""
    return '\n\n'.join(
        n['text'] for n in notlar_json if n.get('text') and n.get('veli_ile_paylas')
    )


def notlar_for_pdf(sozlesme) -> str:
    """PDF'de yalnızca veli ile paylaşılan notlar."""
    notes = get_notlar_json(sozlesme)
    shared = [n['text'] for n in notes if n.get('veli_ile_paylas')]
    return '\n\n'.join(shared)


def serialize_notlar(sozlesme) -> dict[str, Any]:
    notes = get_notlar_json(sozlesme)
    return {
        'notlar': notlar_to_legacy_text(notes),
        'notlar_json': notes,
    }
