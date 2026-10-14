"""OMR yükleme, küçük gruplar halinde işleme, inceleme ve atomik onay."""
from __future__ import annotations

from copy import deepcopy
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from PIL import Image
from rest_framework.decorators import (
    api_view,
    authentication_classes,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.permissions import OlcmeModulePermission

from ..interfaces.sube_context import get_exam_or_response
from ..models import (
    ExamSession,
    OmrTaramaDosyasi,
    OmrTaramaOturumu,
    OmrTaramaSayfasi,
    OptikDaireSablon,
)
from ..services.daire_dizisi_raster import pdf_sayfa_mm, raster_gorsel, raster_pdf
from ..services.omr_engine import omr_oku
from ..services.result_import import import_normalized_rows
from ..views import CsrfExemptSessionAuthentication

MAX_FILE_BYTES = 250 * 1024 * 1024
MAX_JOB_BYTES = 600 * 1024 * 1024
MAX_JOB_PAGES = 600


def _job_dict(job, pages=False):
    data = {
        'id': job.id,
        'exam_id': job.exam_id,
        'sablon_id': job.sablon_id,
        'sablon_adi': job.sablon.ad,
        'page_width_mm': float(job.sablon.sayfa_genislik_mm),
        'page_height_mm': float(job.sablon.sayfa_yukseklik_mm),
        'status': job.status,
        'original_filenames': job.original_filenames,
        'total_pages': job.total_pages,
        'processed_pages': job.processed_pages,
        'error_pages': job.error_pages,
        'error_message': job.error_message,
        'result_session_id': job.result_session_id,
        'created_at': job.created_at,
        'updated_at': job.updated_at,
    }
    if pages:
        data['pages'] = [_page_dict(page) for page in job.sayfalar.all()]
    return data


def _page_dict(page):
    return {
        'id': page.id,
        'sequence': page.sequence,
        'original_filename': page.original_filename,
        'source_page': page.source_page,
        'status': page.status,
        'registration': page.registration,
        'decoded': page.decoded,
        'match_preview': (page.decoded or {}).get('_match') or {},
        'review': page.review,
        'confidence': page.confidence,
        'warnings': page.warnings,
        'critical_warnings': page.critical_warnings,
        'error_message': page.error_message,
        'image_url': f'/api/coaching/olcme-degerlendirme/omr/pages/{page.id}/image/' if page.image else '',
    }


def _load_job(request, exam_pk, job_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return None, None, err
    job = (
        OmrTaramaOturumu.objects
        .select_related('sablon', 'exam')
        .filter(pk=job_pk, exam=exam)
        .first()
    )
    if job is None:
        return exam, None, Response({'error': 'OMR tarama oturumu bulunamadı.'}, status=404)
    return exam, job, None


def _upload_kind(upload):
    if upload.size > MAX_FILE_BYTES:
        raise ValueError(f'{upload.name}: dosya {MAX_FILE_BYTES // (1024 * 1024)} MB sınırını aşıyor.')
    raw = upload.read()
    upload.seek(0)
    name = (upload.name or '').lower()
    if raw.startswith(b'%PDF') or name.endswith('.pdf'):
        if not raw.startswith(b'%PDF'):
            raise ValueError(f'{upload.name}: geçerli PDF değil.')
        return 'pdf', raw
    if raw.startswith(b'\x89PNG') or name.endswith('.png'):
        return 'png', raw
    if raw.startswith(b'\xff\xd8') or name.endswith(('.jpg', '.jpeg')):
        return 'jpg', raw
    raise ValueError(f'{upload.name}: yalnız PDF, PNG veya JPG yüklenebilir.')


def _as_png(info):
    image = Image.open(BytesIO(info['png'])).convert('RGB')
    output = BytesIO()
    image.save(output, format='PNG')
    return output.getvalue()


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
@parser_classes([MultiPartParser, FormParser])
def omr_jobs(request, exam_pk):
    exam, err = get_exam_or_response(request, exam_pk)
    if err:
        return err
    if request.method == 'GET':
        jobs = (
            OmrTaramaOturumu.objects
            .filter(exam=exam)
            .select_related('sablon')
            .order_by('-created_at')
        )
        return Response([_job_dict(job) for job in jobs])
    try:
        sablon_id = int(request.data.get('sablon_id'))
    except (TypeError, ValueError):
        return Response({'error': 'Daire şablonu seçin.'}, status=400)
    sablon = OptikDaireSablon.objects.filter(
        pk=sablon_id, kurum_id=exam.kurum_id, aktif=True,
    ).first()
    if sablon is None:
        return Response({'error': 'Daire şablonu bulunamadı.'}, status=404)
    uploads = request.FILES.getlist('files') or request.FILES.getlist('dosyalar')
    if not uploads:
        return Response({'error': 'En az bir PDF, PNG veya JPG seçin.'}, status=400)
    sources = []
    total_pages = 0
    total_bytes = 0
    try:
        for upload in uploads:
            kind, raw = _upload_kind(upload)
            total_bytes += len(raw)
            if total_bytes > MAX_JOB_BYTES:
                raise ValueError(f'Tarama oturumu toplam {MAX_JOB_BYTES // (1024 * 1024)} MB sınırını aşıyor.')
            count = pdf_sayfa_mm(raw, 1)[2] if kind == 'pdf' else 1
            total_pages += count
            sources.append((upload.name, kind, raw, count))
            if total_pages > MAX_JOB_PAGES:
                raise ValueError(f'Bir tarama oturumunda en fazla {MAX_JOB_PAGES} sayfa olabilir.')
    except (ValueError, OSError) as exc:
        return Response({'error': str(exc)}, status=400)

    with transaction.atomic():
        job = OmrTaramaOturumu.objects.create(
            exam=exam,
            sablon=sablon,
            original_filenames=[upload.name for upload in uploads],
            total_pages=total_pages,
            uploaded_by=request.user,
        )
        page_sequence = 1
        for source_sequence, (filename, kind, raw, count) in enumerate(sources, start=1):
            source = OmrTaramaDosyasi(
                job=job,
                sequence=source_sequence,
                original_filename=filename[:255],
                kind=kind,
                page_count=count,
            )
            source.file.save(filename, ContentFile(raw), save=True)
            for source_page in range(1, count + 1):
                OmrTaramaSayfasi.objects.create(
                    job=job,
                    source_file=source,
                    sequence=page_sequence,
                    original_filename=filename[:255],
                    source_page=source_page,
                )
                page_sequence += 1
    return Response(_job_dict(job, pages=True), status=201)


@api_view(['GET', 'DELETE'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def omr_job_detail(request, exam_pk, job_pk):
    _exam, job, err = _load_job(request, exam_pk, job_pk)
    if err:
        return err
    if request.method == 'DELETE':
        if job.result_session_id:
            return Response({'error': 'Onaylanmış OMR oturumu silinemez.'}, status=400)
        for page in job.sayfalar.all():
            if page.image:
                page.image.delete(save=False)
        for source in job.kaynaklar.all():
            source.file.delete(save=False)
        job.delete()
        return Response(status=204)
    return Response(_job_dict(job, pages=True))


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def omr_process(request, exam_pk, job_pk):
    _exam, job, err = _load_job(request, exam_pk, job_pk)
    if err:
        return err
    if job.status == OmrTaramaOturumu.Status.CONFIRMED:
        return Response({'error': 'Onaylanmış tarama yeniden işlenemez.'}, status=400)
    try:
        batch_size = max(1, min(10, int(request.data.get('batch_size') or 4)))
    except (TypeError, ValueError):
        return Response({'error': 'Grup boyutu geçersiz.'}, status=400)
    pages = list(job.sayfalar.filter(
        status__in=[OmrTaramaSayfasi.Status.PENDING, OmrTaramaSayfasi.Status.ERROR],
    ).order_by('sequence')[:batch_size])
    job.status = OmrTaramaOturumu.Status.PROCESSING
    job.save(update_fields=['status', 'updated_at'])
    belge = job.sablon.belge or {}
    for page in pages:
        page.status = OmrTaramaSayfasi.Status.PROCESSING
        page.save(update_fields=['status', 'updated_at'])
        try:
            if not page.image:
                source = page.source_file
                if source is None or not source.file:
                    raise ValueError('Tarama kaynak dosyası bulunamadı.')
                source.file.open('rb')
                try:
                    source_raw = source.file.read()
                finally:
                    source.file.close()
                info = raster_pdf(source_raw, page.source_page) if source.kind == 'pdf' else raster_gorsel(source_raw)
                page.image.save(f'page-{page.sequence}.png', ContentFile(_as_png(info)), save=True)
            page.image.open('rb')
            raw = page.image.read()
            result = omr_oku(
                raw,
                belge,
                float(job.sablon.sayfa_genislik_mm),
                float(job.sablon.sayfa_yukseklik_mm),
            )
            page.registration = {
                **result['registration'],
                'overlay': result['overlay'],
            }
            page.decoded = result['decoded']
            page.confidence = result['confidence']
            page.warnings = result['warnings']
            page.critical_warnings = result['critical_warnings']
            page.error_message = ''
            # Okuma ne kadar güvenli görünürse görünsün, sonuçlara aktarılmadan
            # önce operatör her sayfayı açıkça onaylamalıdır.
            page.status = OmrTaramaSayfasi.Status.REVIEW
        except Exception as exc:
            page.status = OmrTaramaSayfasi.Status.ERROR
            page.error_message = str(exc)
        finally:
            page.image.close()
        page.save()
    pending = job.sayfalar.filter(
        status__in=[OmrTaramaSayfasi.Status.PENDING, OmrTaramaSayfasi.Status.PROCESSING],
    ).count()
    job.processed_pages = job.sayfalar.exclude(
        status=OmrTaramaSayfasi.Status.PENDING,
    ).exclude(status=OmrTaramaSayfasi.Status.PROCESSING).count()
    job.error_pages = job.sayfalar.filter(status=OmrTaramaSayfasi.Status.ERROR).count()
    job.status = OmrTaramaOturumu.Status.PROCESSING if pending else OmrTaramaOturumu.Status.REVIEW
    job.save(update_fields=['processed_pages', 'error_pages', 'status', 'updated_at'])
    _refresh_match_previews(job)
    return Response(_job_dict(job, pages=True))


@api_view(['PATCH'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def omr_page_review(request, exam_pk, job_pk, page_pk):
    _exam, job, err = _load_job(request, exam_pk, job_pk)
    if err:
        return err
    if job.status == OmrTaramaOturumu.Status.CONFIRMED:
        return Response({'error': 'Onaylanmış tarama değiştirilemez.'}, status=400)
    page = job.sayfalar.filter(pk=page_pk).first()
    if page is None:
        return Response({'error': 'OMR sayfası bulunamadı.'}, status=404)
    review = request.data.get('review')
    if not isinstance(review, dict):
        return Response({'error': 'İnceleme düzeltmeleri nesne olmalıdır.'}, status=400)
    page.review = review
    page.reviewed_by = request.user
    page.reviewed_at = timezone.now()
    page.status = OmrTaramaSayfasi.Status.READY if review.get('approved') else OmrTaramaSayfasi.Status.REVIEW
    page.save(update_fields=['review', 'reviewed_by', 'reviewed_at', 'status', 'updated_at'])
    _refresh_match_previews(job)
    page.refresh_from_db()
    return Response(_page_dict(page))


def _effective_row(page):
    decoded = deepcopy(page.decoded or {})
    review = page.review or {}
    values = review.get('values') if isinstance(review.get('values'), dict) else {}
    decoded.update({key: value for key, value in values.items() if key != 'cevaplar'})
    if isinstance(values.get('cevaplar'), dict):
        decoded['cevaplar'] = {**(decoded.get('cevaplar') or {}), **values['cevaplar']}
    return decoded


def _refresh_match_previews(job):
    """Sonuç yazmadan, inceleme ekranı için öğrenci eşleşmesini hesaplar."""
    from ..views.result_views import _build_student_pool, _match_student

    by_tc, by_number, students = _build_student_pool(job.exam.kurum_id, job.exam.sube_id)
    used = set()
    for page in job.sayfalar.exclude(status=OmrTaramaSayfasi.Status.ERROR).order_by('sequence'):
        row = _effective_row(page)
        tc = str(row.get('tc') or row.get('tc_kimlik') or '').strip()
        number = str(row.get('ogrenci_no') or row.get('numara') or '').strip()
        name = str(row.get('ad_soyad') or '').strip()
        student, score, method = _match_student(
            tc, number, name, by_tc, by_number, students, used,
        )
        decoded = dict(page.decoded or {})
        decoded['_match'] = {
            'student_id': student.pk if student else None,
            'student_name': f'{student.ad} {student.soyad}' if student else '',
            'score': score,
            'method': method,
        }
        page.decoded = decoded
        page.save(update_fields=['decoded', 'updated_at'])


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def omr_confirm(request, exam_pk, job_pk):
    exam, job, err = _load_job(request, exam_pk, job_pk)
    if err:
        return err
    if job.result_session_id:
        return Response({'error': 'Bu tarama daha önce onaylandı.'}, status=400)
    pages = list(job.sayfalar.all())
    if not pages or any(page.status in (OmrTaramaSayfasi.Status.PENDING, OmrTaramaSayfasi.Status.PROCESSING, OmrTaramaSayfasi.Status.ERROR) for page in pages):
        return Response({'error': 'Tüm sayfalar başarıyla işlenmeden onaylanamaz.'}, status=400)
    unresolved = [
        page.sequence for page in pages
        if page.status != OmrTaramaSayfasi.Status.READY
        or not (page.review or {}).get('approved')
    ]
    if unresolved:
        return Response({'error': f'Tüm sayfaları inceleyip onaylayın: {", ".join(map(str, unresolved))}'}, status=400)
    try:
        with transaction.atomic():
            session = ExamSession.objects.create(
                exam=exam,
                source_type=ExamSession.SourceType.OMR,
                original_filename=', '.join(job.original_filenames)[:255],
                status=ExamSession.Status.PROCESSING,
                uploaded_by=request.user,
            )
            answers = import_normalized_rows(exam, session, [_effective_row(page) for page in pages])
            matched = sum(1 for answer in answers if answer.student_id)
            session.status = ExamSession.Status.COMPLETED
            session.total_rows = len(answers)
            session.matched_count = matched
            session.unmatched_count = len(answers) - matched
            session.save()
            job.result_session = session
            job.status = OmrTaramaOturumu.Status.CONFIRMED
            job.confirmed_by = request.user
            job.confirmed_at = timezone.now()
            job.save(update_fields=['result_session', 'status', 'confirmed_by', 'confirmed_at', 'updated_at'])
            if exam.status in ('DRAFT', 'ANSWER_KEY_READY'):
                exam.status = 'RESULTS_UPLOADED'
                exam.save(update_fields=['status'])
        from ..services.stored_scores import refresh_exam_scores
        refresh_exam_scores(exam)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    return Response(_job_dict(job, pages=True))


@api_view(['GET'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def omr_page_image(request, page_pk):
    page = OmrTaramaSayfasi.objects.select_related('job__exam').filter(pk=page_pk).first()
    if page is None:
        return Response({'error': 'OMR sayfası bulunamadı.'}, status=404)
    exam, err = get_exam_or_response(request, page.job.exam_id)
    if err or exam.pk != page.job.exam_id:
        return err or Response({'error': 'OMR sayfası bulunamadı.'}, status=404)
    if not page.image:
        return Response({'error': 'OMR sayfası henüz işlenmedi.'}, status=404)
    page.image.open('rb')
    try:
        data = page.image.read()
    finally:
        page.image.close()
    return HttpResponse(data, content_type='image/png')
