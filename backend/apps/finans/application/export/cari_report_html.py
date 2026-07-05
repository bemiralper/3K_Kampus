"""
Cari Hesap Bakiye / Özet raporları — profesyonel PDF HTML şablonu.
"""
from __future__ import annotations

import html
from typing import Any

from django.utils import timezone

from apps.finans.application.export.report_html_template import (
    BRAND_PRIMARY,
    _brand_display,
    _format_cell,
    _logo_data_uri,
    _logo_fallback_text,
)

SOFTWARE_NAME = "3K Kampüs"


def _esc(value: Any) -> str:
    if value is None or value == "":
        return "—"
    return html.escape(str(value))


def _fmt_tl(amount: Any) -> str:
    if amount is None or amount == "":
        return "—"
    try:
        num = float(amount)
    except (TypeError, ValueError):
        return _esc(amount)
    formatted = f"{num:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{formatted} TL"


def _fmt_tr_date(value: Any) -> str:
    if not value:
        return ""
    s = str(value)[:10]
    parts = s.split("-")
    if len(parts) == 3:
        return f"{parts[2]}.{parts[1]}.{parts[0]}"
    return s


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


def _filter_rows(meta: dict[str, Any]) -> list[tuple[str, str]]:
    """Görüntülenecek filtre satırları (sıralı)."""
    report_kind = meta.get("report_kind") or "cari_bakiye"
    mapping = [
        ("cari_turu", meta.get("cari_turu") or meta.get("hesap_turu_label") or "Tümü"),
        ("sube", meta.get("sube_ad") or meta.get("sube") or "Tümü"),
        ("durum", meta.get("durum") or "Tümü"),
        ("para_birimi", meta.get("para_birimi") or "TL"),
    ]
    labels = {
        "cari_turu": "Cari Türü",
        "sube": "Şube",
        "durum": "Durum",
        "para_birimi": "Para Birimi",
    }
    rows = [(labels[k], _esc(v)) for k, v in mapping]

    if report_kind == "cari_ekstre":
        extra = [
            ("Cari", meta.get("cari_unvan") or "—"),
            ("Arama", meta.get("arama_filtresi") or "Tümü"),
            ("Kategori", meta.get("kategori_filtresi") or "Tümü"),
            ("Ödeme Yöntemi", meta.get("odeme_yontemi_filtresi") or "Tümü"),
            ("Hareket Sayısı", meta.get("filtrelenmis_hareket_sayisi") or "0"),
        ]
        rows = extra + rows
    return rows


def _stat_boxes(totals: dict[str, Any]) -> str:
    items = [
        ("Toplam Cari", totals.get("toplam_cari") or totals.get("kayit_sayisi") or 0),
        ("Borçlu Cari", totals.get("borclu_cari") or 0),
        ("Alacaklı Cari", totals.get("alacakli_cari") or 0),
        ("Bakiyesi Sıfır", totals.get("sifir_bakiye_cari") or totals.get("dengede_cari") or 0),
    ]
    blocks = ""
    for label, val in items:
        blocks += (
            f'<div class="stat-box">'
            f'<div class="stat-box-label">{_esc(label)}</div>'
            f'<div class="stat-box-value">{_format_cell(val)}</div>'
            f"</div>"
        )
    return f'<div class="stat-box-grid">{blocks}</div>'


def _genel_toplam_table(
    totals: dict[str, Any],
    *,
    report_kind: str = "cari_bakiye",
    meta: dict[str, Any] | None = None,
) -> str:
    if report_kind == "cari_ekstre":
        rows = [
            ("Toplam Borç (Cari)", _fmt_tl(totals.get("toplam_borc"))),
            ("Toplam Alacak (Cari)", _fmt_tl(totals.get("toplam_alacak"))),
            ("Net Bakiye", _fmt_tl(totals.get("net_bakiye"))),
        ]
        title = "Cari Bakiye Özeti"
    else:
        rows = [
            ("Toplam Cari Sayısı", _format_cell(totals.get("toplam_cari") or totals.get("kayit_sayisi") or 0)),
            ("Toplam Borç", _fmt_tl(totals.get("toplam_borc"))),
            ("Toplam Alacak", _fmt_tl(totals.get("toplam_alacak"))),
            ("Net Bakiye", _fmt_tl(totals.get("net_bakiye"))),
        ]
        title = "Genel Toplam"

    tbody = "".join(
        f"<tr><td>{_esc(lbl)}</td><td class=\"num\">{val}</td></tr>" for lbl, val in rows
    )
    html_out = (
        f'<div class="section-title">{_esc(title)}</div>'
        '<table class="totals-table"><thead><tr><th>Açıklama</th><th>Tutar</th></tr></thead>'
        f"<tbody>{tbody}</tbody></table>"
    )

    if report_kind == "cari_ekstre" and meta:
        donem_rows = [
            ("Dönem Toplam Borç", _esc(meta.get("donem_toplam_borc") or "—")),
            ("Dönem Toplam Alacak", _esc(meta.get("donem_toplam_alacak") or "—")),
            ("Dönem Net Hareket", _esc(meta.get("donem_net_hareket") or "—")),
            ("Filtrelenmiş Hareket Sayısı", _esc(meta.get("filtrelenmis_hareket_sayisi") or "0")),
        ]
        dtbody = "".join(
            f"<tr><td>{_esc(lbl)}</td><td class=\"num\">{val}</td></tr>" for lbl, val in donem_rows
        )
        html_out += (
            '<div class="section-title">Seçili Dönem / Filtre Hareket Toplamları</div>'
            '<table class="totals-table"><thead><tr><th>Açıklama</th><th>Tutar</th></tr></thead>'
            f"<tbody>{dtbody}</tbody></table>"
        )
    return html_out


def _ozet_kv_table(meta: dict[str, Any]) -> str:
    """Tek cari özet alanları (ekstre export üst bilgisi)."""
    skip = {
        "kurum_id", "sube_id", "kurum_ad", "sube_ad", "sube", "report_kind",
        "report_totals", "raporu_olusturan", "tarih_araligi", "baslangic", "bitis",
        "cari_unvan", "cari_turu", "hesap_turu_label", "durum", "para_birimi",
        "hesap_turu", "arama", "kayit_sayisi",
        "arama_filtresi", "kategori_filtresi", "odeme_yontemi_filtresi",
        "donem_toplam_borc", "donem_toplam_alacak", "donem_net_hareket",
        "filtrelenmis_hareket_sayisi", "rapor_adi",
    }
    rows = ""
    for key, val in meta.items():
        if key in skip or val in (None, ""):
            continue
        rows += f"<tr><td>{_esc(key)}</td><td>{_esc(val)}</td></tr>"
    if not rows:
        return ""
    return (
        '<div class="section-title">Cari Özet</div>'
        f'<table class="totals-table"><tbody>{rows}</tbody></table>'
    )


def build_cari_report_html(
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
    logo = _logo_data_uri()
    now = timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M")
    sube_ad = meta.get("sube_ad") or meta.get("sube")
    kurum = _esc(kurum_ad or meta.get("kurum_ad") or "")
    brand_line = _esc(_brand_display(kurum_ad, sube_ad))
    logo_alt = _esc(kurum_ad or "Kurum logosu")
    logo_fallback = _esc(_logo_fallback_text(kurum_ad))
    page_size = "A4 landscape" if orientation == "landscape" else "A4 portrait"
    table_font = "8.5px" if orientation == "landscape" else "9px"
    report_kind = meta.get("report_kind") or "cari_bakiye"
    kicker_map = {
        "cari_bakiye": "CARİ HESAP BAKİYE RAPORU",
        "cari_ozet": "CARİ ÖZET RAPORU",
        "cari_ekstre": "CARİ EKSTRE RAPORU",
    }
    doc_kicker = kicker_map.get(report_kind, "CARİ HESAP RAPORU")
    report_title = meta.get("rapor_adi") or title or "Cari Hesap Bakiye Raporu"
    raporu_olusturan = meta.get("raporu_olusturan") or "—"
    tarih_araligi = _date_range_label(meta)
    totals = dict(meta.get("report_totals") or {})

    if not totals.get("toplam_cari") and rows:
        totals.setdefault("toplam_cari", len(rows))

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
        cells = "".join(f"<td>{_format_cell(row.get(k))}</td>" for k in keys)
        tbody += f"<tr>{cells}</tr>"

    extra_note = ""
    if len(rows) > 500:
        extra_note = (
            f'<p class="note">… ve {len(rows) - 500} satır daha '
            f"(PDF'de ilk 500 satır gösterilir)</p>"
        )

    detail_title = "Ekstre Hareketleri" if report_kind == "cari_ekstre" else "Detay Listesi"
    stat_html = _stat_boxes(totals) if report_kind == "cari_bakiye" else ""
    genel_toplam = _genel_toplam_table(totals, report_kind=report_kind, meta=meta)
    ozet_table = _ozet_kv_table(meta) if report_kind in ("cari_ozet", "cari_ekstre") else ""

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
      font-size: 16px; font-weight: 800; color: {BRAND_PRIMARY}; margin-top: 2px;
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

  {ozet_table}

  <div class="content-layout">
    <div class="content-main">
      {genel_toplam}
      <div class="section-title">{_esc(detail_title)}</div>
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


def cari_report_footer_template(meta: dict[str, Any]) -> str:
    """Chromium PDF alt bilgi — sayfa numarası ve yazılım adı."""
    user = _esc(meta.get("raporu_olusturan") or "")
    now = timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M")
    return f"""
<div style="width:100%;font-size:8px;color:#64748b;padding:0 8mm;font-family:Segoe UI,Arial,sans-serif;
  display:flex;justify-content:space-between;align-items:center;">
  <span style="font-weight:700;color:#1F3C88;">{SOFTWARE_NAME}</span>
  <span>{now} · {user}</span>
  <span>Sayfa <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>
"""
