"""
Gelir & Gider v2 raporları — cari hesap raporlarıyla aynı modern PDF şablonu.
"""
from __future__ import annotations

import html
from typing import Any

from django.utils import timezone

from apps.finans.application.export.cari_report_html import (
    BRAND_PRIMARY,
    SOFTWARE_NAME,
    _brand_display,
    _esc,
    _fmt_tl,
    _logo_fallback_text,
    _resolve_logo,
)
from apps.finans.application.export.report_html_template import _format_cell


def _date_range_label(meta: dict[str, Any]) -> str:
    bas = meta.get("baslangic") or meta.get("tarih_baslangic")
    bit = meta.get("bitis") or meta.get("tarih_bitis")
    if meta.get("tarih_araligi"):
        return str(meta["tarih_araligi"])
    if bas and bit:
        return f"{_fmt_tr_date(bas)} - {_fmt_tr_date(bit)}"
    if bas:
        return f"{_fmt_tr_date(bas)} -"
    if bit:
        return f"- {_fmt_tr_date(bit)}"
    return "Tümü"


def _fmt_tr_date(value: Any) -> str:
    if not value:
        return ""
    s = str(value)[:10]
    parts = s.split("-")
    if len(parts) == 3:
        return f"{parts[2]}.{parts[1]}.{parts[0]}"
    return s


_VADE_LABELS = {
    "gecmis": "Vadesi Geçmiş",
    "gelen": "Vadesi Gelen",
    "gelecek": "Gelecek Vadeli",
    "tumu": "Tümü",
}
_GORUNUM_LABELS = {
    "ozet": "Özet (Cari Bazlı)",
    "detay": "Detaylı (Taksit Bazlı)",
}


def _filter_rows(meta: dict[str, Any]) -> list[tuple[str, str]]:
    rows = [
        ("Şube", meta.get("sube_ad") or meta.get("sube") or "Tümü"),
        ("Tarih Aralığı", _date_range_label(meta)),
    ]
    if meta.get("vade_durumu"):
        rows.append(("Vade Durumu", _VADE_LABELS.get(meta["vade_durumu"], meta["vade_durumu"])))
    if meta.get("gorunum"):
        rows.append(("Görünüm", _GORUNUM_LABELS.get(meta["gorunum"], meta["gorunum"])))
    if meta.get("modul"):
        rows.append(("Modül", "Gelir" if meta["modul"] == "gelir" else "Gider"))
    rows.append(("Kayıt Sayısı", str(meta.get("adet") or 0)))
    return rows


def _kpi_stat_boxes(chips: list[dict[str, Any]]) -> str:
    if not chips:
        return ""
    blocks = ""
    for chip in chips[:6]:
        label = _esc(chip.get("label") or "")
        val = _esc(chip.get("value") if chip.get("value") is not None else "—")
        blocks += (
            f'<div class="stat-box">'
            f'<div class="stat-box-label">{label}</div>'
            f'<div class="stat-box-value">{val}</div>'
            f"</div>"
        )
    return f'<div class="stat-box-grid">{blocks}</div>'


def _genel_toplam_table(totals: dict[str, Any]) -> str:
    if not totals:
        return ""
    rows = []
    for key, label in (
        ("toplam_kalan", "Toplam Kalan Borç"),
        ("vadesi_gecmis", "Vadesi Geçmiş"),
        ("vadesi_gelen", "Vadesi Gelen"),
        ("taksit_sayisi", "Taksit Sayısı"),
        ("cari_sayisi", "Cari Sayısı"),
        ("toplam_tutar", "Toplam Tutar"),
    ):
        if key in totals and totals[key] not in (None, ""):
            val = totals[key]
            if key in ("toplam_kalan", "vadesi_gecmis", "vadesi_gelen", "toplam_tutar"):
                val = _fmt_tl(val)
            else:
                val = _format_cell(val)
            rows.append((label, val))
    if not rows:
        return ""
    tbody = "".join(
        f'<tr><td>{_esc(lbl)}</td><td class="num">{val}</td></tr>' for lbl, val in rows
    )
    return (
        '<div class="section-title">Genel Toplam</div>'
        '<table class="totals-table"><thead><tr><th>Açıklama</th><th>Tutar</th></tr></thead>'
        f"<tbody>{tbody}</tbody></table>"
    )


def build_gg_report_html(
    *,
    title: str,
    columns: list[dict[str, str]],
    rows: list[dict[str, Any]],
    filters_meta: dict[str, Any] | None = None,
    kurum_ad: str | None = None,
    orientation: str = "landscape",
) -> str:
    meta = dict(filters_meta or {})
    keys = [c["key"] for c in columns]
    labels = [c.get("label", c["key"]) for c in columns]
    logo = _resolve_logo(meta)
    now = timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M")
    sube_ad = meta.get("sube_ad") or meta.get("sube")
    kurum = _esc(kurum_ad or meta.get("kurum_ad") or "")
    brand_line = _esc(_brand_display(kurum_ad, sube_ad))
    logo_alt = _esc(kurum_ad or "Kurum logosu")
    logo_fallback = _esc(_logo_fallback_text(kurum_ad))
    page_size = "A4 landscape" if orientation == "landscape" else "A4 portrait"
    table_font = "8.5px" if orientation == "landscape" else "9px"
    report_kind = meta.get("report_kind") or "gelir_gider_rapor"
    slug = report_kind.replace("gelir_gider_", "").replace("_", "-")
    if slug == "vade-borc":
        doc_kicker = "VADE BORÇ TAKİP RAPORU"
    else:
        doc_kicker = "GELİR & GİDER RAPORU"
    report_title = meta.get("rapor_adi") or title or "Finans Raporu"
    raporu_olusturan = meta.get("raporu_olusturan") or "—"
    tarih_araligi = _date_range_label(meta)
    totals = dict(meta.get("report_totals") or {})
    chips = meta.get("summary_chips") or []

    logo_block = (
        f'<img src="{logo}" alt="{logo_alt}" class="logo" />'
        if logo
        else f'<div class="logo-fallback">{logo_fallback}</div>'
    )

    filter_html = "".join(
        f'<div class="filter-row"><span class="filter-label">{lbl} :</span> '
        f'<span class="filter-value">{val}</span></div>'
        for lbl, val in _filter_rows(meta)
    )

    thead = "".join(f"<th>{html.escape(lbl)}</th>" for lbl in labels)
    tbody = ""
    for row in rows[:500]:
        cells = ""
        for k in keys:
            col = next((c for c in columns if c["key"] == k), {})
            fmt = col.get("format")
            raw = row.get(k)
            if fmt == "tl":
                cell = _fmt_tl(raw)
            elif fmt == "date":
                cell = _esc(_fmt_tr_date(raw) or "—")
            else:
                cell = _format_cell(raw)
            cells += f"<td>{cell}</td>"
        tbody += f"<tr>{cells}</tr>"

    extra_note = ""
    if len(rows) > 500:
        extra_note = (
            f'<p class="note">… ve {len(rows) - 500} satır daha '
            f"(PDF'de ilk 500 satır gösterilir)</p>"
        )

    stat_html = _kpi_stat_boxes(chips)
    genel_toplam = _genel_toplam_table(totals)

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>{_esc(report_title)}</title>
  <style>
    @page {{
      size: {page_size};
      margin: 10mm 8mm 16mm 8mm;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0 0 12mm 0;
      font-size: 10px;
      line-height: 1.4;
      background: #fff;
    }}
    .doc-header {{
      border-bottom: 3px solid {BRAND_PRIMARY};
      padding-bottom: 12px;
      margin-bottom: 14px;
    }}
    .doc-header-top {{
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }}
    .doc-header-left {{ display: flex; gap: 12px; align-items: center; }}
    .logo {{ width: 44px; height: 44px; object-fit: contain; }}
    .logo-fallback {{
      width: 44px; height: 44px; border-radius: 10px;
      background: {BRAND_PRIMARY}; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px;
    }}
    .doc-kicker {{
      font-size: 10px; font-weight: 700; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.06em;
    }}
    .doc-title {{
      font-size: 18px; font-weight: 800; color: {BRAND_PRIMARY}; margin: 2px 0 0;
    }}
    .doc-meta-line {{ font-size: 10px; color: #475569; margin-top: 3px; }}
    .doc-meta-line strong {{ color: #334155; }}
    .content-layout {{
      display: flex;
      gap: 14px;
      align-items: flex-start;
    }}
    .content-main {{ flex: 1; min-width: 0; }}
    .content-side {{ width: 168px; flex-shrink: 0; }}
    .section-title {{
      font-size: 11px; font-weight: 800; color: {BRAND_PRIMARY};
      text-transform: uppercase; letter-spacing: 0.04em;
      margin: 0 0 8px;
    }}
    .filters-box {{
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: #f8fafc;
    }}
    .filter-row {{ font-size: 10px; margin-bottom: 4px; }}
    .filter-label {{ color: #64748b; font-weight: 600; }}
    .filter-value {{ color: #1e293b; font-weight: 700; }}
    .stat-box-grid {{ display: flex; flex-direction: column; gap: 8px; }}
    .stat-box {{
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 8px 10px;
      background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
    }}
    .stat-box-label {{
      font-size: 8px; font-weight: 700; color: #64748b;
      text-transform: uppercase; letter-spacing: 0.04em;
    }}
    .stat-box-value {{
      font-size: 14px; font-weight: 800; color: {BRAND_PRIMARY}; margin-top: 2px;
    }}
    .totals-table {{
      width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 10px;
    }}
    .totals-table th {{
      background: #f1f5f9; color: #334155; text-align: left;
      padding: 6px 8px; border: 1px solid #e2e8f0;
    }}
    .totals-table td {{
      padding: 6px 8px; border: 1px solid #e2e8f0;
    }}
    .totals-table td.num {{ text-align: right; font-weight: 700; }}
    table.data-table {{
      width: 100%; border-collapse: collapse; font-size: {table_font};
    }}
    table.data-table thead th {{
      background: {BRAND_PRIMARY}; color: #fff;
      padding: 6px 7px; text-align: left; font-weight: 700;
      font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.03em;
    }}
    table.data-table tbody td {{
      padding: 5px 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top;
    }}
    table.data-table tbody tr:nth-child(even) {{ background: #f8fafc; }}
    .sign-block {{
      margin-top: 16px;
      padding: 10px 12px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #fafbfc;
      font-size: 10px;
    }}
    .sign-block div {{ margin-bottom: 4px; }}
    .note {{ font-size: 9px; color: #64748b; font-style: italic; margin-top: 8px; }}
  </style>
</head>
<body>
  <div class="doc-header">
    <div class="doc-header-top">
      <div class="doc-header-left">
        {logo_block}
        <div>
          <div class="doc-kicker">{_esc(doc_kicker)}</div>
          <h1 class="doc-title">{_esc(report_title)}</h1>
          <div class="doc-meta-line"><strong>Firma:</strong> {kurum or brand_line}</div>
          <div class="doc-meta-line"><strong>Rapor Tarihi:</strong> {now}</div>
          <div class="doc-meta-line"><strong>Tarih Aralığı:</strong> {_esc(tarih_araligi)}</div>
        </div>
      </div>
    </div>
  </div>

  <div class="filters-box">
    <div class="section-title" style="margin-bottom:6px;">Filtre Bilgileri</div>
    {filter_html}
  </div>

  <div class="content-layout">
    <div class="content-main">
      {genel_toplam}
      <div class="section-title">Detay Listesi</div>
      <table class="data-table">
        <thead><tr>{thead}</tr></thead>
        <tbody>{tbody or '<tr><td colspan="' + str(len(labels)) + '">Kayıt bulunamadı</td></tr>'}</tbody>
      </table>
      {extra_note}
    </div>
    {"<div class=\"content-side\">" + stat_html + "</div>" if stat_html else ""}
  </div>

  <div class="sign-block">
    <div class="section-title" style="margin-bottom:6px;">İmza / Bilgi</div>
    <div><strong>Raporu Oluşturan:</strong> {_esc(raporu_olusturan)}</div>
    <div><strong>Oluşturulma Tarihi:</strong> {now}</div>
  </div>
</body>
</html>"""


def gg_report_footer_template(meta: dict[str, Any] | None = None) -> str:
    meta = meta or {}
    user = _esc(meta.get("raporu_olusturan") or "")
    now = timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M")
    return f"""
<div style="width:100%;font-size:8px;color:#64748b;padding:0 8mm;font-family:Segoe UI,Arial,sans-serif;
  display:flex;justify-content:space-between;align-items:center;">
  <span style="font-weight:700;color:{BRAND_PRIMARY};">{SOFTWARE_NAME}</span>
  <span>{now}{f' · {user}' if user else ''}</span>
  <span>Sayfa <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>
"""
