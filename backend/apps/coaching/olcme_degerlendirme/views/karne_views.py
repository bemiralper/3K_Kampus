"""Ölçme karnesi PDF indirme ve WhatsApp gönderimi."""
from urllib.parse import quote

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.coaching.application.olcme_karne_notify import (
    preview_karne_notify,
    preview_to_dict,
    send_karne_notify,
    send_karne_notify_bulk,
    summarize_preview,
)
from apps.coaching.application.olcme_karne_pdf import (
    karne_filename,
    render_karne_pdf,
    render_karne_pdf_many,
)
from apps.coaching.olcme_degerlendirme.models import StudentAnswer
from apps.coaching.olcme_degerlendirme.views import CsrfExemptSessionAuthentication
from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _get_exam_or_404,
    _resolve_ranking_year,
    build_student_detail_payload,
)

MAX_BULK_KARNELER = 80


def _pdf_response(pdf_bytes: bytes, filename: str) -> HttpResponse:
    ascii_name = filename.encode('ascii', 'ignore').decode('ascii') or 'karne.pdf'
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = (
        f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(filename)}'
    )
    return response


def _load_answer(exam, answer_pk):
    try:
        return StudentAnswer.objects.select_related('student', 'session').prefetch_related(
            'section_scores__section',
        ).get(pk=answer_pk, session__exam=exam)
    except StudentAnswer.DoesNotExist:
        return None


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_karne_pdf(request, exam_pk, answer_pk):
    """Tek öğrenci orijinal karne PDF."""
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err
    answer = _load_answer(exam, answer_pk)
    if not answer:
        return Response({'error': 'Öğrenci cevabı bulunamadı.'}, status=404)
    ranking_year = _resolve_ranking_year(request, exam)
    data = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
    return _pdf_response(render_karne_pdf(data), karne_filename(data))


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_karneler_pdf(request, exam_pk):
    """Seçilen öğrencilerin karneleri — tek çok sayfalı PDF."""
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err

    raw_ids = (request.query_params.get('answer_ids') or '').strip()
    if not raw_ids:
        return Response({'error': 'answer_ids zorunludur.'}, status=400)
    try:
        answer_ids = [int(x) for x in raw_ids.split(',') if x.strip()]
    except ValueError:
        return Response({'error': 'answer_ids geçersiz.'}, status=400)
    if not answer_ids:
        return Response({'error': 'answer_ids zorunludur.'}, status=400)
    if len(answer_ids) > MAX_BULK_KARNELER:
        return Response(
            {'error': f'En fazla {MAX_BULK_KARNELER} karne indirilebilir.'},
            status=400,
        )

    ranking_year = _resolve_ranking_year(request, exam)
    answers = list(
        StudentAnswer.objects.select_related('student', 'session')
        .prefetch_related('section_scores__section')
        .filter(pk__in=answer_ids, session__exam=exam)
    )
    by_id = {a.id: a for a in answers}
    payloads = []
    for aid in answer_ids:
        answer = by_id.get(aid)
        if not answer:
            continue
        payloads.append(
            build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
        )
    if not payloads:
        return Response({'error': 'İndirilecek karne bulunamadı.'}, status=404)

    exam_slug = (exam.name or 'sinav').replace(' ', '_')[:40]
    filename = f'{exam_slug}_karneler.pdf'
    return _pdf_response(render_karne_pdf_many(payloads), filename)


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_karne_notify_preview(request, exam_pk, answer_pk):
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err
    answer = _load_answer(exam, answer_pk)
    if not answer:
        return Response({'success': False, 'error': 'Öğrenci cevabı bulunamadı.'}, status=404)
    ranking_year = _resolve_ranking_year(request, exam)
    karne = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
    preview = preview_karne_notify(exam.kurum_id, karne)
    preview.exam_id = exam.id
    preview.exam_name = exam.name
    return Response({'success': True, 'data': preview_to_dict(preview)})


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_karne_notify_send(request, exam_pk, answer_pk):
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err
    answer = _load_answer(exam, answer_pk)
    if not answer:
        return Response({'success': False, 'error': 'Öğrenci cevabı bulunamadı.'}, status=404)

    ranking_year = _resolve_ranking_year(request, exam)
    karne = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
    pdf_bytes = render_karne_pdf(karne)
    filename = karne_filename(karne)

    body = request.data or {}
    veli_ids = body.get('veli_ids') or []
    if not isinstance(veli_ids, list):
        return Response({'success': False, 'error': 'veli_ids liste olmalı.'}, status=400)
    try:
        veli_ids = [int(x) for x in veli_ids]
    except (TypeError, ValueError):
        return Response({'success': False, 'error': 'veli_ids geçersiz.'}, status=400)

    try:
        result = send_karne_notify(
            kurum_id=exam.kurum_id,
            exam_id=exam.id,
            answer_id=answer.id,
            karne=karne,
            pdf_bytes=pdf_bytes,
            filename=filename,
            veli_ids=veli_ids,
            include_student=bool(body.get('include_student')),
            sent_by_user_id=getattr(request.user, 'id', None),
            sube_id=exam.sube_id or getattr(answer.student, 'sube_id', None),
        )
    except ValueError as exc:
        return Response({'success': False, 'error': str(exc)}, status=400)

    return Response({'success': True, 'data': result})


def _parse_answer_ids(raw) -> tuple[list[int] | None, Response | None]:
    if isinstance(raw, list):
        values = raw
    elif isinstance(raw, str):
        values = [x for x in raw.split(',') if x.strip()]
    else:
        return None, Response({'success': False, 'error': 'answer_ids zorunludur.'}, status=400)
    try:
        answer_ids = [int(x) for x in values]
    except (TypeError, ValueError):
        return None, Response({'success': False, 'error': 'answer_ids geçersiz.'}, status=400)
    if not answer_ids:
        return None, Response({'success': False, 'error': 'answer_ids zorunludur.'}, status=400)
    if len(answer_ids) > MAX_BULK_KARNELER:
        return None, Response(
            {'success': False, 'error': f'En fazla {MAX_BULK_KARNELER} öğrenci seçilebilir.'},
            status=400,
        )
    return answer_ids, None


def _karne_stub(exam, answer) -> dict:
    if answer.student:
        name = f'{answer.student.ad} {answer.student.soyad}'.strip()
    else:
        name = answer.raw_student_name or answer.raw_student_id or 'Öğrenci'
    return {
        'answer_id': answer.id,
        'student_id': answer.student_id,
        'student_name': name,
        'exam_name': exam.name,
        'toplam_net': float(answer.total_net or 0),
        'puan': None,
    }


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_karne_notify_bulk_preview(request, exam_pk):
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err
    answer_ids, err = _parse_answer_ids(request.query_params.get('answer_ids'))
    if err:
        return err

    answers = list(
        StudentAnswer.objects.select_related('student')
        .filter(pk__in=answer_ids, session__exam=exam)
    )
    by_id = {a.id: a for a in answers}
    students = []
    sendable = 0
    for aid in answer_ids:
        answer = by_id.get(aid)
        if not answer:
            continue
        preview = preview_karne_notify(exam.kurum_id, _karne_stub(exam, answer))
        preview.exam_id = exam.id
        preview.exam_name = exam.name
        row = summarize_preview(preview)
        if not row['skip_reason']:
            sendable += 1
        students.append(row)

    from apps.coaching.application.olcme_publish import karne_schedule_active

    scheduled = karne_schedule_active(exam)
    return Response({
        'success': True,
        'data': {
            'exam_id': exam.id,
            'exam_name': exam.name,
            'students': students,
            'sendable': sendable,
            'total': len(students),
            'scheduled_warning': scheduled,
        },
    })


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_karne_notify_bulk_send(request, exam_pk):
    exam, err = _get_exam_or_404(request, exam_pk)
    if err:
        return err
    body = request.data or {}
    answer_ids, err = _parse_answer_ids(body.get('answer_ids'))
    if err:
        return err

    ranking_year = _resolve_ranking_year(request, exam)
    answers = list(
        StudentAnswer.objects.select_related('student', 'session')
        .prefetch_related('section_scores__section')
        .filter(pk__in=answer_ids, session__exam=exam)
    )
    by_id = {a.id: a for a in answers}
    items = []
    for aid in answer_ids:
        answer = by_id.get(aid)
        if not answer:
            continue
        karne = build_student_detail_payload(exam, answer, ranking_year, include_trend=False)
        items.append({
            'answer_id': answer.id,
            'karne': karne,
            'pdf_bytes': render_karne_pdf(karne),
            'filename': karne_filename(karne),
            'sube_id': exam.sube_id or getattr(answer.student, 'sube_id', None),
        })
    if not items:
        return Response({'success': False, 'error': 'Gönderilecek öğrenci bulunamadı.'}, status=404)

    from apps.coaching.application.olcme_publish import (
        KIND_KARNE,
        attach_publish_campaign,
        cancel_enabled_karne_schedule,
    )

    result = send_karne_notify_bulk(
        kurum_id=exam.kurum_id,
        exam_id=exam.id,
        items=items,
        include_veli=body.get('include_veli', True) is not False,
        include_student=bool(body.get('include_student', True)),
        sent_by_user_id=getattr(request.user, 'id', None),
        sube_id=exam.sube_id,
    )
    if result.get('sent'):
        result['schedule_cancelled'] = cancel_enabled_karne_schedule(exam)
        campaign = attach_publish_campaign(
            exam, KIND_KARNE, result.get('message_ids') or [],
            sent_by_user_id=getattr(request.user, 'id', None),
        )
        result['campaign_id'] = str(campaign.id)
    return Response({'success': True, 'data': result})
