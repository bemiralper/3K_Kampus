"""
Gider İşlem Belgesi / Ödeme Belgesi / Ödeme Planı — A4 HTML.
Gerçek fatura veya fiş yerine geçmez.
"""
from __future__ import annotations

from typing import Any

from django.utils import timezone

from apps.finans.application.export.cari_report_html import (
    BRAND_PRIMARY,
    SOFTWARE_NAME,
    _esc,
    _fmt_tl,
    _fmt_tr_date,
    _logo_fallback_text,
)
from apps.finans.application.export.report_html_template import _resolve_logo
from apps.finans.application.gider_odeme_durumu import compute_odeme_durumu, resolve_taksit_durum
from apps.finans.constants.gider_types import GiderOdemeDurumu, GiderTaksitDurum, OdemeDurum


def _user_name(user) -> str:
    if not user:
        return '—'
    return user.get_full_name() or user.username or '—'


def _durum_badge(label: str, kind: str) -> str:
    colors = {
        'ok': ('#dcfce7', '#166534'),
        'warn': ('#fef3c7', '#92400e'),
        'late': ('#fee2e2', '#991b1b'),
        'info': ('#dbeafe', '#1e40af'),
        'muted': ('#f1f5f9', '#475569'),
    }
    bg, fg = colors.get(kind, colors['muted'])
    return (
        f'<span style="display:inline-block;padding:3px 10px;border-radius:999px;'
        f'background:{bg};color:{fg};font-weight:700;font-size:11px;">{_esc(label)}</span>'
    )


def _odeme_badge(durum: str) -> str:
    kind = {
        GiderOdemeDurumu.ODENDI: 'ok',
        GiderOdemeDurumu.KISMI_ODENDI: 'warn',
        GiderOdemeDurumu.ILERI_TARIHLI: 'info',
        GiderOdemeDurumu.GECIKTI: 'late',
        GiderOdemeDurumu.IPTAL: 'muted',
        GiderOdemeDurumu.BEKLIYOR: 'warn',
    }.get(durum, 'muted')
    return _durum_badge(GiderOdemeDurumu.LABEL.get(durum, durum), kind)


def _taksit_badge(durum: str) -> str:
    kind = {
        GiderTaksitDurum.ODENDI: 'ok',
        GiderTaksitDurum.KISMI_ODENDI: 'warn',
        GiderTaksitDurum.ILERI_TARIHLI: 'info',
        GiderTaksitDurum.GECIKTI: 'late',
        GiderTaksitDurum.IPTAL: 'muted',
        GiderTaksitDurum.BEKLEMEDE: 'warn',
    }.get(durum, 'muted')
    label = dict(GiderTaksitDurum.CHOICES).get(durum, durum)
    return _durum_badge(label, kind)


def _kv_row(label: str, value: Any, *, num=False) -> str:
    cls = ' class="num"' if num else ''
    return f'<tr><th>{_esc(label)}</th><td{cls}>{value}</td></tr>'


def _aciklama_block(text: str | None, *, label: str = 'Açıklama') -> str:
    body = (text or '').strip()
    if not body:
        return ''
    return (
        f'<div class="aciklama">'
        f'<div class="aciklama-label">{_esc(label)}</div>'
        f'<div class="aciklama-text">{_esc(body)}</div>'
        f'</div>'
    )


def _doc_shell(*, title: str, kicker: str, belge_no: str, logo, kurum, sube,
               logo_alt, logo_fallback, body: str, disclaimer: str) -> str:
    logo_block = (
        f'<img src="{logo}" alt="{_esc(logo_alt)}" class="logo" />'
        if logo
        else f'<div class="logo-fallback">{_esc(logo_fallback)}</div>'
    )
    now = timezone.localtime(timezone.now()).strftime('%d.%m.%Y %H:%M')
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>{_esc(title)}</title>
  <style>
    @page {{ size: A4 portrait; margin: 12mm 12mm 18mm 12mm; }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      color: #0f172a; margin: 0; font-size: 12px; line-height: 1.45; background: #fff;
    }}
    .header {{
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: 16px; border-bottom: 3px solid {BRAND_PRIMARY}; padding-bottom: 14px; margin-bottom: 16px;
    }}
    .brand {{ display: flex; gap: 12px; align-items: center; }}
    .logo {{ width: 52px; height: 52px; object-fit: contain; }}
    .logo-fallback {{
      width: 52px; height: 52px; border-radius: 12px; background: {BRAND_PRIMARY};
      color: #fff; display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px;
    }}
    .brand-name {{ font-size: 18px; font-weight: 800; color: {BRAND_PRIMARY}; }}
    .brand-sub {{ color: #64748b; font-size: 12px; }}
    .doc-meta {{ text-align: right; }}
    .kicker {{
      letter-spacing: .08em; font-size: 11px; font-weight: 800; color: {BRAND_PRIMARY};
    }}
    .belge-no {{
      margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 15px; font-weight: 800; color: #0f172a;
    }}
    h1 {{ font-size: 20px; margin: 0 0 14px; color: #0f172a; }}
    .grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }}
    table.info {{ width: 100%; border-collapse: collapse; }}
    table.info th {{
      text-align: left; width: 42%; color: #64748b; font-weight: 600; padding: 5px 0;
      vertical-align: top;
    }}
    table.info td {{ padding: 5px 0; }}
    table.info td.num {{ text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }}
    .aciklama {{
      margin: 0 0 16px; padding: 12px 14px; background: #f8fafc;
      border: 1px solid #e2e8f0; border-radius: 10px;
    }}
    .aciklama-label {{
      font-size: 10px; font-weight: 700; letter-spacing: .04em;
      text-transform: uppercase; color: #64748b; margin-bottom: 6px;
    }}
    .aciklama-text {{
      color: #0f172a; font-size: 12.5px; line-height: 1.55; white-space: pre-wrap;
    }}
    .cards {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 0 16px; }}
    .card {{
      border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; background: #f8fafc;
    }}
    .card-label {{ font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; }}
    .card-value {{ font-size: 15px; font-weight: 800; margin-top: 4px; text-align: right;
      font-variant-numeric: tabular-nums; }}
    table.plan {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    table.plan th, table.plan td {{
      border: 1px solid #e2e8f0; padding: 7px 8px; font-size: 11px;
    }}
    table.plan th {{
      background: {BRAND_PRIMARY}; color: #fff; text-align: left; font-weight: 700;
    }}
    table.plan td.num, table.plan th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    .disclaimer {{
      margin-top: 18px; padding: 10px 12px; background: #fff7ed; border: 1px solid #fdba74;
      border-radius: 8px; color: #9a3412; font-size: 11px;
    }}
    .footer-note {{ margin-top: 14px; color: #94a3b8; font-size: 10px; }}
    @media print {{
      .disclaimer, .aciklama {{ -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
    }}
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      {logo_block}
      <div>
        <div class="brand-name">{SOFTWARE_NAME}</div>
        <div class="brand-sub">{_esc(kurum)}{f' · {_esc(sube)}' if sube else ''}</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="kicker">{_esc(kicker)}</div>
      <div class="belge-no">{_esc(belge_no)}</div>
    </div>
  </div>
  <h1>{_esc(title)}</h1>
  {body}
  <div class="disclaimer">{_esc(disclaimer)}</div>
  <div class="footer-note">{SOFTWARE_NAME} · Oluşturma: {now}</div>
</body>
</html>
"""


def _gider_context(gider):
    meta = {'kurum_id': gider.kurum_id, 'sube_id': gider.sube_id}
    logo = _resolve_logo(meta)
    kurum = getattr(gider.kurum, 'ad', '') if gider.kurum_id else ''
    sube = getattr(gider.sube, 'ad', '') if gider.sube_id else ''
    return {
        'logo': logo,
        'kurum': kurum,
        'sube': sube,
        'logo_alt': kurum or SOFTWARE_NAME,
        'logo_fallback': _logo_fallback_text(kurum),
    }


def build_gider_islem_belgesi_html(gider) -> str:
    ctx = _gider_context(gider)
    odeme_durum = compute_odeme_durumu(gider)
    belge_no = gider.islem_belge_no or f'GDR-{gider.pk}'
    left = '<table class="info">' + ''.join([
        _kv_row('Belge No', _esc(belge_no)),
        _kv_row('İşlem Tarihi', _esc(_fmt_tr_date(gider.fatura_tarihi) or '—')),
        _kv_row('Gider Türü / Kategori', _esc(getattr(gider.gider_kategorisi, 'ad', None))),
        _kv_row('Tedarikçi / Cari', _esc(getattr(gider.cari_hesap, 'gorunen_ad', None) or getattr(gider.cari_hesap, 'unvan', None))),
        _kv_row('Şube', _esc(ctx['sube'] or '—')),
    ]) + '</table>'
    right = '<table class="info">' + ''.join([
        _kv_row('Mali Hesap', _esc(getattr(gider.mali_hesap, 'ad', None) or '—')),
        _kv_row('Ödeme Yöntemi', _esc(getattr(gider.odeme_yontemi, 'ad', None) or '—')),
        _kv_row('Toplam Gider', _fmt_tl(gider.net_tutar), num=True),
        _kv_row('Ödenen', _fmt_tl(gider.odenen_toplam), num=True),
        _kv_row('Kalan', _fmt_tl(gider.kalan_tutar), num=True),
        _kv_row('Ödeme Durumu', _odeme_badge(odeme_durum)),
        _kv_row('Oluşturan', _esc(_user_name(gider.olusturan))),
        _kv_row('İşlem ID', _esc(gider.pk)),
    ]) + '</table>'
    body = (
        f'<div class="grid">{left}{right}</div>'
        f'{_aciklama_block(gider.aciklama, label="Gider Açıklaması")}'
    )
    if gider.fatura_no and gider.fatura_no != gider.islem_belge_no:
        body += (
            f'<p style="color:#64748b;font-size:11px;">Tedarikçi fatura / fiş no: '
            f'<strong>{_esc(gider.fatura_no)}</strong> '
            f'(sistem belgesi değildir)</p>'
        )
    return _doc_shell(
        title='Gider İşlem Belgesi',
        kicker='GİDER İŞLEM BELGESİ',
        belge_no=belge_no,
        body=body,
        disclaimer=(
            'Bu belge gerçek bir fatura veya fiş yerine geçmez. '
            '3K Kampüs tarafından oluşturulan finansal işlem belgesidir. '
            'Tedarikçiden alınan fatura / fiş “Ekli Belgeler” bölümünde ayrıca tutulur.'
        ),
        **ctx,
    )


def build_odeme_plani_html(gider) -> str:
    ctx = _gider_context(gider)
    belge_no = gider.islem_belge_no or f'GDR-{gider.pk}'
    taksitler = list(gider.taksitler.all().order_by('taksit_no'))
    rows = ''
    for t in taksitler:
        durum = resolve_taksit_durum(t)
        rows += (
            f'<tr>'
            f'<td>{t.taksit_no}</td>'
            f'<td>{_esc(_fmt_tr_date(t.vade_tarihi))}</td>'
            f'<td class="num">{_fmt_tl(t.tutar)}</td>'
            f'<td class="num">{_fmt_tl(t.odenen_tutar)}</td>'
            f'<td class="num">{_fmt_tl(t.kalan_tutar)}</td>'
            f'<td>{_esc(_fmt_tr_date(t.odeme_tarihi) or "—")}</td>'
            f'<td>{_taksit_badge(durum)}</td>'
            f'</tr>'
        )
    if not rows:
        rows = '<tr><td colspan="7">Taksit kaydı yok.</td></tr>'
    cards = f"""
    <div class="cards">
      <div class="card"><div class="card-label">Toplam Tutar</div><div class="card-value">{_fmt_tl(gider.net_tutar)}</div></div>
      <div class="card"><div class="card-label">Taksit Sayısı</div><div class="card-value" style="text-align:left">{gider.taksit_sayisi}</div></div>
      <div class="card"><div class="card-label">Ödenen Toplam</div><div class="card-value" style="color:#166534">{_fmt_tl(gider.odenen_toplam)}</div></div>
      <div class="card"><div class="card-label">Kalan Toplam</div><div class="card-value" style="color:#991b1b">{_fmt_tl(gider.kalan_tutar)}</div></div>
    </div>
    """
    info = '<table class="info">' + ''.join([
        _kv_row('Tedarikçi', _esc(getattr(gider.cari_hesap, 'gorunen_ad', None) or getattr(gider.cari_hesap, 'unvan', None))),
        _kv_row('Gider Konusu', _esc(getattr(gider.gider_kategorisi, 'ad', None) or '—')),
        _kv_row('İlgili Gider Belgesi', _esc(belge_no)),
        _kv_row('Ödeme Durumu', _odeme_badge(compute_odeme_durumu(gider))),
    ]) + '</table>' + _aciklama_block(gider.aciklama, label='Gider Açıklaması')
    table = f"""
    <table class="plan">
      <thead>
        <tr>
          <th>Taksit</th><th>Vade</th><th class="num">Tutar</th>
          <th class="num">Ödenen</th><th class="num">Kalan</th>
          <th>Ödeme Tarihi</th><th>Durum</th>
        </tr>
      </thead>
      <tbody>{rows}</tbody>
    </table>
    """
    return _doc_shell(
        title='Ödeme Planı',
        kicker='ÖDEME PLANI',
        belge_no=f'{belge_no} · Plan',
        body=info + cards + table,
        disclaimer=(
            'Bu ödeme planı bilgi amaçlıdır; fatura yerine geçmez. '
            'İleri tarihli veya bekleyen taksitler henüz gerçekleşmiş kasa/banka çıkışı değildir.'
        ),
        **ctx,
    )


def build_odeme_belgesi_html(gider, odeme) -> str:
    ctx = _gider_context(gider)
    belge_no = odeme.odeme_belge_no or f'ODM-{odeme.pk}'
    gider_no = gider.islem_belge_no or gider.fatura_no or f'GDR-{gider.pk}'
    taksit = odeme.gider_taksit
    taksit_lbl = f'{taksit.taksit_no}. taksit' if taksit else '—'
    yontem = 'Bakiyeden Mahsup' if odeme.bakiyeden_mahsup else (
        getattr(odeme.odeme_yontemi, 'ad', None) or '—'
    )
    hesap = 'Cari Bakiye' if odeme.bakiyeden_mahsup else (
        getattr(odeme.mali_hesap, 'ad', None) or '—'
    )
    body = '<div class="grid"><table class="info">' + ''.join([
        _kv_row('Ödeme Belge No', _esc(belge_no)),
        _kv_row('İlgili Gider Belgesi', _esc(gider_no)),
        _kv_row('Tedarikçi / Cari', _esc(getattr(gider.cari_hesap, 'gorunen_ad', None) or getattr(gider.cari_hesap, 'unvan', None))),
        _kv_row('Ödeme Tarihi', _esc(_fmt_tr_date(odeme.odeme_tarihi) or '—')),
        _kv_row('İlgili Taksit', _esc(taksit_lbl)),
    ]) + '</table><table class="info">' + ''.join([
        _kv_row('Ödeme Tutarı', _fmt_tl(odeme.tutar), num=True),
        _kv_row('Ödeme Yöntemi', _esc(yontem)),
        _kv_row('Mali Hesap', _esc(hesap)),
        _kv_row('İşlemi Yapan', _esc(_user_name(odeme.islem_yapan))),
        _kv_row('İşlem ID', _esc(odeme.pk)),
    ]) + '</table></div>' + (
        _aciklama_block(gider.aciklama, label='Gider Açıklaması')
        + _aciklama_block(odeme.aciklama, label='Ödeme Açıklaması')
    )
    return _doc_shell(
        title='Ödeme Belgesi',
        kicker='ÖDEME BELGESİ',
        belge_no=belge_no,
        body=body,
        disclaimer=(
            'Bu belge yalnızca gerçekleşmiş bir ödemeyi belgeler. '
            'Fatura veya fiş yerine geçmez. İleri tarihli / bekleyen ödemeler için düzenlenemez.'
        ),
        **ctx,
    )
