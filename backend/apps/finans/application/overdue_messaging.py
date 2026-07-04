"""
Gecikmiş ödeme mesajı bağlamı ve şablon render — döngüsel import önleme.
"""
from __future__ import annotations

CATEGORY_ODEME_GECIKME = 'odeme_gecikme'

OVERDUE_TEMPLATE_VARIABLES = [
    'veli_ad', 'ogrenci_ad', 'sozlesme_no', 'taksit_no', 'vade_tarihi',
    'kalan_tutar', 'gecikme_gunu', 'toplam_gecikmis_tutar', 'kurum_ad',
]


def build_overdue_context(taksit, *, toplam_gecikmis: int = 0) -> dict:
    from apps.odeme_takip.domain.overdue import gecikme_gunu

    sozlesme = taksit.sozlesme
    ogrenci = sozlesme.ogrenci
    kurum = sozlesme.kurum
    vade = taksit.vade_tarihi.strftime('%d.%m.%Y') if taksit.vade_tarihi else ''
    return {
        'veli_ad': getattr(sozlesme.veli, 'tam_ad', '') if sozlesme.veli_id else '',
        'ogrenci_ad': f'{ogrenci.ad} {ogrenci.soyad}'.strip() if ogrenci else '',
        'sozlesme_no': sozlesme.sozlesme_no,
        'taksit_no': str(taksit.taksit_no),
        'vade_tarihi': vade,
        'kalan_tutar': f'{int(taksit.kalan_tutar or taksit.tutar):,}'.replace(',', '.'),
        'gecikme_gunu': str(gecikme_gunu(taksit)),
        'toplam_gecikmis_tutar': f'{int(toplam_gecikmis):,}'.replace(',', '.'),
        'kurum_ad': getattr(kurum, 'ad', '') if kurum else '',
    }


def _normalize_template_braces(body: str) -> str:
    """Frontend {var} → backend {{var}}."""
    import re
    return re.sub(r'(?<!\{)\{(\w+)\}(?!\})', r'{{\1}}', body or '')


def render_overdue_message(
    kurum_id: int,
    context: dict,
    *,
    fallback_body: str | None = None,
    template_body: str | None = None,
) -> str:
    from apps.communication.application.template_service import TemplateService
    from apps.communication.application.variable_resolver import resolve_variables

    if template_body:
        return resolve_variables(_normalize_template_braces(template_body), context)

    tpl = TemplateService().list_templates(
        kurum_id,
        category=CATEGORY_ODEME_GECIKME,
        active_only=True,
    ).first()
    if tpl and tpl.body:
        return resolve_variables(tpl.body, context)
    if fallback_body:
        return fallback_body
    return (
        f'Sayın {context.get("veli_ad", "velimiz")},\n\n'
        f'{context.get("ogrenci_ad")} için {context.get("taksit_no")}. taksit ödemeniz '
        f'vadesi geçmiş (vade: {context.get("vade_tarihi")}, kalan: {context.get("kalan_tutar")} TL).\n'
        f'Toplam gecikmiş tutar: {context.get("toplam_gecikmis_tutar")} TL.\n\n'
        f'Sözleşme No: {context.get("sozlesme_no")}\n'
        f'{context.get("kurum_ad", "3K Kampüs")}'
    )
