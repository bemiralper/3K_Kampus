"""Ödeme planı / makbuz / sözleşme PDF — React print route üzerinden."""
from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from apps.communication.application.html_to_pdf import render_url_to_pdf

from .print_token import DOC_MAKBUZ, DOC_PLAN, DOC_SOZLESME, create_print_token


def _print_url(path: str, entity_id: int, kurum_id: int, doc_type: str) -> str:
    token = create_print_token(entity_id, kurum_id, doc_type=doc_type)
    params = urlencode({'token': token})
    base = settings.FRONTEND_URL.rstrip('/')
    return f'{base}{path.format(entity_id=entity_id)}?{params}'


def build_odeme_plan_print_url(sozlesme_id: int, kurum_id: int) -> str:
    return _print_url(
        '/print/odeme-takip/plan/{entity_id}',
        sozlesme_id,
        kurum_id,
        DOC_PLAN,
    )


def build_makbuz_print_url(tahsilat_id: int, kurum_id: int) -> str:
    return _print_url(
        '/print/odeme-takip/makbuz/{entity_id}',
        tahsilat_id,
        kurum_id,
        DOC_MAKBUZ,
    )


def build_sozlesme_print_url(sozlesme_id: int, kurum_id: int) -> str:
    return _print_url(
        '/print/odeme-takip/sozlesme/{entity_id}',
        sozlesme_id,
        kurum_id,
        DOC_SOZLESME,
    )


def render_odeme_plan_pdf(sozlesme_id: int, kurum_id: int) -> bytes:
    url = build_odeme_plan_print_url(sozlesme_id, kurum_id)
    return render_url_to_pdf(url, landscape=False)


def render_makbuz_pdf(tahsilat_id: int, kurum_id: int) -> bytes:
    url = build_makbuz_print_url(tahsilat_id, kurum_id)
    return render_url_to_pdf(url, landscape=False)


def render_sozlesme_pdf(sozlesme_id: int, kurum_id: int) -> bytes:
    url = build_sozlesme_print_url(sozlesme_id, kurum_id)
    return render_url_to_pdf(url, landscape=False)
