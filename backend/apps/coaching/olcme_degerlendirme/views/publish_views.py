"""Sınav yayın zamanlaması ve cevap anahtarı PDF."""
from urllib.parse import quote

from django.http import HttpResponse
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.coaching.application.olcme_publish import (
    KIND_ANSWER_KEY,
    KIND_KARNE,
    preview_publish_recipients,
    publish_status,
    send_now,
    set_schedule,
    sync_dispatches_from_exam,
)
from ..interfaces.sube_context import get_exam_or_response
from . import CsrfExemptSessionAuthentication


def _parse_when(raw):
    if not raw:
        return None
    value = parse_datetime(str(raw))
    if value is None:
        raise ValueError('Geçersiz tarih/saat.')
    from django.utils import timezone
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_publish_status(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    sync_dispatches_from_exam(exam)
    exam.refresh_from_db()
    return Response(publish_status(exam))


def _as_int_list(raw):
    if raw is None:
        return None
    if isinstance(raw, str):
        raw = [p.strip() for p in raw.split(',') if p.strip()]
    if not isinstance(raw, (list, tuple)):
        return None
    out = []
    for item in raw:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_publish_preview(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    kind = (request.query_params.get('kind') or '').strip()
    if kind not in (KIND_KARNE, KIND_ANSWER_KEY):
        return Response({'error': 'kind karne veya answer_key olmalı.'}, status=400)
    try:
        return Response(preview_publish_recipients(exam, kind))
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_publish_send_now(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    kind = (request.data.get('kind') or '').strip()
    if kind not in (KIND_KARNE, KIND_ANSWER_KEY):
        return Response({'error': 'kind karne veya answer_key olmalı.'}, status=400)
    try:
        result = send_now(
            exam,
            kind,
            sent_by_user_id=getattr(request.user, 'id', None),
            include_veli=request.data.get('include_veli', True) is not False,
            include_student=request.data.get('include_student', True) is not False,
            student_ids=_as_int_list(request.data.get('student_ids')),
            veli_ids=_as_int_list(request.data.get('veli_ids')),
            answer_ids=_as_int_list(request.data.get('answer_ids')),
        )
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    return Response({'ok': result.get('ok'), **result, 'dispatch': publish_status(exam)})


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_publish_reschedule(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    kind = (request.data.get('kind') or '').strip()
    if kind not in (KIND_KARNE, KIND_ANSWER_KEY):
        return Response({'error': 'kind karne veya answer_key olmalı.'}, status=400)
    try:
        when = _parse_when(request.data.get('scheduled_at'))
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    raw_enabled = request.data.get('is_enabled')
    if raw_enabled is None:
        is_enabled = False
    else:
        is_enabled = raw_enabled is True or str(raw_enabled).lower() in ('1', 'true', 'yes')
    try:
        set_schedule(exam, kind, is_enabled=is_enabled, scheduled_at=when)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    exam.refresh_from_db()
    return Response(publish_status(exam))


@api_view(['GET', 'POST', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated])
def exam_answer_key_pdf(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    from apps.coaching.application.olcme_cevap_anahtari_pdf import (
        cevap_anahtari_filename,
        parse_copies,
        render_cevap_anahtari_pdf,
    )

    if request.method == 'GET':
        from apps.coaching.olcme_degerlendirme.models import AnswerKeyItem

        download = request.query_params.get('download') == '1'
        has_uploaded = bool(exam.answer_key_pdf)
        can_generate = AnswerKeyItem.objects.filter(answer_key__exam=exam).exists()
        if not download:
            return Response({
                'has_uploaded': has_uploaded,
                'can_generate': can_generate,
                'filename': (
                    exam.answer_key_pdf.name.rsplit('/', 1)[-1]
                    if has_uploaded else cevap_anahtari_filename(exam)
                ),
            })
        copies = parse_copies(
            request.query_params.get('copies')
            or request.query_params.get('copies_per_page'),
        )
        booklet = (request.query_params.get('booklet') or '').strip().upper()
        booklets = [booklet] if booklet in ('A', 'B', 'C', 'D') else None
        force_generated = (
            request.query_params.get('source') == 'generated'
            or copies != 1
            or booklets is not None
        )
        try:
            if exam.answer_key_pdf and not force_generated:
                exam.answer_key_pdf.open('rb')
                data = exam.answer_key_pdf.read()
                exam.answer_key_pdf.close()
            else:
                data = render_cevap_anahtari_pdf(
                    exam, copies_per_page=copies, booklets=booklets,
                )
            name = cevap_anahtari_filename(exam)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=400)
        ascii_name = name.encode('ascii', 'ignore').decode('ascii') or 'cevap-anahtari.pdf'
        response = HttpResponse(data, content_type='application/pdf')
        response['Content-Disposition'] = (
            f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{quote(name)}'
        )
        return response

    if request.method == 'DELETE':
        if exam.answer_key_pdf:
            exam.answer_key_pdf.delete(save=False)
            exam.answer_key_pdf = None
            exam.save(update_fields=['answer_key_pdf', 'updated_at'])
        return Response({'ok': True, 'has_uploaded': False})

    upload = request.FILES.get('file') or request.FILES.get('pdf')
    if not upload:
        return Response({'error': 'PDF dosyası seçin.'}, status=400)
    raw = upload.read()
    if not raw.startswith(b'%PDF'):
        return Response({'error': 'Yalnızca PDF yüklenebilir.'}, status=400)
    upload.seek(0)
    if exam.answer_key_pdf:
        exam.answer_key_pdf.delete(save=False)
    exam.answer_key_pdf.save(upload.name, upload, save=True)
    return Response({'ok': True, 'has_uploaded': True, 'filename': exam.answer_key_pdf.name})
