"""Ödev plan/rapor PDF — gerçek React print route üzerinden."""
from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings

from apps.communication.application.html_to_pdf import render_url_to_pdf

from .print_token import create_print_token


def _pdf_base_url() -> str:
    """Backend Playwright'ın erişebileceği frontend tabanı (Docker: http://frontend:3000)."""
    return (
        getattr(settings, 'PDF_RENDER_BASE_URL', None)
        or getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    ).rstrip('/')


def _print_url(path: str, assignment_id: int, kurum_id: int, notify_type: str, orientation: str) -> str:
    token = create_print_token(assignment_id, kurum_id, notify_type=notify_type)
    params = urlencode({'token': token, 'orientation': orientation})
    return f'{_pdf_base_url()}{path.format(assignment_id=assignment_id)}?{params}'


def build_assignment_report_print_url(
    assignment_id: int,
    kurum_id: int,
    *,
    orientation: str = 'portrait',
) -> str:
    return _print_url(
        '/print/odev-kontrol/{assignment_id}/rapor',
        assignment_id,
        kurum_id,
        'report',
        orientation,
    )


def build_assignment_plan_print_url(
    assignment_id: int,
    kurum_id: int,
    *,
    orientation: str = 'portrait',
) -> str:
    return _print_url(
        '/print/odev-kontrol/{assignment_id}/plan',
        assignment_id,
        kurum_id,
        'plan',
        orientation,
    )


def render_assignment_report_pdf(
    assignment_id: int,
    kurum_id: int,
    *,
    orientation: str = 'portrait',
) -> bytes:
    url = build_assignment_report_print_url(
        assignment_id,
        kurum_id,
        orientation=orientation,
    )
    return render_url_to_pdf(
        url,
        landscape=(orientation == 'landscape'),
    )


def render_assignment_plan_pdf(
    assignment_id: int,
    kurum_id: int,
    *,
    orientation: str = 'portrait',
) -> bytes:
    url = build_assignment_plan_print_url(
        assignment_id,
        kurum_id,
        orientation=orientation,
    )
    return render_url_to_pdf(
        url,
        landscape=(orientation == 'landscape'),
    )
