"""Personel sözleşme belgesi — sunucu tarafı HTML (Playwright set_content, frontend gerekmez)."""
from __future__ import annotations

import html
from datetime import datetime
from typing import Any

from apps.personel.application.contract_calc_service import format_calisma_suresi_ay, sozlesme_belge_basligi
from apps.finans.application.export.report_html_template import resolve_login_banner_logo

KURUM_COLOR = '#1e3a5f'
KURUM_LIGHT = '#2563eb'
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


def _meta_card(title: str, rows: list[tuple[str, Any]]) -> str:
    inner = ''.join(
        f'<div class="info-row"><span class="label">{_esc(l)}</span><span class="value">{v}</span></div>'
        for l, v in rows
    )
    return f'<div class="meta-card"><div class="meta-card-title">{_esc(title)}</div>{inner}</div>'


def _summary_chip(label: str, value: str) -> str:
    return (
        f'<div class="chip"><div class="chip-label">{_esc(label)}</div>'
        f'<div class="chip-value">{value}</div></div>'
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
        f'<img src="{logo}" alt="Logo" class="logo" />'
        if logo
        else f'<div class="logo-fallback">3K</div>'
    )

    maas_rows = ''
    for row in data.get('maas_plani') or []:
        maas_rows += (
            f'<tr>'
            f'<td><strong>{row.get("sira_no")}. Ay</strong></td>'
            f'<td>{_fmt_tarih(row.get("baslangic_tarihi"))}</td>'
            f'<td>{_fmt_tarih(row.get("bitis_tarihi"))}</td>'
            f'<td class="center">{row.get("calisilan_gun", "—")}</td>'
            f'<td class="num">{_fmt_tl(row.get("maas", 0))}</td>'
            f'<td class="muted">{_esc(row.get("aciklama") or "—")}</td>'
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
            f'<td>{m.get("mola_dakika", 0) if aktif else "—"} dk</td>'
            f'</tr>'
        )

    maddeler_html = ''
    if data.get('maddeler'):
        items = ''.join(f'<li>{_esc(m.get("metin"))}</li>' for m in data['maddeler'])
        maddeler_html = f'<section><h2 class="section-title">Sözleşme Maddeleri</h2><ol class="maddeler">{items}</ol></section>'

    ders_html = ''
    tur_raw = data.get('sozlesme_turu') or ''
    if tur_raw in ('DERS_UCRETLI', 'KARMA'):
        tip = 'Saatlik Ücret' if data.get('ders_ucret_tipi') == 'SAAT_BASI' else (
            'Ders Başına' if data.get('ders_ucret_tipi') == 'DERS_BASI' else '—'
        )
        ders_html = f'''
        <section>
          <h2 class="section-title">Ders Ücreti</h2>
          <div class="grid-3">
            {_meta_card('Ücret Tipi', [('Tip', _esc(tip))])}
            {_meta_card('Birim Ücret', [('Tutar', _fmt_tl_dec(data.get('ders_birim_ucret') or 0))])}
          </div>
        </section>'''

    maas_html = ''
    if tur_raw in ('TAM_ZAMANLI', 'KARMA') and (data.get('maas_plani') or []):
        maas_html = f'''
        <section>
          <h2 class="section-title">Aylık Maaş Planı</h2>
          <table class="data-table">
            <thead><tr>
              <th>Ay</th><th>Başlangıç</th><th>Bitiş</th><th>Gün</th><th>Net Maaş</th><th>Açıklama</th>
            </tr></thead>
            <tbody>{maas_rows}</tbody>
            <tfoot><tr>
              <td colspan="4"><strong>TOPLAM</strong></td>
              <td class="num total">{_fmt_tl(data.get("toplam_sozlesme_bedeli") or 0)}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </section>'''

    izin_gunleri = data.get('haftalik_izin_gunleri') or []
    izin_text = ', '.join(GUN_ADLARI[g - 1] for g in izin_gunleri if 1 <= g <= 7) or '—'

    chips = [
        _summary_chip('Çalışma Tipi', tur),
        _summary_chip('Durum', _esc(data.get('durum_display'))),
        _summary_chip('Başlangıç', _fmt_tarih(data.get('baslangic_tarihi'))),
        _summary_chip('Bitiş', _fmt_tarih(data.get('bitis_tarihi'))),
        _summary_chip(
            'Toplam Süre',
            format_calisma_suresi_ay(
                (data.get('ozet') or {}).get('toplam_calisma_suresi_ay')
                or data.get('toplam_calisma_suresi_ay')
                or 0
            ),
        ),
        _summary_chip('Net Maaş', _fmt_tl(_contract_net_maas(data))),
        _summary_chip('Toplam Net Bedel', _fmt_tl(data.get('toplam_sozlesme_bedeli') or 0)),
        _summary_chip('Haftalık Gün', f'{data.get("haftalik_calisma_gun_sayisi") or "—"} gün'),
        _summary_chip('SGK Gün', str(data.get('sgk_gun') or '—')),
    ]

    notlar_html = ''
    if data.get('notlar'):
        notlar_html = f'<section><h2 class="section-title">Ek Notlar</h2><div class="notlar">{_esc(data["notlar"])}</div></section>'

    brans_gorev = ' · '.join(
        x for x in (data.get('brans_snapshot'), data.get('gorev_snapshot')) if x
    ) or '—'

    return f'''<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>{_esc(data.get("sozlesme_no"))} — Personel Sözleşmesi</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{
    font-family: "Segoe UI", system-ui, sans-serif;
    color: #111827; font-size: 10.5pt; line-height: 1.45;
    margin: 0; padding: 28px 32px; background: #fff;
  }}
  .banner {{
    background: linear-gradient(135deg, {KURUM_COLOR} 0%, {KURUM_LIGHT} 100%);
    border-radius: 12px; padding: 18px 22px; color: #fff;
    display: flex; align-items: center; gap: 16px; margin-bottom: 20px;
  }}
  .logo {{ width: 52px; height: auto; object-fit: contain; flex-shrink: 0; }}
  .logo-fallback {{
    width: 52px; height: 52px; border-radius: 8px; background: rgba(255,255,255,.2);
    display: flex; align-items: center; justify-content: center; font-weight: 800;
  }}
  .banner-main {{ flex: 1; min-width: 0; }}
  .banner-main h1 {{ margin: 0; font-size: 16pt; font-weight: 700; }}
  .banner-sub {{ font-size: 9pt; opacity: .85; margin-top: 3px; }}
  .banner-meta {{
    text-align: right; background: rgba(255,255,255,.15); border-radius: 10px;
    padding: 8px 14px; border: 1px solid rgba(255,255,255,.25); flex-shrink: 0;
  }}
  .banner-meta .lbl {{ font-size: 7.5pt; opacity: .75; text-transform: uppercase; letter-spacing: 1px; }}
  .banner-meta .val {{ font-size: 12pt; font-weight: 700; margin-top: 2px; }}
  .verify {{ font-size: 8pt; opacity: .8; margin-top: 4px; letter-spacing: .5px; }}
  .doc-title {{
    text-align: center; margin-bottom: 18px; padding-bottom: 10px;
    border-bottom: 2px solid {KURUM_COLOR};
  }}
  .doc-title h2 {{
    margin: 0; font-size: 14pt; font-weight: 800; color: {KURUM_COLOR};
    letter-spacing: 1px; text-transform: uppercase;
  }}
  .doc-title p {{ margin: 6px 0 0; font-size: 9.5pt; color: #64748b; }}
  .section-title {{
    font-size: 10pt; font-weight: 700; color: #334155; text-transform: uppercase;
    letter-spacing: .5px; margin: 18px 0 10px; padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
  }}
  .grid-2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
  .grid-3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }}
  .grid-4 {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 4px; }}
  .meta-card {{
    background: #f8fafc; border: 1px solid #e9ecf2; border-radius: 10px; padding: 12px 14px;
  }}
  .meta-card-title {{
    font-size: 8pt; font-weight: 700; color: #94a3b8; text-transform: uppercase;
    letter-spacing: 1px; margin-bottom: 8px;
  }}
  .info-row {{ display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; font-size: 9.5pt; }}
  .info-row .label {{ color: #64748b; }}
  .info-row .value {{ color: #1e293b; font-weight: 500; text-align: right; }}
  .chip {{
    background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 10px 12px; text-align: center;
  }}
  .chip-label {{ font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: .8px; }}
  .chip-value {{ font-size: 10.5pt; font-weight: 700; color: {KURUM_COLOR}; margin-top: 4px; }}
  .data-table {{ width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 4px; }}
  .data-table th {{
    background: {KURUM_COLOR}; color: #fff; padding: 8px 10px; text-align: left;
    font-size: 8.5pt; text-transform: uppercase; letter-spacing: .4px;
  }}
  .data-table td {{ padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }}
  .data-table tbody tr:nth-child(even) {{ background: #f8fafc; }}
  .data-table .num {{ text-align: right; font-weight: 600; color: {KURUM_COLOR}; }}
  .data-table .center {{ text-align: center; }}
  .data-table .muted {{ color: #64748b; }}
  .data-table tfoot td {{ background: #eff6ff; border-top: 2px solid {KURUM_LIGHT}; font-weight: 700; }}
  .maddeler {{ padding-left: 20px; margin: 0; }}
  .maddeler li {{ margin-bottom: 8px; font-size: 10pt; color: #334155; }}
  .notlar {{
    background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
    padding: 10px 14px; font-size: 10pt; color: #78350f;
  }}
  .signatures {{ display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }}
  .sign-box {{ border-top: 2px solid {KURUM_COLOR}; padding-top: 10px; min-height: 70px; }}
  .sign-title {{ font-size: 10pt; font-weight: 700; color: {KURUM_COLOR}; }}
  .sign-sub {{ font-size: 9pt; color: #64748b; margin-top: 4px; }}
  .footer {{
    margin-top: 28px; padding-top: 10px; border-top: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; font-size: 8pt; color: #94a3b8;
  }}
  .footer-brand {{ color: #0ea5e9; font-weight: 600; }}
</style>
</head>
<body data-pdf-ready="true">
  <div class="banner">
    {logo_html}
    <div class="banner-main">
      <h1>{kurum_ad}</h1>
          <div class="banner-sub">{belge_basligi}</div>
    </div>
    <div class="banner-meta">
      <div class="lbl">Sözleşme No</div>
      <div class="val">{_esc(data.get("sozlesme_no"))}</div>
      <div class="verify">Doğrulama: {_esc(data.get("dogrulama_kodu"))}</div>
    </div>
  </div>

  <div class="doc-title">
    <h2>{belge_basligi.upper()}</h2>
    <p>Düzenleme: {_fmt_tarih(data.get("duzenlenme_tarihi") or data.get("baslangic_tarihi"))}
       · Eğitim Yılı: {_esc(data.get("egitim_yili_display"))}</p>
  </div>

  <section>
    <h2 class="section-title">Taraflar</h2>
    <div class="grid-2">
      {_meta_card('İşveren (Kurum)', [
        ('Kurum', kurum_ad),
        ('Şube', _esc(data.get('sube_ad'))),
        ('Adres', _esc(kurum.get('adres'))),
        ('Telefon', _esc(kurum.get('telefon_sabit'))),
      ])}
      {_meta_card('İşçi (Personel)', [
        ('Ad Soyad', _esc(data.get('personel_ad'))),
        ('TC Kimlik No', _esc(data.get('personel_tc'))),
        ('Personel No', _esc(data.get('personel_no_snapshot'))),
        ('Branş / Görev', _esc(brans_gorev)),
        ('Departman', _esc(data.get('departman_snapshot'))),
      ])}
    </div>
  </section>

  <section>
    <h2 class="section-title">Sözleşme Özeti</h2>
    <div class="grid-4">{''.join(chips)}</div>
  </section>

  {maas_html}
  {ders_html}

  <section>
    <h2 class="section-title">Çalışma Düzeni</h2>
    <div class="grid-2">
      {_meta_card('Genel', [
        ('Haftalık Çalışma', f'{data.get("haftalik_calisma_gun_sayisi") or "—"} gün'),
        ('SGK Gün', str(data.get('sgk_gun') or '—')),
        ('Haftalık İzin', _esc(izin_text)),
      ])}
      {'<div><table class="data-table"><thead><tr><th>Gün</th><th>Başlangıç</th><th>Bitiş</th><th>Mola</th></tr></thead><tbody>' + mesai_rows + '</tbody></table></div>' if mesai_rows else '<div class="meta-card"><div class="meta-card-title">Mesai</div><div class="info-row"><span class="value">Tanımlı mesai yok</span></div></div>'}
    </div>
  </section>

  {maddeler_html}
  {notlar_html}

  <div class="signatures">
    <div class="sign-box">
      <div class="sign-title">İşveren / Kurum Yetkilisi</div>
      <div class="sign-sub">Ad Soyad · İmza · Kaşe</div>
    </div>
    <div class="sign-box">
      <div class="sign-title">İşçi / Personel</div>
      <div class="sign-sub">{_esc(data.get('personel_ad'))}</div>
      <div class="sign-sub">İmza</div>
    </div>
  </div>

  <div class="footer">
    <span>{_esc(data.get('sozlesme_no'))} · {_esc(data.get('personel_ad'))} · Doğrulama: {_esc(data.get('dogrulama_kodu'))}</span>
    <span class="footer-brand">3K Kampüs · {belge_basligi}</span>
  </div>
</body>
</html>'''
