"""
Gün Sonu Özet Raporu — markalı HTML şablonu (PDF).
"""
from __future__ import annotations

import html
from typing import Any

from apps.finans.application.export.report_html_template import (
    BRAND_ACCENT, BRAND_PRIMARY, _brand_display, _logo_data_uri, _resolve_logo, _logo_fallback_text,
)


def _esc(value: Any) -> str:
    if value is None or value == '':
        return '—'
    return html.escape(str(value))


def _fmt_tl(amount: int | float) -> str:
    return f'₺{int(amount):,}'.replace(',', '.')


def _section_table(title: str, headers: list[str], rows: list[list[str]], *, total_row: list[str] | None = None) -> str:
    thead = ''.join(f'<th>{_esc(h)}</th>' for h in headers)
    body_rows = []
    for row in rows:
        tds = ''.join(f'<td class="{ "num" if i > 0 else "" }">{cell}</td>' for i, cell in enumerate(row))
        body_rows.append(f'<tr>{tds}</tr>')
    if total_row:
        tds = ''.join(
            f'<td class="{"num total" if i > 0 else "total-label"}">{cell}</td>'
            for i, cell in enumerate(total_row)
        )
        body_rows.append(f'<tr class="total-row">{tds}</tr>')
    tbody = '\n'.join(body_rows) or '<tr><td colspan="{0}" class="empty">Kayıt yok</td></tr>'.format(len(headers))
    return f"""
    <section class="report-section">
      <h2 class="section-title">{_esc(title)}</h2>
      <table class="data-table">
        <thead><tr>{thead}</tr></thead>
        <tbody>{tbody}</tbody>
      </table>
    </section>
    """


def build_gun_sonu_ozet_html(report: dict, *, orientation: str = 'portrait') -> str:
    ozet = report.get('ozet_rapor') or {}
    meta = ozet.get('meta') or {}
    gunluk = ozet.get('gunluk_ozet') or {}
    dagilim = ozet.get('tahsilat_dagilimi') or []
    islem = ozet.get('islem_sayilari') or {}
    kullanicilar = ozet.get('kullanici_ozeti') or []
    notlar = (ozet.get('notlar') or '').strip()

    logo = _resolve_logo(meta)
    kurum_ad = meta.get('kurum_ad') or meta.get('marka') or ''
    sube_ad = meta.get('sube') or ''
    brand_line = _brand_display(kurum_ad, sube_ad if sube_ad != 'Tüm Şubeler' else None)
    logo_alt = _esc(kurum_ad or 'Kurum logosu')
    logo_fallback = _esc(_logo_fallback_text(kurum_ad))
    logo_html = (
        f'<img src="{logo}" alt="{logo_alt}" class="logo" />'
        if logo
        else f'<div class="logo-fallback">{logo_fallback}</div>'
    )

    meta_items = [
        ('Tarih', meta.get('tarih', '')),
        ('Şube', meta.get('sube', '')),
        ('Hazırlayan', meta.get('hazirlayan', '')),
        ('Oluşturulma', meta.get('olusturulma', '')),
    ]
    meta_grid = ''.join(
        f'<div class="meta-item"><span class="meta-label">{_esc(k)}</span>'
        f'<span class="meta-value">{_esc(v)}</span></div>'
        for k, v in meta_items
    )

    ozet_rows = [
        ['Toplam Tahsilat', _fmt_tl(gunluk.get('toplam_tahsilat', 0))],
        ['Toplam İade', _fmt_tl(gunluk.get('toplam_iade', 0))],
        ['Toplam Gelir', _fmt_tl(gunluk.get('toplam_gelir', 0))],
        ['Toplam Gider', _fmt_tl(gunluk.get('toplam_gider', 0))],
        ['Net Nakit Girişi', _fmt_tl(gunluk.get('net_nakit_girisi', 0))],
    ]
    section_a = _section_table('A. Günlük Özet', ['Bilgi', 'Tutar'], ozet_rows)

    dagilim_body = []
    total_row = None
    for row in dagilim:
        if row.get('tip') == 'toplam':
            total_row = ['Toplam', _fmt_tl(row.get('tutar', 0))]
        else:
            dagilim_body.append([_esc(row.get('label')), _fmt_tl(row.get('tutar', 0))])
    section_b = _section_table('B. Tahsilat Dağılımı', ['Ödeme Türü', 'Tutar'], dagilim_body, total_row=total_row)

    islem_rows = [
        ['Tahsilat', _esc(islem.get('tahsilat', 0))],
        ['Gelir Kaydı', _esc(islem.get('gelir_kaydi', 0))],
        ['Gider Kaydı', _esc(islem.get('gider_kaydi', 0))],
        ['İade', _esc(islem.get('iade', 0))],
        ['İptal', _esc(islem.get('iptal', 0))],
    ]
    section_c = _section_table('C. İşlem Sayıları', ['İşlem', 'Adet'], islem_rows)

    kullanici_rows = [
        [_esc(k['personel']), _fmt_tl(k.get('tahsilat', 0)), _fmt_tl(k.get('gelir', 0)), _fmt_tl(k.get('gider', 0))]
        for k in kullanicilar
    ]
    section_d = _section_table(
        'Kullanıcı Bazlı İşlem Özeti',
        ['Personel', 'Tahsilat', 'Gelir', 'Gider'],
        kullanici_rows,
    )

    notlar_html = f"""
    <section class="report-section">
      <h2 class="section-title">G. Notlar</h2>
      <div class="notes-box">{_esc(notlar) if notlar else '<span class="muted">—</span>'}</div>
    </section>
    """

    kurum_line = f'<div class="kurum-name">{_esc(kurum_ad)}</div>' if kurum_ad and sube_ad == 'Tüm Şubeler' else ''

    page_size = 'A4 landscape' if orientation == 'landscape' else 'A4 portrait'

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Gün Sonu Finans Raporu</title>
  <style>
    @page {{ margin: {"10mm 8mm" if orientation == "landscape" else "14mm 12mm"}; size: {page_size}; }}
    * {{ box-sizing: border-box; }}
    html, body {{
      height: auto;
      min-height: 0;
      overflow: visible;
    }}
    body {{
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b; margin: 0; padding: 0;
      font-size: 11px; line-height: 1.45; background: #fff;
    }}
    .page {{ max-width: 100%; }}
    .header {{
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; padding-bottom: 14px;
      border-bottom: 3px solid {BRAND_PRIMARY}; margin-bottom: 16px;
    }}
    .header-left {{ display: flex; align-items: center; gap: 12px; }}
    .logo {{ width: 48px; height: 48px; object-fit: contain; }}
    .logo-fallback {{
      width: 48px; height: 48px; border-radius: 12px;
      background: {BRAND_PRIMARY}; color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px;
    }}
    .brand-title {{
      font-size: 11px; color: #64748b; font-weight: 600;
      letter-spacing: 0.04em; text-transform: uppercase;
    }}
    .report-title {{
      font-size: 22px; font-weight: 800; color: {BRAND_PRIMARY}; margin: 2px 0 0;
    }}
    .kurum-name {{ font-size: 12px; color: #475569; margin-top: 2px; }}
    .header-right {{ text-align: right; font-size: 10px; color: #94a3b8; }}
    .meta-grid {{
      display: flex; flex-wrap: wrap; gap: 8px 20px;
      background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
      border: 1px solid #e2e8f0; border-radius: 12px;
      padding: 12px 14px; margin-bottom: 18px;
    }}
    .meta-item {{ min-width: 130px; }}
    .meta-label {{
      display: block; font-size: 9px; font-weight: 700; color: #94a3b8;
      text-transform: uppercase; letter-spacing: 0.05em;
    }}
    .meta-value {{ font-size: 11px; font-weight: 600; color: #334155; }}
    .report-section {{ margin-bottom: 18px; page-break-inside: avoid; }}
    .section-title {{
      font-size: 12px; font-weight: 800; color: {BRAND_PRIMARY};
      margin: 0 0 8px; padding-left: 10px;
      border-left: 4px solid {BRAND_ACCENT};
    }}
    table.data-table {{
      width: 100%; border-collapse: collapse; font-size: 10px;
      border-radius: 10px; overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }}
    table.data-table thead th {{
      background: {BRAND_PRIMARY}; color: #fff;
      padding: 8px 10px; text-align: left; font-weight: 700;
      font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em;
    }}
    table.data-table tbody td {{
      padding: 7px 10px; border-bottom: 1px solid #e2e8f0;
    }}
    table.data-table tbody tr:nth-child(even) {{ background: #f8fafc; }}
    table.data-table td.num {{ text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }}
    table.data-table tr.total-row {{ background: #eff6ff !important; }}
    table.data-table td.total-label {{ font-weight: 800; color: {BRAND_PRIMARY}; }}
    table.data-table td.total {{ font-weight: 800; color: {BRAND_PRIMARY}; text-align: right; }}
    table.data-table td.empty {{ text-align: center; color: #94a3b8; padding: 16px; }}
    .notes-box {{
      border: 1px dashed #cbd5e1; border-radius: 10px;
      padding: 12px 14px; min-height: 48px; background: #fafafa;
      white-space: pre-wrap;
    }}
    .muted {{ color: #94a3b8; }}
    .footer {{
      margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0;
      display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8;
    }}
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="header-left">
        {logo_html}
        <div>
          <div class="brand-title">{_esc(brand_line or kurum_ad)}</div>
          <h1 class="report-title">{_esc(meta.get('baslik', 'GÜN SONU FİNANS RAPORU'))}</h1>
          {kurum_line}
        </div>
      </div>
      <div class="header-right">Finans Modülü</div>
    </header>

    <div class="meta-grid">{meta_grid}</div>

    {section_a}
    {section_b}
    {section_c}
    {section_d}
    {notlar_html}

    <footer class="footer">
      <span>{_esc(brand_line or kurum_ad)} — {_esc(meta.get('baslik', 'Gün Sonu Özet Raporu'))}</span>
      <span>{_esc(meta.get('olusturulma', ''))}</span>
    </footer>
  </div>
</body>
</html>"""
