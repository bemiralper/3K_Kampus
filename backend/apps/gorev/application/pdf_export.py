"""Görev metnini yazdırılabilir HTML'e çevirir. Görseller dosyadan gömülür."""
from __future__ import annotations

import base64
import html
import re

from apps.gorev.application.html_content import looks_like_html, sanitize_gorev_html
from apps.gorev.domain.models import GorevDosya

_IMG_SRC = re.compile(
    r'''src=(["'])(?:https?://[^"']*)?(/api/gorev/api/dosyalar/([0-9a-fA-F-]{36})/?)\1''',
    re.IGNORECASE,
)

_PRINT_CSS = """
  body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; font-size: 14px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .meta { color: #475569; font-size: 12px; margin: 0 0 18px; }
  img { max-width: 100%; height: auto; }
  img[data-align="left"] { float: left; width: 45%; margin: 0 12px 8px 0; }
  img[data-align="right"] { float: right; width: 45%; margin: 0 0 8px 12px; }
  img[data-align="center"] { display: block; margin: 8px auto; }
  .gorev-file-card { clear: both; border: 1px solid #b9d4ea; border-left: 4px solid #0061a6; padding: 8px 10px; margin: 10px 0; }
  table { border-collapse: collapse; width: 100%; }
  td, th { border: 1px solid #cbd5e1; padding: 6px 8px; }
  a { color: #0061a6; }
"""


def _inline_images(value: str, kurum_id: int) -> str:
    ids = {match[2].lower() for match in _IMG_SRC.findall(value)}
    if not ids:
        return value
    files = {
        str(item.id).lower(): item
        for item in GorevDosya.objects.filter(id__in=ids, kurum_id=kurum_id)
    }

    def replace(match: re.Match) -> str:
        dosya = files.get(match.group(3).lower())
        if not dosya or not (dosya.icerik_turu or '').startswith('image/'):
            return match.group(0)
        try:
            dosya.dosya.open('rb')
            raw = dosya.dosya.read()
        except OSError:
            return match.group(0)
        finally:
            try:
                dosya.dosya.close()
            except OSError:
                pass
        encoded = base64.b64encode(raw).decode('ascii')
        return f'src="data:{dosya.icerik_turu};base64,{encoded}"'

    return _IMG_SRC.sub(replace, value)


def build_gorev_pdf_html(gorev, kurum_id: int) -> str:
    raw = gorev.aciklama or ''
    if looks_like_html(raw):
        body = _inline_images(sanitize_gorev_html(raw), kurum_id)
    else:
        body = '<p>' + html.escape(raw).replace('\n', '<br>') + '</p>'
    tip = gorev.gorev_tipi.ad if gorev.gorev_tipi_id else ''
    when = gorev.son_tarih.strftime('%d.%m.%Y %H:%M') if gorev.son_tarih else ''
    meta = ' · '.join(part for part in (tip, when, gorev.get_oncelik_display() if hasattr(gorev, 'get_oncelik_display') else '') if part)
    title = html.escape(gorev.baslik or 'Görev')
    return f"""<!DOCTYPE html>
<html lang="tr"><head><meta charset="utf-8"><style>{_PRINT_CSS}</style></head>
<body><h1>{title}</h1><p class="meta">{html.escape(meta)}</p>{body}</body></html>"""
