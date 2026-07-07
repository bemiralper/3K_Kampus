"""
Gün Sonu Detay Raporu — PDF HTML şablonu (kapak + 12 bölüm).
"""
from __future__ import annotations

import html
from typing import Any

from apps.finans.application.export.report_html_template import (
    BRAND_PRIMARY, _brand_display, _logo_data_uri, _logo_fallback_text,
)


def _esc(value: Any) -> str:
    if value is None or value == '':
        return '—'
    return html.escape(str(value))


def _fmt_tl(amount: int | float | None) -> str:
    if amount is None:
        return '—'
    return f'₺{int(amount):,}'.replace(',', '.')


def _table(headers: list[str], rows: list[list[str]], *, right_cols: set[int] | None = None) -> str:
    right_cols = right_cols or set()
    thead = ''.join(f'<th>{_esc(h)}</th>' for h in headers)
    tbody = ''
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            cls = ' class="num"' if i in right_cols else ''
            cells.append(f'<td{cls}>{cell if isinstance(cell, str) and cell.startswith("<") else _esc(cell)}</td>')
        tbody += f'<tr>{"".join(cells)}</tr>'
    if not tbody:
        tbody = f'<tr><td colspan="{len(headers)}">Kayıt yok</td></tr>'
    return f'<table><thead><tr>{thead}</tr></thead><tbody>{tbody}</tbody></table>'


def build_gun_sonu_detay_html(report: dict, *, orientation: str = 'landscape') -> str:
    detay = report.get('detay_rapor') or {}
    meta = detay.get('meta') or {}
    kapak = detay.get('kapak') or {}
    ozet = detay.get('ozet') or {}
    page_size = 'A4 landscape' if orientation == 'landscape' else 'A4 portrait'
    logo = _logo_data_uri()
    kurum_ad = meta.get('kurum_ad') or kapak.get('kurum_ad') or ''
    sube_ad = kapak.get('sube') or meta.get('sube') or ''
    brand_line = _brand_display(kurum_ad, sube_ad if sube_ad != 'Tüm Şubeler' else None)
    logo_alt = _esc(kurum_ad or 'Kurum logosu')
    logo_fallback = _esc(_logo_fallback_text(kurum_ad))
    logo_html = (
        f'<img src="{logo}" alt="{logo_alt}" class="logo" />'
        if logo else f'<div class="logo-fallback">{logo_fallback}</div>'
    )

    # ── Yönetici özeti ──
    yo = detay.get('yonetici_ozeti') or {}
    uyarilar = detay.get('uyarilar') or []
    uyari_html = ''.join(
        f'<p class="alert alert-{_esc(u.get("seviye", "bilgi"))}">{_esc(u.get("mesaj", ""))}</p>'
        for u in uyarilar
    ) if uyarilar else ''
    yo_cards = ''
    if yo:
        yo_items = [
            ('Yeni Öğrenci', yo.get('yeni_ogrenci', 0)),
            ('Yeni Sözleşme', yo.get('yeni_sozlesme', 0)),
            ('Tahsilat', _fmt_tl(yo.get('tahsilat'))),
            ('Gelir', _fmt_tl(yo.get('gelir'))),
            ('Gider', _fmt_tl(yo.get('gider'))),
            ('İade', _fmt_tl(yo.get('iade'))),
            ('İptal', yo.get('iptal', 0)),
            ('Bekleyen Tahsilat', _fmt_tl(yo.get('bekleyen_tahsilatlar'))),
        ]
        yo_cards = '<div class="summary-row">' + ''.join(
            f'<div class="chip"><span>{_esc(l)}</span><strong>{_esc(str(v))}</strong></div>'
            for l, v in yo_items
        ) + '</div>'

    tahsilat_rows = [
        [r['saat'], r.get('sozlesme_no', ''), r['makbuz'], r['ogrenci'], r['veli'],
         r.get('taksit_no', ''), r.get('odeme_donemi', ''), r['odeme_turu'], _fmt_tl(r['tutar']), r['personel'], r.get('aciklama', '')]
        for r in detay.get('tahsilat_listesi') or []
    ]
    sec1 = _section('1. Tahsilat Listesi', _table(
        ['Saat', 'Sözleşme', 'Makbuz', 'Öğrenci', 'Veli', 'Taksit', 'Dönem', 'Ödeme', 'Tutar', 'Personel', 'Açıklama'],
        tahsilat_rows, right_cols={8},
    ))

    gelir_rows = [
        [r['saat'], r['gelir_kodu'], r['kategori'], r.get('kasa', ''), r.get('odeme_turu', ''), r.get('belge_no', ''), r['aciklama'], _fmt_tl(r['tutar']), r['personel']]
        for r in detay.get('gelir_hareketleri') or []
    ]
    sec2 = _section('2. Gelir Hareketleri', _table(
        ['Saat', 'Kod', 'Kategori', 'Kasa', 'Ödeme', 'Belge', 'Açıklama', 'Tutar', 'Personel'],
        gelir_rows, right_cols={7},
    ))

    gider_rows = [
        [r['saat'], r['gider_kodu'], r['kategori'], r.get('cari', ''), r.get('odeme_turu', ''), r.get('kasa', ''), r['aciklama'], r.get('onaylayan', ''), _fmt_tl(r['tutar']), r['personel']]
        for r in detay.get('gider_hareketleri') or []
    ]
    sec3 = _section('3. Gider Hareketleri', _table(
        ['Saat', 'Kod', 'Kategori', 'Cari', 'Ödeme', 'Kasa', 'Açıklama', 'Onaylayan', 'Tutar', 'Personel'],
        gider_rows, right_cols={8},
    ))

    cari_rows = [
        [r['cari'], _fmt_tl(r['borc']), _fmt_tl(r['alacak']), _fmt_tl(r['bakiye'])]
        for r in detay.get('cari_hareketleri') or []
    ]
    sec4 = _section('4. Cari Hareketleri (Bugün)', _table(
        ['Cari', 'Borç', 'Alacak', 'Gün Sonu Bakiyesi'], cari_rows, right_cols={1, 2, 3},
    ))

    iptal_rows = [
        [r['saat'], r['islem_no'], r['tur'], r['sebep'], r['kullanici']]
        for r in detay.get('iptal_islemleri') or []
    ]
    sec5 = _section('5. İptal Edilen İşlemler', _table(
        ['Saat', 'İşlem No', 'Tür', 'Sebep', 'Kullanıcı'], iptal_rows,
    ))

    iade_rows = [
        [r['saat'], r['ogrenci'], _fmt_tl(r['tutar']), r['aciklama']]
        for r in detay.get('iade_islemleri') or []
    ]
    sec6 = _section('6. İade İşlemleri', _table(
        ['Saat', 'Öğrenci', 'Tutar', 'Açıklama'], iade_rows, right_cols={2},
    ))

    odeme = detay.get('odeme_turu_dagilimi') or {}
    odeme_ozet = [
        [r['label'], str(r.get('adet') or '—'), _fmt_tl(r['tutar'])]
        for r in odeme.get('ozet') or []
    ]
    odeme_detay = [
        [r['kaynak'], r['saat'], r['odeme_turu'], _fmt_tl(r['tutar']), r['aciklama']]
        for r in odeme.get('detay') or []
    ]
    sec7 = _section(
        '7. Ödeme Türü Dağılımı',
        _table(['Ödeme Türü', 'Adet', 'Tutar'], odeme_ozet, right_cols={2})
        + '<h4 class="sub">İşlem Detayı</h4>'
        + _table(['Kaynak', 'Saat', 'Ödeme Türü', 'Tutar', 'Açıklama'], odeme_detay, right_cols={3}),
    )

    kg_rows = [[r['kategori'], _fmt_tl(r['tutar'])] for r in detay.get('kategori_gelirler') or []]
    sec8 = _section('8. Kategori Bazlı Gelirler', _table(['Kategori', 'Tutar'], kg_rows, right_cols={1}))

    gd_rows = [[r['kategori'], _fmt_tl(r['tutar'])] for r in detay.get('kategori_giderler') or []]
    sec9 = _section('9. Kategori Bazlı Giderler', _table(['Kategori', 'Tutar'], gd_rows, right_cols={1}))

    kullanici_html = ''
    for block in detay.get('kullanici_islem_detayi') or []:
        urows = [
            [i['saat'], i['tur'], i['aciklama'], _fmt_tl(i['tutar'])]
            for i in block.get('islemler') or []
        ]
        kullanici_html += (
            f'<h4 class="sub">{_esc(block["personel"])} '
            f'({_esc(block.get("adet", 0))} işlem — {_fmt_tl(block.get("toplam", 0))})</h4>'
            + _table(['Saat', 'Tür', 'Açıklama', 'Tutar'], urows, right_cols={3})
        )
    sec10 = _section('10. Kullanıcı Bazlı İşlem Detayı', kullanici_html or '<p class="muted">Kayıt yok</p>')

    kasa = detay.get('kasa_ozeti') or {}
    kasa_rows = [
        ['Açılış Kasası', _fmt_tl(kasa.get('acilis_kasa'))],
        ['Nakit Tahsilatlar', _fmt_tl(kasa.get('nakit_tahsilatlar'))],
        ['Nakit Gelirler', _fmt_tl(kasa.get('nakit_gelirler'))],
        ['Nakit Giderler', _fmt_tl(kasa.get('nakit_giderler'))],
        ['Kasaya Para Girişi', _fmt_tl(kasa.get('kasaya_para_girisi'))],
        ['Kasadan Para Çıkışı', _fmt_tl(kasa.get('kasadan_para_cikisi'))],
        ['Bankaya Aktarım', _fmt_tl(kasa.get('bankaya_aktarim'))],
        ['Bankadan Kasaya Aktarım', _fmt_tl(kasa.get('bankadan_kasaya_aktarim'))],
        ['Beklenen Kasa', _fmt_tl(kasa.get('beklenen_kasa'))],
        ['Sayılan Kasa', '—' if kasa.get('sayilan_kasa') is None else _fmt_tl(kasa['sayilan_kasa'])],
        ['Kasa Farkı', _fmt_tl(kasa.get('kasa_farki'))],
    ]
    kasa_note = ''
    if kasa.get('kasa_farki') and kasa.get('sayim_yapildi'):
        kasa_note = f'<p class="alert alert-kritik">Kasa farkı: {_fmt_tl(kasa.get("kasa_farki"))}</p>'
    sec11 = _section(
        '11. Kasa Özeti',
        kasa_note + _table(['Kalem', 'Tutar'], kasa_rows, right_cols={1})
        + (f'<p class="note">{_esc(kasa.get("not", ""))}</p>' if kasa.get('not') else ''),
    )

    sistem = detay.get('sistem') or {}
    sys_rows = [
        ['Oluşturma Tarihi', sistem.get('olusturma_tarihi', '')],
        ['Raporu Oluşturan', sistem.get('raporu_olusturan', '')],
        ['Şube', sistem.get('sube', '')],
        ['Tarih', sistem.get('tarih', '')],
    ]
    sec12 = _section('12. Rapor Bilgileri', _table(['Alan', 'Değer'], sys_rows))

    ozet_cards = f"""
    <div class="summary-row">
      <div class="chip"><span>Toplam Tahsilat</span><strong>{_fmt_tl(ozet.get('toplam_tahsilat'))}</strong></div>
      <div class="chip"><span>Toplam Gelir</span><strong>{_fmt_tl(ozet.get('toplam_gelir'))}</strong></div>
      <div class="chip"><span>Toplam Gider</span><strong>{_fmt_tl(ozet.get('toplam_gider'))}</strong></div>
      <div class="chip"><span>Net Nakit (Kasa)</span><strong>{_fmt_tl(ozet.get('net_nakit_girisi'))}</strong></div>
    </div>
    {uyari_html}
    {yo_cards}
    """

    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>{_esc(meta.get('baslik', 'Gün Sonu Detay'))}</title>
  <style>
    @page {{ size: {page_size}; margin: 10mm 8mm; }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #1e293b; font-size: 9px; line-height: 1.4; margin: 0;
    }}
    .cover {{
      min-height: 90vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; text-align: center;
      page-break-after: always; border-bottom: 4px solid {BRAND_PRIMARY};
      padding: 40px 20px;
    }}
    .cover .logo {{ width: 72px; height: 72px; object-fit: contain; margin-bottom: 16px; }}
    .cover .logo-fallback {{
      width: 72px; height: 72px; border-radius: 16px; background: {BRAND_PRIMARY};
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 24px; margin: 0 auto 16px;
    }}
    .cover h1 {{ font-size: 28px; color: {BRAND_PRIMARY}; margin: 8px 0; letter-spacing: 0.02em; }}
    .cover .kurum {{ font-size: 16px; color: #475569; margin-top: 8px; }}
    .cover .meta-line {{ font-size: 12px; color: #64748b; margin-top: 4px; }}
    .page-header {{
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 2px solid {BRAND_PRIMARY}; padding-bottom: 8px; margin-bottom: 12px;
    }}
    .page-header h2 {{ font-size: 11px; color: {BRAND_PRIMARY}; margin: 0; }}
    .section {{ page-break-inside: avoid; margin-bottom: 18px; }}
    .section-title {{
      font-size: 11px; font-weight: 800; color: {BRAND_PRIMARY};
      border-left: 4px solid {BRAND_PRIMARY}; padding-left: 8px; margin: 0 0 8px;
    }}
    h4.sub {{ font-size: 9px; color: #475569; margin: 10px 0 4px; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 8px; }}
    thead th {{
      background: {BRAND_PRIMARY}; color: #fff; padding: 5px 6px;
      text-align: left; font-size: 7px; text-transform: uppercase;
    }}
    tbody td {{ padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }}
    tbody tr:nth-child(even) {{ background: #f8fafc; }}
    td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .summary-row {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }}
    .chip {{
      flex: 1; min-width: 100px; background: #eff6ff; border: 1px solid #bfdbfe;
      border-radius: 8px; padding: 8px 10px;
    }}
    .chip span {{ display: block; font-size: 7px; color: #64748b; text-transform: uppercase; }}
    .chip strong {{ font-size: 12px; color: {BRAND_PRIMARY}; }}
    .note, .muted {{ font-size: 8px; color: #64748b; font-style: italic; }}
    .alert {{ font-size: 8px; padding: 6px 8px; border-radius: 6px; margin-bottom: 6px; }}
    .alert-kritik {{ background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }}
    .alert-uyari {{ background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }}
    .alert-bilgi {{ background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }}
    .footer {{
      margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0;
      font-size: 7px; color: #94a3b8; display: flex; justify-content: space-between;
    }}
  </style>
</head>
<body>
  <div class="cover">
    {logo_html}
    <div style="font-size:10px;color:#64748b;font-weight:600;">{_esc(brand_line or kurum_ad)}</div>
    <h1>{_esc(kapak.get('baslik', 'GÜN SONU DETAY RAPORU'))}</h1>
    <div class="kurum">{_esc(kapak.get('kurum_ad', ''))}</div>
    <div class="meta-line">Şube: {_esc(kapak.get('sube', ''))}</div>
    <div class="meta-line">Tarih: {_esc(kapak.get('tarih', ''))}</div>
    <div class="meta-line">Hazırlayan: {_esc(kapak.get('hazirlayan', ''))}</div>
    <div class="meta-line" style="margin-top:16px;">Oluşturulma: {_esc(meta.get('olusturulma', ''))}</div>
  </div>

  <div class="page-header">
    <div>{logo_html if not logo else ''}<strong>{_esc(meta.get('kurum_ad', ''))}</strong></div>
    <h2>Gün Sonu Detay — {_esc(meta.get('tarih', ''))}</h2>
  </div>

  {ozet_cards}
  {sec1}{sec2}{sec3}{sec4}{sec5}{sec6}{sec7}{sec8}{sec9}{sec10}{sec11}{sec12}

  <div class="footer">
    <span>{_esc(brand_line or kurum_ad)}</span>
    <span>{_esc(meta.get('olusturulma', ''))}</span>
  </div>
</body>
</html>"""


def _section(title: str, content: str) -> str:
    return f'<section class="section"><h3 class="section-title">{_esc(title)}</h3>{content}</section>'
