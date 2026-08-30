"""
Gider belge numaraları ve PDF üretimi.

Gider İşlem Belgesi ≠ tedarikçi faturası.
Ödeme Belgesi yalnızca gerçekleşmiş GiderOdeme için üretilir.
"""
from __future__ import annotations

from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone

from apps.finans.constants.gider_types import OdemeDurum
from apps.finans.domain.gider_ekli_belge import GiderEkliBelge
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_odeme import GiderOdeme


def _next_yearly_no(qs, field: str, prefix: str) -> str:
    """prefix-YYYY-000001 — yıl değişince 1'den başlar."""
    year = timezone.localdate().year
    full_prefix = f'{prefix}-{year}-'
    son = (
        qs.filter(**{f'{field}__startswith': full_prefix})
        .select_for_update()
        .order_by(f'-{field}')
        .values_list(field, flat=True)
        .first()
    )
    sira = 0
    if son:
        try:
            sira = int(str(son).split('-')[-1])
        except (ValueError, IndexError):
            sira = 0
    return f'{full_prefix}{sira + 1:06d}'


def generate_gider_islem_belge_no(kurum_id) -> str:
    qs = GiderKaydi.all_objects.filter(kurum_id=kurum_id)
    return _next_yearly_no(qs, 'islem_belge_no', 'GDR')


def generate_odeme_belge_no(kurum_id) -> str:
    qs = GiderOdeme.objects.filter(gider_kaydi__kurum_id=kurum_id)
    return _next_yearly_no(qs, 'odeme_belge_no', 'ODM')


ALLOWED_EK_EXT = {'.pdf', '.jpg', '.jpeg', '.png'}
MAX_EK_BYTES = 10 * 1024 * 1024


def serialize_ek(ek: GiderEkliBelge) -> dict:
    return {
        'id': ek.id,
        'dosya_adi': ek.dosya_adi,
        'dosya_turu': ek.dosya_turu,
        'dosya_turu_display': ek.get_dosya_turu_display(),
        'dosya_url': ek.dosya_url,
        'aciklama': ek.aciklama,
        'dosya_boyutu': ek.dosya_boyutu,
        'dosya_boyutu_fmt': ek.dosya_boyutu_fmt,
        'yukleyen_adi': (
            (ek.yukleyen.get_full_name() or ek.yukleyen.username)
            if ek.yukleyen_id else None
        ),
        'created_at': ek.created_at.isoformat() if ek.created_at else None,
        'sistem_belgesi_degil': True,
    }


def list_ekler(gider: GiderKaydi) -> list[dict]:
    items = [serialize_ek(e) for e in gider.ekli_belgeler.all()]
    if gider.belge:
        items.append({
            'id': None,
            'legacy': True,
            'dosya_adi': gider.belge.name.rsplit('/', 1)[-1],
            'dosya_turu': 'fatura_fis',
            'dosya_turu_display': 'Ekli Fatura / Fiş',
            'dosya_url': gider.belge.url,
            'aciklama': 'Eski kayıt belgesi',
            'dosya_boyutu': getattr(gider.belge, 'size', 0) or 0,
            'dosya_boyutu_fmt': '',
            'yukleyen_adi': None,
            'created_at': None,
            'sistem_belgesi_degil': True,
        })
    return items


@transaction.atomic
def ek_yukle(gider: GiderKaydi, dosya, *, yukleyen=None, aciklama='', dosya_turu='fatura_fis'):
    from pathlib import Path

    ad = getattr(dosya, 'name', 'belge') or 'belge'
    ext = Path(ad).suffix.lower()
    if ext not in ALLOWED_EK_EXT:
        return None, {'dosya': 'Yalnızca PDF, JPG ve PNG yüklenebilir.'}
    size = getattr(dosya, 'size', 0) or 0
    if size > MAX_EK_BYTES:
        return None, {'dosya': 'Dosya 10 MB sınırını aşıyor.'}

    obj = GiderEkliBelge.objects.create(
        gider_kaydi=gider,
        dosya=dosya,
        dosya_adi=ad,
        dosya_turu=dosya_turu or 'fatura_fis',
        aciklama=aciklama or '',
        dosya_boyutu=size,
        yukleyen=yukleyen,
    )
    return obj, None


def ek_sil(gider: GiderKaydi, ek_id: int):
    ek = GiderEkliBelge.objects.filter(pk=ek_id, gider_kaydi=gider).first()
    if not ek:
        return None, {'genel': 'Ekli belge bulunamadı.'}
    if ek.dosya:
        ek.dosya.delete(save=False)
    ek.delete()
    return True, None


def _pdf_response(pdf_bytes: bytes, filename: str) -> HttpResponse:
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="{filename}"'
    response['Content-Length'] = str(len(pdf_bytes))
    return response


def _html_response(html: str) -> HttpResponse:
    return HttpResponse(html, content_type='text/html; charset=utf-8')


def _render(html: str, filename: str, fmt: str):
    if fmt == 'html':
        return _html_response(html)
    from apps.communication.application.html_to_pdf import render_html_to_pdf
    from apps.finans.application.export.report_html_template import finans_report_footer_template

    pdf_bytes = render_html_to_pdf(
        html, landscape=False, footer_template=finans_report_footer_template(),
    )
    return _pdf_response(pdf_bytes, filename)


def gider_islem_belgesi(gider: GiderKaydi, *, fmt='pdf'):
    from apps.finans.application.export.gider_belge_html import build_gider_islem_belgesi_html

    html = build_gider_islem_belgesi_html(gider)
    no = gider.islem_belge_no or f'GDR-{gider.pk}'
    return _render(html, f'{no}.pdf', fmt)


def odeme_plani_belgesi(gider: GiderKaydi, *, fmt='pdf'):
    from apps.finans.application.export.gider_belge_html import build_odeme_plani_html

    html = build_odeme_plani_html(gider)
    no = gider.islem_belge_no or f'GDR-{gider.pk}'
    return _render(html, f'{no}-odeme-plani.pdf', fmt)


def odeme_belgesi(gider: GiderKaydi, odeme: GiderOdeme, *, fmt='pdf'):
    from apps.finans.application.export.gider_belge_html import build_odeme_belgesi_html

    if odeme.gider_kaydi_id != gider.pk:
        return None, {'genel': 'Ödeme bu gider kaydına ait değil.'}
    if odeme.durum != OdemeDurum.TAMAMLANDI:
        return None, {'genel': 'Ödeme belgesi yalnızca gerçekleşmiş ödemeler için oluşturulur.'}

    html = build_odeme_belgesi_html(gider, odeme)
    no = odeme.odeme_belge_no or f'ODM-{odeme.pk}'
    return _render(html, f'{no}.pdf', fmt), None
