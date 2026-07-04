"""
Finans raporları için markalı HTML şablonu — PDF export.
"""
from __future__ import annotations

import base64
import html
from datetime import datetime
from pathlib import Path
from typing import Any

from django.conf import settings
from django.utils import timezone

BRAND_PRIMARY = "#1F3C88"
BRAND_ACCENT = "#2563eb"


def _logo_data_uri() -> str | None:
    candidates = [
        Path(settings.BASE_DIR).parent / "frontend" / "public" / "img" / "3k-logo.png",
        Path(settings.BASE_DIR) / "static" / "img" / "3k-logo.png",
    ]
    for path in candidates:
        if path.is_file():
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            return f"data:image/png;base64,{encoded}"
    return None


def _format_cell(value: Any) -> str:
    if value is None or value == "":
        return "—"
    if isinstance(value, float):
        return f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if isinstance(value, int) and abs(value) >= 1000:
        return f"{value:,}".replace(",", ".")
    return html.escape(str(value))


def _format_filter_label(key: str) -> str:
    labels = {
        "kurum_id": "Kurum",
        "sube_id": "Şube",
        "egitim_yili_id": "Eğitim Yılı",
        "baslangic": "Başlangıç",
        "bitis": "Bitiş",
        "mode": "Mod",
        "kaynak": "Kaynak",
        "odeme_yontemi_tipi": "Ödeme Yöntemi",
    }
    return labels.get(key, key.replace("_", " ").title())


def _brand_display(kurum_ad: str | None, sube_ad: str | None = None) -> str:
    parts = [p.strip() for p in (kurum_ad or '', sube_ad or '') if p and p.strip()]
    return ' · '.join(parts)


def _logo_fallback_text(kurum_ad: str | None) -> str:
    name = (kurum_ad or '').strip()
    if not name:
        return 'K'
    words = name.split()
    if len(words) >= 2:
        return (words[0][0] + words[1][0]).upper()
    return name[:2].upper()


def build_finans_report_html(
    *,
    title: str,
    columns: list[dict[str, str]],
    rows: list[dict[str, Any]],
    filters_meta: dict[str, Any] | None = None,
    kurum_ad: str | None = None,
    summary: dict[str, Any] | None = None,
    orientation: str = "portrait",
) -> str:
    """Ödev kontrol raporu tarzında markalı HTML belgesi."""
    keys = [c["key"] for c in columns]
    labels = [c.get("label", c["key"]) for c in columns]
    logo = _logo_data_uri()
    now = timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M")
    sube_ad = None
    if filters_meta:
        sube_ad = filters_meta.get('sube_ad') or filters_meta.get('sube')
    kurum = html.escape(kurum_ad or "")
    brand_line = html.escape(_brand_display(kurum_ad, sube_ad))
    footer_brand = brand_line or kurum
    logo_alt = html.escape(kurum_ad or "Kurum logosu")
    logo_fallback = html.escape(_logo_fallback_text(kurum_ad))
    page_size = "A4 landscape" if orientation == "landscape" else "A4 portrait"
    table_font = "9px" if orientation == "landscape" else "10px"
    th_font = "8px" if orientation == "landscape" else "9px"

    filter_rows = ""
    if filters_meta:
        for fk, fv in filters_meta.items():
            if fv in (None, ""):
                continue
            filter_rows += (
                f'<div class="meta-item"><span class="meta-label">{html.escape(_format_filter_label(fk))}</span>'
                f'<span class="meta-value">{html.escape(str(fv))}</span></div>'
            )

    summary_html = ""
    if summary:
        chips = ""
        for sk, sv in summary.items():
            if sv in (None, ""):
                continue
            chips += (
                f'<div class="summary-chip">'
                f'<div class="summary-chip-label">{html.escape(sk.replace("_", " "))}</div>'
                f'<div class="summary-chip-value">{_format_cell(sv)}</div>'
                f"</div>"
            )
        if chips:
            summary_html = f'<div class="summary-row">{chips}</div>'

    thead = "".join(f"<th>{html.escape(lbl)}</th>" for lbl in labels)
    tbody = ""
    for row in rows[:500]:
        cells = "".join(f"<td>{_format_cell(row.get(k))}</td>" for k in keys)
        tbody += f"<tr>{cells}</tr>"

    extra_note = ""
    if len(rows) > 500:
        extra_note = f'<p class="note">… ve {len(rows) - 500} satır daha (PDF\'de ilk 500 satır gösterilir)</p>'

    logo_block = (
        f'<img src="{logo}" alt="{logo_alt}" class="logo" />'
        if logo
        else f'<div class="logo-fallback">{logo_fallback}</div>'
    )

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <style>
    @page {{ size: {page_size}; margin: {"10mm 8mm" if orientation == "landscape" else "14mm 12mm"}; }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.45;
      background: #fff;
    }}
    .page {{
      max-width: 100%;
      padding: 0;
    }}
    .header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 14px;
      border-bottom: 3px solid {BRAND_PRIMARY};
      margin-bottom: 16px;
    }}
    .header-left {{ display: flex; align-items: center; gap: 12px; }}
    .logo {{ width: 42px; height: 42px; object-fit: contain; }}
    .logo-fallback {{
      width: 42px; height: 42px; border-radius: 10px;
      background: {BRAND_PRIMARY}; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px;
    }}
    .brand-title {{ font-size: 11px; color: #64748b; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }}
    .report-title {{ font-size: 20px; font-weight: 800; color: {BRAND_PRIMARY}; margin: 2px 0 0; }}
    .kurum-name {{ font-size: 12px; color: #475569; margin-top: 2px; }}
    .header-right {{ text-align: right; font-size: 10px; color: #94a3b8; }}
    .meta-grid {{
      display: flex; flex-wrap: wrap; gap: 8px 20px;
      background: #f8fafc; border: 1px solid #e2e8f0;
      border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;
    }}
    .meta-item {{ min-width: 120px; }}
    .meta-label {{ display: block; font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }}
    .meta-value {{ font-size: 11px; font-weight: 600; color: #334155; }}
    .summary-row {{
      display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px;
    }}
    .summary-chip {{
      flex: 1; min-width: 120px;
      background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
      border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px 12px;
    }}
    .summary-chip-label {{ font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }}
    .summary-chip-value {{ font-size: 14px; font-weight: 800; color: {BRAND_PRIMARY}; margin-top: 2px; }}
    table {{
      width: 100%; border-collapse: collapse; font-size: {table_font};
    }}
    thead th {{
      background: {BRAND_PRIMARY}; color: #fff;
      padding: {"6px 8px" if orientation == "landscape" else "8px 10px"}; text-align: left; font-weight: 700;
      font-size: {th_font}; text-transform: uppercase; letter-spacing: 0.04em;
    }}
    tbody td {{
      padding: {"5px 8px" if orientation == "landscape" else "7px 10px"}; border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }}
    tbody tr:nth-child(even) {{ background: #f8fafc; }}
    tbody tr:hover {{ background: #eff6ff; }}
    .footer {{
      margin-top: 18px; padding-top: 10px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 9px; color: #94a3b8;
    }}
    .footer-brand {{ font-weight: 700; color: {BRAND_PRIMARY}; }}
    .note {{ font-size: 10px; color: #64748b; margin-top: 8px; font-style: italic; }}
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-left">
        {logo_block}
        <div>
          <div class="brand-title">{brand_line or kurum}</div>
          <h1 class="report-title">{html.escape(title)}</h1>
          {f'<div class="kurum-name">{kurum}</div>' if kurum and not sube_ad else ''}
        </div>
      </div>
      <div class="header-right">
        <div>Oluşturulma</div>
        <div style="font-weight:600;color:#475569;">{now}</div>
      </div>
    </div>
    {f'<div class="meta-grid">{filter_rows}</div>' if filter_rows else ''}
    {summary_html}
    <table>
      <thead><tr>{thead}</tr></thead>
      <tbody>{tbody or '<tr><td colspan="' + str(len(labels)) + '">Kayıt bulunamadı</td></tr>'}</tbody>
    </table>
    {extra_note}
    <div class="footer">
      <span class="footer-brand">{footer_brand}</span>
      <span>{len(rows)} kayıt</span>
    </div>
  </div>
</body>
</html>"""
