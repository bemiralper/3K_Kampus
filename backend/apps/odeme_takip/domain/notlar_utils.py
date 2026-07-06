"""Sözleşme notları — yapılandırılmış görünürlük desteği."""
from __future__ import annotations

import uuid
from typing import Any


def _clean_note_item(item: dict[str, Any]) -> dict[str, Any] | None:
    text = str(item.get('text') or '').strip()
    if not text:
        return None
    note_id = str(item.get('id') or '').strip() or str(uuid.uuid4())
    return {
        'id': note_id,
        'text': text,
        'veli_ile_paylas': bool(item.get('veli_ile_paylas', False)),
    }


def normalize_notlar_json(raw: Any) -> list[dict[str, Any]]:
    """API girdisini normalize et."""
    if not raw:
        return []
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return []
        return [{'id': 'legacy-1', 'text': text, 'veli_ile_paylas': True}]
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
    return [{'id': 'legacy-1', 'text': text, 'veli_ile_paylas': True}]


def get_notlar_json(sozlesme) -> list[dict[str, Any]]:
    """Modelden yapılandırılmış not listesi."""
    raw = getattr(sozlesme, 'notlar_json', None) or []
    if raw:
        return normalize_notlar_json(raw)
    return notlar_json_from_legacy_text(getattr(sozlesme, 'notlar', '') or '')


def notlar_to_legacy_text(notlar_json: list[dict[str, Any]]) -> str:
    """Geriye dönük uyumluluk — düz metin alanı."""
    return '\n\n'.join(
        n['text'] for n in notlar_json if n.get('text')
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
