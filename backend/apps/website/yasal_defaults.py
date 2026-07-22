"""Yasal metin varsayılanları — seed ve bootstrap tarafından paylaşılır."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from apps.kurum.domain.models import Kurum
from apps.website.models import YasalMetin

_DATA_FILE = Path(__file__).resolve().parent / 'data' / 'yasal_defaults.json'

LEGACY_PLACEHOLDER_MARKERS = (
    'metni buradan düzenleyin',
    'örnek bir kvkk',
    'örnek metindir',
    'bu metni güncelleyin',
    'bu metni kurum',
    'gizlilik politikası metni.',
    'kvkk aydınlatma metni.',
    'platform kullanım koşulları.',
    'çerez politikası metni.',
)


@lru_cache(maxsize=1)
def load_yasal_metin_defaults() -> dict[str, dict[str, str | bool]]:
    if not _DATA_FILE.is_file():
        raise FileNotFoundError(f'Yasal varsayılan dosyası bulunamadı: {_DATA_FILE}')
    with _DATA_FILE.open(encoding='utf-8') as fh:
        data = json.load(fh)
    if not isinstance(data, dict):
        raise ValueError('yasal_defaults.json geçersiz')
    return data


def is_published_yasal_html(icerik: str | None) -> bool:
    """Tam yasal şablon HTML — CMS ve sitede nihai içerik sayılır."""
    text = (icerik or '').strip()
    return 'yasal-section' in text and 'yasal-hero' in text


def is_placeholder_yasal_content(icerik: str | None) -> bool:
    if not (icerik or '').strip():
        return True
    if is_published_yasal_html(icerik):
        return False
    text = icerik.strip()
    if text.startswith('{') and '"sections"' in text:
        return True
    lowered = text.lower()
    if any(marker in lowered for marker in LEGACY_PLACEHOLDER_MARKERS):
        return True
    return len(text) < 2000


def cms_preview_html(icerik: str, baslik: str) -> str:
    """CMS richText önizlemesi — HTML içeriği doğrudan kullanılır."""
    if is_published_yasal_html(icerik):
        return icerik
    text = (icerik or '').strip()
    if text.startswith('{'):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return icerik
        meta = data.get('meta') or {}
        title = meta.get('title') or baslik
        intro = meta.get('intro') or ''
        return (
            f'<h2>{title}</h2>'
            f'<p>{intro}</p>'
            f'<p><em>Güncel metin yasal sayfa olarak yayınlanır — sync_yasal_content çalıştırın.</em></p>'
        )
    return icerik


def apply_yasal_default_content(obj: YasalMetin) -> bool:
    """Kaydı varsayılan tam HTML ile günceller."""
    payload = load_yasal_metin_defaults().get(obj.tur)
    if not payload:
        return False
    obj.baslik = str(payload.get('baslik') or obj.baslik)
    obj.icerik = str(payload.get('icerik') or '')
    obj.aktif = bool(payload.get('aktif', True))
    obj.save(update_fields=['baslik', 'icerik', 'aktif', 'updated_at'])
    return True


def upgrade_yasal_metin_if_needed(obj: YasalMetin) -> bool:
    if not is_placeholder_yasal_content(obj.icerik):
        return False
    return apply_yasal_default_content(obj)


def ensure_yasal_metinler(
    kurum: Kurum,
    *,
    upgrade_placeholders: bool = False,
    force: bool = False,
) -> dict[str, int]:
    """Eksik yasal metin kayıtlarını oluşturur; isteğe bağlı günceller."""
    created = 0
    upgraded = 0
    defaults = load_yasal_metin_defaults()
    for tur, payload in defaults.items():
        baslik = str(payload.get('baslik') or '')
        icerik = str(payload.get('icerik') or '')
        aktif = bool(payload.get('aktif', True))
        obj, was_created = YasalMetin.objects.get_or_create(
            kurum=kurum,
            tur=tur,
            defaults={'baslik': baslik, 'icerik': icerik, 'aktif': aktif},
        )
        if was_created:
            created += 1
            continue
        should_upgrade = force or (upgrade_placeholders and is_placeholder_yasal_content(obj.icerik))
        if should_upgrade:
            apply_yasal_default_content(obj)
            upgraded += 1
    return {'created': created, 'upgraded': upgraded}
