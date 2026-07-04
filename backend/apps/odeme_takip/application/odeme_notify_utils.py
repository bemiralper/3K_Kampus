"""Ödeme belgesi WhatsApp mesaj metinleri ve PDF dosya adları."""
from __future__ import annotations

import re

from apps.odeme_takip.domain.models import Sozlesme, Tahsilat

NOTIFY_PLAN = 'plan'
NOTIFY_MAKBUZ = 'makbuz'
NOTIFY_SOZLESME = 'sozlesme'

_TYPE_LABELS = {
    NOTIFY_PLAN: 'Ödeme Planı',
    NOTIFY_MAKBUZ: 'Tahsilat Makbuzu',
    NOTIFY_SOZLESME: 'Sözleşme Belgesi',
}


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r'[^\w\s-]', '', (value or '').strip(), flags=re.UNICODE)
    cleaned = re.sub(r'[\s_]+', '-', cleaned).strip('-')
    return cleaned or 'Belge'


def pdf_title_label(notify_type: str) -> str:
    return _TYPE_LABELS.get(notify_type, 'Ödeme Belgesi')


def build_sozlesme_pdf_filename(sozlesme: Sozlesme, notify_type: str) -> str:
    ogrenci = sozlesme.ogrenci
    ad = _safe_filename_part(f'{ogrenci.ad}-{ogrenci.soyad}' if ogrenci else 'Ogrenci')
    if notify_type == NOTIFY_PLAN:
        return f'{ad}-Odeme-Plani.pdf'
    if notify_type == NOTIFY_SOZLESME:
        return f'{ad}-Sozlesme.pdf'
    return f'{ad}-Odeme-Belgesi.pdf'


def build_makbuz_pdf_filename(tahsilat: Tahsilat) -> str:
    sz = tahsilat.sozlesme
    ogrenci = sz.ogrenci if sz else None
    ad = _safe_filename_part(f'{ogrenci.ad}-{ogrenci.soyad}' if ogrenci else 'Ogrenci')
    makbuz = tahsilat.referans_no or f'MKB-{tahsilat.id}'
    makbuz_part = _safe_filename_part(str(makbuz))
    return f'{ad}-Tahsilat-Makbuzu-{makbuz_part}.pdf'


def build_pdf_attachment_message(
    *,
    notify_type: str,
    ogrenci_ad: str,
    sozlesme_no: str,
    for_veli: bool,
    kurum_ad: str = '',
    extra_line: str = '',
) -> str:
    doc_label = pdf_title_label(notify_type)
    greeting = 'Sayın velimiz,' if for_veli else f'Merhaba,'
    lines = [
        greeting,
        '',
        f'{ogrenci_ad} için {doc_label.lower()} ektedir.',
        f'Sözleşme No: {sozlesme_no}',
    ]
    if extra_line:
        lines.append(extra_line)
    if kurum_ad:
        lines.extend(['', kurum_ad])
    else:
        lines.extend(['', '3K Kampüs'])
    return '\n'.join(lines)
