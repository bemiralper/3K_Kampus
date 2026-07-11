"""Personel sözleşme belgesi PDF — sunucu HTML + Playwright (frontend çalışması gerekmez)."""
from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from apps.communication.application.html_to_pdf import render_html_to_pdf, render_url_to_pdf
from apps.personel.application.contract_pdf_html import build_personel_sozlesme_html
from apps.personel.application.print_token import DOC_PERSONEL_SOZLESME, create_print_token
from apps.personel.application.sozlesme_service import SozlesmeService
from apps.personel.interfaces.sozlesme_serializers import serialize_sozlesme


def build_personel_sozlesme_print_url(sozlesme_id: int, kurum_id: int) -> str:
    """Print önizleme (tarayıcı) — Next.js print route."""
    token = create_print_token(sozlesme_id, kurum_id, doc_type=DOC_PERSONEL_SOZLESME)
    params = urlencode({'token': token})
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}/print/personel/sozlesme/{sozlesme_id}?{params}'


def render_personel_sozlesme_pdf(sozlesme_id: int, kurum_id: int) -> bytes:
    """
    PDF indirme — backend HTML şablonu ile üretilir.
    Frontend (localhost:3000) çalışmasa da çalışır.
    """
    svc = SozlesmeService()
    sozlesme = svc.get(sozlesme_id)
    if not sozlesme:
        raise RuntimeError('Sözleşme bulunamadı.')

    payload = serialize_sozlesme(sozlesme)
    html_doc = build_personel_sozlesme_html(payload)
    return render_html_to_pdf(html_doc, landscape=False)


def render_personel_sozlesme_pdf_via_frontend(sozlesme_id: int, kurum_id: int) -> bytes:
    """Opsiyonel: React print route üzerinden (FRONTEND_URL erişilebilir olmalı)."""
    url = build_personel_sozlesme_print_url(sozlesme_id, kurum_id)
    return render_url_to_pdf(url, landscape=False)
