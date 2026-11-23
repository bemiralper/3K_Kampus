"""
Veli Sınav Genel Durum Raporu — API görünüm katmanı.

Mevcut `student_exam_scope` ve `scoped_answers` yetki/izolasyon kontrollerini birebir kullanır:
  - POST /student-exams/<student_id>/parent-report/preview/
  - POST /student-exams/<student_id>/parent-report/pdf/
  - POST /student-exams/<student_id>/parent-report/send/
"""
from __future__ import annotations

import logging
from urllib.parse import quote

from django.http import HttpResponse
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.context import get_secili_egitim_yili_id

from ..services.parent_exam_report import (
    build_parent_exam_report_payload,
    parent_report_filename,
    send_parent_exam_report_whatsapp,
)
from ..services.parent_exam_report_pdf import (
    render_parent_exam_report_html,
    render_parent_exam_report_pdf,
)
from ..views import CsrfExemptSessionAuthentication
from .student_exam_views import scoped_answers, student_exam_scope

logger = logging.getLogger(__name__)


def _ascii_fallback_filename(name: str) -> str:
    table = str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosuCGIOSU')
    cleaned = name.translate(table)
    return ''.join(ch if ord(ch) < 128 else '-' for ch in cleaned) or 'veli-sinav-raporu.pdf'


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_parent_report_preview(request, student_id):
    """Veli Sınav Genel Durum Raporu JSON verisi + canlı editoryal HTML önizlemesi."""
    student, err = student_exam_scope(request, student_id)
    if err:
        return err

    answers_qs = scoped_answers(request, student)
    egitim_yili_id = get_secili_egitim_yili_id(request)
    raw_options = request.data if isinstance(request.data, dict) else {}

    payload = build_parent_exam_report_payload(
        student,
        answers_qs=answers_qs,
        raw_options=raw_options,
        egitim_yili_id=egitim_yili_id,
        user=request.user,
    )
    html = render_parent_exam_report_html(payload)
    filename = parent_report_filename(payload)

    return Response({
        'success': True,
        'data': {
            **payload,
            'html': html,
            'filename': filename,
        },
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_parent_report_pdf(request, student_id):
    """Veli Sınav Genel Durum Raporu vektörel A4 PDF indirir."""
    student, err = student_exam_scope(request, student_id)
    if err:
        return err

    answers_qs = scoped_answers(request, student)
    egitim_yili_id = get_secili_egitim_yili_id(request)
    raw_options = request.data if isinstance(request.data, dict) else {}

    payload = build_parent_exam_report_payload(
        student,
        answers_qs=answers_qs,
        raw_options=raw_options,
        egitim_yili_id=egitim_yili_id,
        user=request.user,
    )
    if not payload.get('tracks'):
        return Response(
            {'success': False, 'error': 'Seçilen kriterlerde raporlanacak sınav verisi bulunamadı.'},
            status=400,
        )

    try:
        pdf_bytes = render_parent_exam_report_pdf(payload)
    except Exception as exc:
        logger.exception('Parent exam report PDF render failed for student=%s', student_id)
        return Response(
            {'success': False, 'error': f'PDF oluşturulamadı: {exc}'},
            status=500,
        )

    filename = parent_report_filename(payload)
    ascii_name = _ascii_fallback_filename(filename)
    resp = HttpResponse(pdf_bytes, content_type='application/pdf')
    resp['Content-Disposition'] = (
        f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
    )
    return resp


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def student_parent_report_send(request, student_id):
    """Veli Sınav Genel Durum Raporu PDF'ini seçili velilere WhatsApp ile gönderir."""
    student, err = student_exam_scope(request, student_id)
    if err:
        return err

    body = request.data if isinstance(request.data, dict) else {}
    raw_ids = body.get('veli_ids') or []
    if not isinstance(raw_ids, list) or not raw_ids:
        return Response(
            {'success': False, 'error': 'En az bir veli seçilmelidir.'},
            status=400,
        )
    try:
        veli_ids = [int(x) for x in raw_ids]
    except (TypeError, ValueError):
        return Response(
            {'success': False, 'error': 'Geçersiz veli seçimi.'},
            status=400,
        )

    answers_qs = scoped_answers(request, student)
    egitim_yili_id = get_secili_egitim_yili_id(request)
    payload = build_parent_exam_report_payload(
        student,
        answers_qs=answers_qs,
        raw_options=body,
        egitim_yili_id=egitim_yili_id,
        user=request.user,
    )
    if not payload.get('tracks'):
        return Response(
            {'success': False, 'error': 'Seçilen kriterlerde raporlanacak sınav verisi bulunamadı.'},
            status=400,
        )

    try:
        pdf_bytes = render_parent_exam_report_pdf(payload)
    except Exception as exc:
        logger.exception('Parent exam report PDF render failed before WhatsApp send for student=%s', student_id)
        return Response(
            {'success': False, 'error': f'PDF oluşturulamadı: {exc}'},
            status=500,
        )

    filename = parent_report_filename(payload)
    try:
        result = send_parent_exam_report_whatsapp(
            student,
            payload=payload,
            pdf_bytes=pdf_bytes,
            filename=filename,
            veli_ids=veli_ids,
            custom_caption=str(body.get('whatsapp_caption') or ''),
            sent_by_user_id=getattr(request.user, 'id', None),
        )
    except ValueError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)

    return Response({'success': True, 'data': result})
