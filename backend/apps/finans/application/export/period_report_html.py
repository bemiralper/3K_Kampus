"""
Dönem Tahsilat raporu — grafikli PDF HTML şablonu.
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
    _resolve_logo,
    _logo_fallback_text,
)

CHART_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b"]


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
    formatted = f"{num:,.0f}".replace(",", ".")
    return f"{formatted} TL"


def _fmt_tr_date(value: Any) -> str:
    if not value:
        return "—"
    s = str(value)[:10]
    parts = s.split("-")
    if len(parts) == 3:
        return f"{parts[2]}.{parts[1]}.{parts[0]}"
    return s


def _yontem_chart(yontem_dagilimi: list[dict]) -> str:
    if not yontem_dagilimi:
        return '<p class="empty-note">Bu dönemde yöntem dağılımı verisi yok.</p>'

    max_val = max(int(y.get("toplam") or 0) for y in yontem_dagilimi) or 1
    bars = ""
    legend = ""
    for i, y in enumerate(yontem_dagilimi):
        color = CHART_COLORS[i % len(CHART_COLORS)]
        pct = int(y.get("toplam") or 0) / max_val * 100
        bars += (
            f'<div class="bar-row">'
            f'<div class="bar-label">{_esc(y.get("yontem"))}</div>'
            f'<div class="bar-track"><div class="bar-fill" style="width:{pct:.1f}%;background:{color}"></div></div>'
            f'<div class="bar-value">{_fmt_tl(y.get("toplam"))} <span class="bar-pct">(%{y.get("oran", 0)})</span></div>'
            f"</div>"
        )
        legend += (
            f'<div class="legend-item">'
            f'<span class="legend-dot" style="background:{color}"></span>'
            f'<span>{_esc(y.get("yontem"))}</span>'
            f'<span class="legend-amt">{_fmt_tl(y.get("toplam"))}</span>'
            f"</div>"
        )

    return (
        f'<div class="chart-grid">'
        f'<div class="bar-chart">{bars}</div>'
        f'<div class="legend-col">{legend}</div>'
        f"</div>"
    )


def _stat_boxes(mode: str, ozet: dict) -> str:
    if mode == "beklenen":
        items = [
            ("Toplam Beklenen", _fmt_tl(ozet.get("toplam_tutar"))),
            ("Toplam Alınan", _fmt_tl(ozet.get("toplam_alinan"))),
            ("Toplam Kalan", _fmt_tl(ozet.get("toplam_kalan"))),
            ("Kayıt Sayısı", _format_cell(ozet.get("toplam_adet"))),
        ]
        if ozet.get("tahsil_orani") is not None:
            items.append(("Tahsil Oranı", f"%{ozet.get('tahsil_orani')}"))
    else:
        items = [
            ("Toplam Alınan", _fmt_tl(ozet.get("toplam_tutar"))),
            ("Kayıt Sayısı", _format_cell(ozet.get("toplam_adet"))),
        ]
        if ozet.get("beklenen_tutar"):
            items.append(("Dönem Beklenen", _fmt_tl(ozet.get("beklenen_tutar"))))
        if ozet.get("tahsil_orani") is not None:
            items.append(("Tahsil Oranı", f"%{ozet.get('tahsil_orani')}"))

    blocks = "".join(
        f'<div class="stat-box"><div class="stat-label">{lbl}</div><div class="stat-value">{val}</div></div>'
        for lbl, val in items
    )
    return f'<div class="stat-grid">{blocks}</div>'


def _kaynak_table(kaynak_kirilimi: list[dict]) -> str:
    if not kaynak_kirilimi:
        return ""
    rows = ""
    for k in kaynak_kirilimi:
        rows += (
            f"<tr>"
            f"<td>{_esc(k.get('kaynak_label'))}</td>"
            f'<td class="num">{_fmt_tl(k.get("toplam"))}</td>'
            f'<td class="num">{_format_cell(k.get("adet"))}</td>'
            f'<td class="num">%{k.get("oran", 0)}</td>'
            f"</tr>"
        )
    return (
        '<div class="section-title">Kaynak Kırılımı</div>'
        '<table class="data-table"><thead><tr>'
        "<th>Kaynak</th><th>Toplam</th><th>Adet</th><th>Oran</th>"
        f"</tr></thead><tbody>{rows}</tbody></table>"
    )


def _detail_table(mode: str, rows: list[dict]) -> str:
    if not rows:
        return '<p class="empty-note">Detay kaydı bulunamadı.</p>'

    if mode == "beklenen":
        thead = (
            "<tr><th>Kişi</th><th>Vade</th><th>Kaynak</th>"
            "<th>Toplam</th><th>Alınan</th><th>Kalan</th>"
            "<th>Ödeme Yöntemi</th><th>Durum</th></tr>"
        )
        tbody = ""
        for r in rows:
            tbody += (
                f"<tr>"
                f"<td>{_esc(r.get('kisi_adi'))}</td>"
                f"<td>{_fmt_tr_date(r.get('vade_tarihi') or r.get('tarih'))}</td>"
                f"<td>{_esc(r.get('kaynak_label'))}</td>"
                f'<td class="num">{_fmt_tl(r.get("toplam_tutar"))}</td>'
                f'<td class="num">{_fmt_tl(r.get("odenen_tutar"))}</td>'
                f'<td class="num">{_fmt_tl(r.get("kalan_tutar"))}</td>'
                f"<td>{_esc(r.get('odeme_yontemi') or '—')}</td>"
                f"<td>{_esc(r.get('tahsil_durumu_label'))}</td>"
                f"</tr>"
            )
    else:
        thead = (
            "<tr><th>Kişi</th><th>Tarih</th><th>Kaynak</th>"
            "<th>Tutar</th><th>Ödeme Yöntemi</th><th>Durum</th><th>Açıklama</th></tr>"
        )
        tbody = ""
        for r in rows:
            tbody += (
                f"<tr>"
                f"<td>{_esc(r.get('kisi_adi'))}</td>"
                f"<td>{_fmt_tr_date(r.get('tarih'))}</td>"
                f"<td>{_esc(r.get('kaynak_label'))}</td>"
                f'<td class="num">{_fmt_tl(r.get("tutar"))}</td>'
                f"<td>{_esc(r.get('odeme_yontemi') or r.get('odeme_yontemi_tipi') or '—')}</td>"
                f"<td>{_esc(r.get('tahsil_durumu_label') or 'Alındı')}</td>"
                f"<td>{_esc(r.get('aciklama'))}</td>"
                f"</tr>"
            )

    return (
        f'<div class="section-title">Detay Listesi ({len(rows)} kayıt)</div>'
        f'<table class="data-table"><thead>{thead}</thead><tbody>{tbody}</tbody></table>'
    )


def build_period_report_html(
    *,
    mode: str,
    baslangic: str,
    bitis: str,
    ozet: dict,
    rows: list[dict],
    filters_meta: dict[str, Any] | None = None,
    kurum_ad: str | None = None,
    orientation: str = "landscape",
) -> str:
    meta = filters_meta or {}
    sube_ad = meta.get("sube_ad") or meta.get("sube")
    brand = _brand_display(kurum_ad, sube_ad)
    logo = _resolve_logo(meta)
    logo_html = (
        f'<img src="{logo}" alt="Logo" class="logo-img" />'
        if logo
        else f'<div class="logo-fallback">{_logo_fallback_text(kurum_ad)}</div>'
    )

    mode_label = "Alınan Ödemeler" if mode == "alinan" else "Beklenen Ödemeler"
    title = f"Dönem Tahsilat — {mode_label}"
    generated = timezone.localtime(timezone.now()).strftime("%d.%m.%Y %H:%M")
    rapor_olusturan = meta.get("raporu_olusturan") or ""

    yontem_html = _yontem_chart(ozet.get("yontem_dagilimi") or [])
    stats_html = _stat_boxes(mode, ozet)
    kaynak_html = _kaynak_table(ozet.get("kaynak_kirilimi") or [])
    detail_html = _detail_table(mode, rows)

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>{_esc(title)}</title>
<style>
  @page {{ margin: 14mm 12mm 18mm 12mm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 10px;
    color: #1e293b;
    line-height: 1.45;
  }}
  .header {{
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid {BRAND_PRIMARY};
    padding-bottom: 10px;
    margin-bottom: 14px;
  }}
  .header-left {{ display: flex; gap: 12px; align-items: center; }}
  .logo-img {{ height: 40px; width: auto; }}
  .logo-fallback {{
    width: 40px; height: 40px; border-radius: 8px;
    background: {BRAND_PRIMARY}; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; font-size: 14px;
  }}
  .brand-name {{ font-size: 13px; font-weight: 700; color: {BRAND_PRIMARY}; }}
  .report-title {{ font-size: 16px; font-weight: 800; margin-top: 2px; }}
  .meta {{ font-size: 9px; color: #64748b; margin-top: 4px; }}
  .header-right {{ text-align: right; font-size: 9px; color: #64748b; }}
  .stat-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px;
    margin-bottom: 14px;
  }}
  .stat-box {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
  }}
  .stat-label {{ font-size: 8px; text-transform: uppercase; color: #64748b; letter-spacing: 0.04em; }}
  .stat-value {{ font-size: 14px; font-weight: 800; color: {BRAND_PRIMARY}; margin-top: 2px; }}
  .section-title {{
    font-size: 11px;
    font-weight: 700;
    color: {BRAND_PRIMARY};
    margin: 14px 0 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
  }}
  .chart-grid {{ display: flex; gap: 16px; margin-bottom: 8px; }}
  .bar-chart {{ flex: 1; }}
  .bar-row {{ display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }}
  .bar-label {{ width: 90px; font-size: 9px; text-align: right; flex-shrink: 0; }}
  .bar-track {{ flex: 1; height: 14px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }}
  .bar-fill {{ height: 100%; border-radius: 4px; min-width: 2px; }}
  .bar-value {{ width: 110px; font-size: 9px; font-weight: 600; flex-shrink: 0; }}
  .bar-pct {{ color: #64748b; font-weight: 400; }}
  .legend-col {{ width: 180px; flex-shrink: 0; }}
  .legend-item {{ display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 9px; }}
  .legend-dot {{ width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }}
  .legend-amt {{ margin-left: auto; font-weight: 600; }}
  .data-table {{ width: 100%; border-collapse: collapse; font-size: 9px; }}
  .data-table th {{
    background: {BRAND_PRIMARY}; color: #fff;
    padding: 6px 8px; text-align: left; font-weight: 600;
  }}
  .data-table td {{ padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }}
  .data-table tr:nth-child(even) td {{ background: #f8fafc; }}
  .num {{ text-align: right; white-space: nowrap; }}
  .empty-note {{ color: #94a3b8; font-style: italic; padding: 8px 0; }}
  .footer-note {{
    margin-top: 16px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    font-size: 8px;
    color: #94a3b8;
    text-align: center;
  }}
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      {logo_html}
      <div>
        <div class="brand-name">{_esc(brand)}</div>
        <div class="report-title">{_esc(title)}</div>
        <div class="meta">
          Tarih Aralığı: {_fmt_tr_date(baslangic)} — {_fmt_tr_date(bitis)}
          {f' · Kaynak: {_esc(meta.get("kaynak_label") or meta.get("kaynak") or "Tümü")}' if meta.get("kaynak") else ''}
        </div>
      </div>
    </div>
    <div class="header-right">
      <div>Oluşturulma: {generated}</div>
      {f'<div>Raporu Oluşturan: {_esc(rapor_olusturan)}</div>' if rapor_olusturan else ''}
    </div>
  </div>

  {stats_html}

  <div class="section-title">Yöntem Dağılımı</div>
  {yontem_html}

  {kaynak_html}

  {detail_html}

  <div class="footer-note">3K Kampüs LMS · Finans Modülü · Dönem Tahsilat Raporu</div>
</body>
</html>"""
