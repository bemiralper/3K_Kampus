"""Personel sözleşme belgesi — sunucu tarafı HTML (Playwright).

Kompakt belge düzeni: kart/chip yerine ince satırlar ve tablolar.
"""
from __future__ import annotations

import html
from datetime import datetime
from typing import Any

from apps.personel.application.contract_calc_service import format_calisma_suresi_ay, sozlesme_belge_basligi
from apps.finans.application.export.report_html_template import resolve_login_banner_logo

INK = '#0f172a'
MUTED = '#64748b'
LINE = '#e2e8f0'
ACCENT = '#1e3a5f'
GUN_ADLARI = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']


def _esc(value: Any) -> str:
    if value is None or value == '':
        return '—'
    return html.escape(str(value))


def _fmt_tl(amount: float | int) -> str:
    try:
        n = float(amount)
    except (TypeError, ValueError):
        return '₺0'
    return f'₺{n:,.0f}'.replace(',', '.')


def _fmt_tl_dec(amount: float | int) -> str:
    try:
        n = float(amount)
    except (TypeError, ValueError):
        return '₺0,00'
    whole = int(n)
    frac = int(round((n - whole) * 100))
    return f'₺{whole:,}'.replace(',', '.') + f',{frac:02d}'


def _fmt_tarih(value: str | None) -> str:
    if not value:
        return '—'
    try:
        return datetime.fromisoformat(value[:10]).strftime('%d.%m.%Y')
    except ValueError:
        return _esc(value)


def _kv_rows(rows: list[tuple[str, Any]]) -> str:
    return ''.join(
        f'<tr><th>{_esc(label)}</th><td>{value}</td></tr>'
        for label, value in rows
    )


def _contract_net_maas(data: dict) -> float:
    net = data.get('net_maas')
    if net:
        return float(net)
    plan = data.get('maas_plani') or []
    if plan and plan[0].get('maas'):
        return float(plan[0]['maas'])
    return float(data.get('brut_maas') or 0)


def build_personel_sozlesme_html(data: dict) -> str:
    kurum = data.get('kurum') or {}
    kurum_ad = _esc(kurum.get('ad') or data.get('sube_ad') or 'Kurum')
    tur = _esc(data.get('sozlesme_turu_display') or data.get('sozlesme_turu'))
    belge_basligi = _esc(
        data.get('belge_basligi')
        or sozlesme_belge_basligi(
            gorev_snapshot=data.get('gorev_snapshot') or '',
            brans_snapshot=data.get('brans_snapshot') or '',
            rol_kodu=data.get('rol_kodu') or '',
            rol_ad=data.get('rol_ad') or '',
        )
    )
    logo = resolve_login_banner_logo(
        data.get('kurum_id'),
        data.get('sube_id'),
        login_logo_url=data.get('login_logo_url'),
    )
    logo_html = (
        f'<img src="{logo}" alt="" class="logo" />'
        if logo
        else '<div class="logo-mark">3K</div>'
    )

    maas_rows = ''
    for row in data.get('maas_plani') or []:
        maas_rows += (
            f'<tr>'
            f'<td>{row.get("sira_no")}</td>'
            f'<td>{_fmt_tarih(row.get("baslangic_tarihi"))}</td>'
            f'<td>{_fmt_tarih(row.get("bitis_tarihi"))}</td>'
            f'<td class="c">{row.get("calisilan_gun", "—")}</td>'
            f'<td class="n">{_fmt_tl(row.get("maas", 0))}</td>'
            f'<td class="m">{_esc(row.get("aciklama") or "—")}</td>'
            f'</tr>'
        )

    mesai_rows = ''
    for m in data.get('mesai_saatleri') or []:
        gun_idx = int(m.get('gun', 1)) - 1
        gun_ad = GUN_ADLARI[gun_idx] if 0 <= gun_idx < 7 else str(m.get('gun'))
        aktif = m.get('aktif', True)
        mesai_rows += (
            f'<tr>'
            f'<td>{_esc(gun_ad)}</td>'
            f'<td>{_esc(m.get("baslangic") if aktif else "İzin")}</td>'
            f'<td>{_esc(m.get("bitis") if aktif else "—")}</td>'
            f'<td class="c">{m.get("mola_dakika", 0) if aktif else "—"}</td>'
            f'</tr>'
        )

    maddeler_html = ''
    if data.get('maddeler'):
        items = ''.join(f'<li>{_esc(m.get("metin"))}</li>' for m in data['maddeler'])
        maddeler_html = (
            f'<section><h2>Sözleşme Maddeleri</h2><ol class="clauses">{items}</ol></section>'
        )

    tur_raw = data.get('sozlesme_turu') or ''
    ders_html = ''
    if tur_raw in ('DERS_UCRETLI', 'KARMA'):
        tip = 'Saatlik' if data.get('ders_ucret_tipi') == 'SAAT_BASI' else (
            'Ders başı' if data.get('ders_ucret_tipi') == 'DERS_BASI' else '—'
        )
        ders_html = f'''
        <section>
          <h2>Ders Ücreti</h2>
          <table class="kv">
            {_kv_rows([
                ('Ücret tipi', _esc(tip)),
                ('Birim ücret', _fmt_tl_dec(data.get('ders_birim_ucret') or 0)),
            ])}
          </table>
        </section>'''

    maas_html = ''
    if tur_raw in ('TAM_ZAMANLI', 'KARMA') and (data.get('maas_plani') or []):
        maas_html = f'''
        <section>
          <h2>Aylık Maaş Planı</h2>
          <table class="grid">
            <thead><tr>
              <th>#</th><th>Başlangıç</th><th>Bitiş</th><th class="c">Gün</th>
              <th class="n">Net Maaş</th><th>Açıklama</th>
            </tr></thead>
            <tbody>{maas_rows}</tbody>
            <tfoot><tr>
              <td colspan="4">Toplam net bedel</td>
              <td class="n">{_fmt_tl(data.get("toplam_sozlesme_bedeli") or 0)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </section>'''

    izin_gunleri = data.get('haftalik_izin_gunleri') or []
    izin_text = ', '.join(GUN_ADLARI[g - 1] for g in izin_gunleri if 1 <= g <= 7) or '—'

    sure = format_calisma_suresi_ay(
        (data.get('ozet') or {}).get('toplam_calisma_suresi_ay')
        or data.get('toplam_calisma_suresi_ay')
        or 0
    )

    notlar_html = ''
    if data.get('notlar'):
        notlar_html = (
            f'<section><h2>Ek Notlar</h2>'
            f'<p class="note">{_esc(data["notlar"])}</p></section>'
        )

    brans_gorev = ' · '.join(
        x for x in (data.get('brans_snapshot'), data.get('gorev_snapshot')) if x
    ) or '—'

    brand_bits = [x for x in (data.get('sube_ad'), kurum.get('telefon_sabit')) if x]
    brand_sub_html = f'<p>{_esc(" · ".join(brand_bits))}</p>' if brand_bits else ''

    mesai_block = (
        f'<table class="grid compact"><thead><tr>'
        f'<th>Gün</th><th>Başlangıç</th><th>Bitiş</th><th class="c">Mola (dk)</th>'
        f'</tr></thead><tbody>{mesai_rows}</tbody></table>'
        if mesai_rows
        else '<p class="empty">Tanımlı mesai yok.</p>'
    )

    return f'''<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>{_esc(data.get("sozlesme_no"))} — Personel Sözleşmesi</title>
<style>
  @page {{ size: A4; margin: 12mm 11mm; }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; padding: 0;
    font-family: "Helvetica Neue", Helvetica, Arial, "Segoe UI", sans-serif;
    color: {INK}; font-size: 9.5pt; line-height: 1.4;
    background: #fff;
  }}
  .sheet {{ max-width: 190mm; margin: 0 auto; }}

  /* Header — flat, compact */
  .top {{
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding-bottom: 10px;
    border-bottom: 2.5px solid {ACCENT};
    margin-bottom: 14px;
  }}
  .logo {{ height: 36px; width: auto; object-fit: contain; }}
  .logo-mark {{
    width: 36px; height: 36px; border-radius: 6px;
    background: {ACCENT}; color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 11pt;
  }}
  .brand h1 {{
    margin: 0; font-size: 13pt; font-weight: 700; letter-spacing: -0.02em;
  }}
  .brand p {{
    margin: 2px 0 0; font-size: 8pt; color: {MUTED};
  }}
  .doc-id {{
    text-align: right; font-size: 8pt; color: {MUTED}; line-height: 1.35;
  }}
  .doc-id strong {{
    display: block; color: {ACCENT}; font-size: 11pt; font-weight: 700;
    letter-spacing: 0.02em;
  }}

  .title-block {{
    text-align: center; margin: 0 0 14px;
  }}
  .title-block h2 {{
    margin: 0; font-size: 12.5pt; font-weight: 800;
    letter-spacing: 0.06em; text-transform: uppercase; color: {ACCENT};
  }}
  .title-block .meta {{
    margin-top: 4px; font-size: 8pt; color: {MUTED};
  }}

  /* Sections */
  section {{ margin: 0 0 12px; }}
  h2 {{
    margin: 0 0 6px; padding: 0 0 3px;
    font-size: 8.5pt; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: {ACCENT};
    border-bottom: 1px solid {LINE};
  }}

  /* Two-column parties */
  .cols {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px;
  }}
  .col-head {{
    font-size: 8pt; font-weight: 700; color: {MUTED};
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 4px;
  }}

  /* Compact key-value table (no card chrome) */
  table.kv {{
    width: 100%; border-collapse: collapse; font-size: 9pt;
  }}
  table.kv th {{
    width: 38%; text-align: left; font-weight: 500; color: {MUTED};
    padding: 2.5px 8px 2.5px 0; vertical-align: top;
  }}
  table.kv td {{
    text-align: left; font-weight: 600; color: {INK};
    padding: 2.5px 0; vertical-align: top;
  }}

  /* Summary strip — one row of facts, not chips */
  .facts {{
    width: 100%; border-collapse: collapse;
    border: 1px solid {LINE}; border-radius: 0;
    font-size: 8.5pt; margin-top: 2px;
  }}
  .facts th, .facts td {{
    border: 1px solid {LINE}; padding: 5px 7px; text-align: left;
  }}
  .facts th {{
    background: #f8fafc; font-weight: 500; color: {MUTED};
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em;
    width: 22%;
  }}
  .facts td {{ font-weight: 650; color: {INK}; }}

  /* Data grids */
  table.grid {{
    width: 100%; border-collapse: collapse; font-size: 8.5pt;
  }}
  table.grid.compact {{ font-size: 8pt; }}
  table.grid th {{
    background: {ACCENT}; color: #fff;
    padding: 5px 7px; text-align: left; font-weight: 600;
    font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.04em;
  }}
  table.grid td {{
    padding: 4.5px 7px; border-bottom: 1px solid {LINE};
  }}
  table.grid tbody tr:nth-child(even) td {{ background: #fafbfc; }}
  table.grid .n {{ text-align: right; font-variant-numeric: tabular-nums; font-weight: 650; }}
  table.grid .c {{ text-align: center; }}
  table.grid .m {{ color: {MUTED}; }}
  table.grid tfoot td {{
    background: #f1f5f9; font-weight: 700; border-top: 1.5px solid {ACCENT};
    padding: 6px 7px;
  }}

  ol.clauses {{
    margin: 0; padding-left: 16px;
  }}
  ol.clauses li {{
    margin: 0 0 5px; font-size: 9pt; color: #334155;
  }}
  .note {{
    margin: 0; font-size: 9pt; color: #57534e;
    padding: 6px 0; border-top: 1px dashed {LINE};
  }}
  .empty {{ margin: 0; color: {MUTED}; font-size: 8.5pt; }}

  .work {{
    display: grid; grid-template-columns: 0.9fr 1.4fr; gap: 14px; align-items: start;
  }}

  /* Signatures */
  .signs {{
    display: grid; grid-template-columns: 1fr 1fr; gap: 36px;
    margin-top: 28px; page-break-inside: avoid;
  }}
  .sign {{
    border-top: 1.5px solid {ACCENT}; padding-top: 8px; min-height: 56px;
  }}
  .sign strong {{ display: block; font-size: 9pt; color: {ACCENT}; }}
  .sign span {{ display: block; font-size: 8pt; color: {MUTED}; margin-top: 3px; }}

  .footer {{
    margin-top: 18px; padding-top: 8px; border-top: 1px solid {LINE};
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 7.5pt; color: {MUTED};
  }}
  .footer .brand {{ color: {ACCENT}; font-weight: 600; }}
</style>
</head>
<body data-pdf-ready="true">
<div class="sheet">
  <header class="top">
    {logo_html}
    <div class="brand">
      <h1>{kurum_ad}</h1>
      {brand_sub_html}
    </div>
    <div class="doc-id">
      <strong>{_esc(data.get("sozlesme_no"))}</strong>
      Doğrulama: {_esc(data.get("dogrulama_kodu"))}
    </div>
  </header>

  <div class="title-block">
    <h2>{belge_basligi}</h2>
    <div class="meta">
      Düzenleme: {_fmt_tarih(data.get("duzenlenme_tarihi") or data.get("baslangic_tarihi"))}
      · Eğitim yılı: {_esc(data.get("egitim_yili_display"))}
    </div>
  </div>

  <section>
    <h2>Taraflar</h2>
    <div class="cols">
      <div>
        <div class="col-head">İşveren</div>
        <table class="kv">
          {_kv_rows([
              ('Kurum', kurum_ad),
              ('Şube', _esc(data.get('sube_ad'))),
              ('Adres', _esc(kurum.get('adres'))),
              ('Telefon', _esc(kurum.get('telefon_sabit'))),
          ])}
        </table>
      </div>
      <div>
        <div class="col-head">İşçi</div>
        <table class="kv">
          {_kv_rows([
              ('Ad soyad', _esc(data.get('personel_ad'))),
              ('TC kimlik no', _esc(data.get('personel_tc'))),
              ('Personel no', _esc(data.get('personel_no_snapshot'))),
              ('Branş / görev', _esc(brans_gorev)),
              ('Departman', _esc(data.get('departman_snapshot'))),
          ])}
        </table>
      </div>
    </div>
  </section>

  <section>
    <h2>Sözleşme Özeti</h2>
    <table class="facts">
      <tr>
        <th>Çalışma tipi</th><td>{tur}</td>
        <th>Durum</th><td>{_esc(data.get("durum_display"))}</td>
      </tr>
      <tr>
        <th>Başlangıç</th><td>{_fmt_tarih(data.get("baslangic_tarihi"))}</td>
        <th>Bitiş</th><td>{_fmt_tarih(data.get("bitis_tarihi"))}</td>
      </tr>
      <tr>
        <th>Toplam süre</th><td>{sure}</td>
        <th>Net maaş</th><td>{_fmt_tl(_contract_net_maas(data))}</td>
      </tr>
      <tr>
        <th>Toplam net bedel</th><td>{_fmt_tl(data.get("toplam_sozlesme_bedeli") or 0)}</td>
        <th>Haftalık / SGK</th>
        <td>{data.get("haftalik_calisma_gun_sayisi") or "—"} gün · {data.get("sgk_gun") or "—"} SGK</td>
      </tr>
    </table>
  </section>

  {maas_html}
  {ders_html}

  <section>
    <h2>Çalışma Düzeni</h2>
    <div class="work">
      <div>
        <table class="kv">
          {_kv_rows([
              ('Haftalık çalışma', f'{data.get("haftalik_calisma_gun_sayisi") or "—"} gün'),
              ('SGK gün', str(data.get('sgk_gun') or '—')),
              ('Haftalık izin', _esc(izin_text)),
          ])}
        </table>
      </div>
      <div>{mesai_block}</div>
    </div>
  </section>

  {maddeler_html}
  {notlar_html}

  <div class="signs">
    <div class="sign">
      <strong>İşveren / Kurum Yetkilisi</strong>
      <span>Ad soyad · İmza · Kaşe</span>
    </div>
    <div class="sign">
      <strong>İşçi / Personel</strong>
      <span>{_esc(data.get('personel_ad'))}</span>
      <span>İmza</span>
    </div>
  </div>

  <div class="footer">
    <span>{_esc(data.get('sozlesme_no'))} · {_esc(data.get('personel_ad'))} · Doğrulama: {_esc(data.get('dogrulama_kodu'))}</span>
    <span class="brand">3K Kampüs · {belge_basligi}</span>
  </div>
</div>
</body>
</html>'''
