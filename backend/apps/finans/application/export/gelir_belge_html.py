"""
Gelir İşlem Belgesi ve Tahsilat Makbuzu — A4 HTML.
Gerçek e-Fatura / e-Arşiv yerine geçmez; kurum içi finansal işlem ve tahsilat makbuzudur.
"""
from __future__ import annotations

from apps.finans.application.export.cari_report_html import (
    SOFTWARE_NAME,
    _esc,
    _fmt_tl,
    _fmt_tr_date,
    _logo_fallback_text,
)
from apps.finans.application.export.gider_belge_html import (
    _aciklama_block,
    _doc_shell,
    _durum_badge,
    _kv_row,
    _user_name,
)
from apps.finans.application.export.report_html_template import _resolve_logo
from apps.finans.application.gelir_v2.gelir_query_service import (
    _TAHSIL_DURUMU_LABEL,
    compute_tahsil_durumu,
)


def _gelir_context(gelir):
    meta = {'kurum_id': gelir.kurum_id, 'sube_id': gelir.sube_id}
    logo = _resolve_logo(meta)
    kurum = getattr(gelir.kurum, 'ad', '') if gelir.kurum_id else ''
    sube = getattr(gelir.sube, 'ad', '') if gelir.sube_id else ''
    return {
        'logo': logo,
        'kurum': kurum,
        'sube': sube,
        'logo_alt': kurum or SOFTWARE_NAME,
        'logo_fallback': _logo_fallback_text(kurum),
    }


def _tahsil_badge(durum: str) -> str:
    kind = {
        'tahsil_edildi': 'ok',
        'kismi_tahsil': 'warn',
        'ileri_tarihli': 'info',
        'gecikti': 'late',
        'iptal': 'muted',
        'taslak': 'muted',
        'bekliyor': 'warn',
    }.get(durum, 'muted')
    return _durum_badge(_TAHSIL_DURUMU_LABEL.get(durum, durum), kind)


def build_gelir_islem_belgesi_html(gelir) -> str:
    ctx = _gelir_context(gelir)
    tahsil_durum = compute_tahsil_durumu(gelir)
    belge_no = gelir.fatura_no or f'GLR-{gelir.pk:06d}'
    left = '<table class="info">' + ''.join([
        _kv_row('Belge / Fatura No', _esc(belge_no)),
        _kv_row('Fatura / İşlem Tarihi', _esc(_fmt_tr_date(gelir.fatura_tarihi) or '—')),
        _kv_row('Vade Tarihi', _esc(_fmt_tr_date(gelir.vade_tarihi) or '—')),
        _kv_row('Gelir Kategorisi', _esc(getattr(gelir.gelir_kategorisi, 'ad', None) or '—')),
        _kv_row('Müşteri / Cari', _esc(getattr(gelir.cari_hesap, 'gorunen_ad', None) or getattr(gelir.cari_hesap, 'unvan', None))),
        _kv_row('Şube', _esc(ctx['sube'] or '—')),
    ]) + '</table>'
    right = '<table class="info">' + ''.join([
        _kv_row('KDV Hariç (Matrah)', _fmt_tl(gelir.brut_tutar), num=True),
        _kv_row(f'KDV (%{gelir.kdv_orani})', _fmt_tl(gelir.kdv_tutar), num=True),
        _kv_row('Genel Toplam (KDV Dahil)', _fmt_tl(gelir.net_tutar), num=True),
        _kv_row('Tahsil Edilen', _fmt_tl(gelir.tahsil_edilen), num=True),
        _kv_row('Kalan Alacak', _fmt_tl(gelir.kalan_tutar), num=True),
        _kv_row('Tahsilat Durumu', _tahsil_badge(tahsil_durum)),
        _kv_row('Oluşturan', _esc(_user_name(gelir.olusturan))),
        _kv_row('İşlem ID', _esc(gelir.pk)),
    ]) + '</table>'
    body = (
        f'<div class="grid">{left}{right}</div>'
        f'{_aciklama_block(gelir.aciklama, label="Gelir Açıklaması")}'
    )
    return _doc_shell(
        title='Gelir İşlem Belgesi',
        kicker='GELİR İŞLEM BELGESİ',
        belge_no=belge_no,
        body=body,
        disclaimer=(
            'Bu belge resmi e-Fatura veya e-Arşiv fatura yerine geçmez; '
            '3K Kampüs tarafından oluşturulan kurum içi gelir işlem belgesidir.'
        ),
        **ctx,
    )


def build_tahsilat_makbuzu_html(gelir, tahsilat) -> str:
    ctx = _gelir_context(gelir)
    makbuz_no = f'THS-{tahsilat.tahsilat_tarihi.year if tahsilat.tahsilat_tarihi else "0000"}-{tahsilat.pk:06d}'
    gelir_no = gelir.fatura_no or f'GLR-{gelir.pk:06d}'
    yontem = 'Bakiyeden Mahsup' if tahsilat.bakiyeden_mahsup else (
        getattr(tahsilat.odeme_yontemi, 'ad', None) or '—'
    )
    hesap = 'Cari Bakiye' if tahsilat.bakiyeden_mahsup else (
        getattr(tahsilat.mali_hesap, 'ad', None) or '—'
    )
    body = '<div class="grid"><table class="info">' + ''.join([
        _kv_row('Tahsilat Makbuz No', _esc(makbuz_no)),
        _kv_row('İlgili Gelir Belgesi', _esc(gelir_no)),
        _kv_row('Müşteri / Cari', _esc(getattr(gelir.cari_hesap, 'gorunen_ad', None) or getattr(gelir.cari_hesap, 'unvan', None))),
        _kv_row('Tahsilat Tarihi', _esc(_fmt_tr_date(tahsilat.tahsilat_tarihi) or '—')),
        _kv_row('Şube', _esc(ctx['sube'] or '—')),
    ]) + '</table><table class="info">' + ''.join([
        _kv_row('Tahsil Edilen Tutar', _fmt_tl(tahsilat.tutar), num=True),
        _kv_row('Kalan Gelir Bakiyesi', _fmt_tl(gelir.kalan_tutar), num=True),
        _kv_row('Tahsilat Yöntemi', _esc(yontem)),
        _kv_row('Mali Hesap', _esc(hesap)),
        _kv_row('İşlemi Yapan', _esc(_user_name(tahsilat.islem_yapan))),
        _kv_row('İşlem ID', _esc(tahsilat.pk)),
    ]) + '</table></div>' + (
        _aciklama_block(gelir.aciklama, label='Gelir Açıklaması')
        + _aciklama_block(tahsilat.aciklama, label='Tahsilat Açıklaması')
    )
    return _doc_shell(
        title='Tahsilat Makbuzu',
        kicker='TAHSİLAT MAKBUZU',
        belge_no=makbuz_no,
        body=body,
        disclaimer=(
            'Bu makbuz yalnızca gerçekleşmiş bir tahsilatı belgeler. '
            'Resmi e-Fatura veya mali fiş yerine geçmez.'
        ),
        **ctx,
    )
