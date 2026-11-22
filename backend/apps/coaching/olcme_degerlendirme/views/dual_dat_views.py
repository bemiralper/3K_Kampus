"""LGS için iki kaynaklı DAT yükleme, önizleme ve onay."""
import hashlib
import json

from django.core import signing
from django.db import transaction
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from shared.permissions import OlcmeModulePermission

from ..interfaces.sube_context import assert_olcme_exam_access, get_exam_or_response
from ..models import AnswerKey, Exam, ExamSession, StudentAnswer, StudentSectionScore
from ..serializers.result import ExamSessionListSerializer
from ..services.dat_realign import CURRENT_ALIGN_VERSION, _correct_maps
from ..services.dual_dat import PARTS, part_sections, prepare_pairs, read_lines, validate_layout
from ..services.dual_dat_reference import canonical_answers, read_reference
from ..services.stored_scores import refresh_exam_scores
from ..services.student_matching import StudentRec
from ..views import CsrfExemptSessionAuthentication
from .result_views import _build_student_pool, _score_answers

PREVIEW_SALT = 'olcme.dual_dat.preview'


def _branch_pool(exam):
    """Tek DAT ile aynı havuz: şubedeki aktif öğrenciler. Sınav katılımcı listesi eşleştirmeyi daraltmaz."""
    from apps.ogrenci.domain.models import OgrenciKayit

    _by_tc, by_no, students = _build_student_pool(exam.kurum_id, exam.sube_id)
    number_by_student = {}
    for number, student in by_no.items():
        number_by_student.setdefault(student.pk, number)
    class_name = {}
    registrations = OgrenciKayit.objects.filter(
        ogrenci_id__in=[student.pk for student in students], aktif_mi=True,
    ).select_related('sinif')
    for registration in registrations:
        class_name.setdefault(registration.ogrenci_id, getattr(getattr(registration, 'sinif', None), 'ad', '') or '')
    return [
        StudentRec(
            pk=student.pk, ad=student.ad or '', soyad=student.soyad or '',
            tc=(student.tc_kimlik_no or '').strip(),
            okul_no=number_by_student.get(student.pk, ''),
            sinif=class_name.get(student.pk, ''),
        )
        for student in students
    ]


def _sections(exam):
    return list(exam.sections.filter(is_sub_section=False).order_by('question_start'))


def _exam(request, exam_pk):
    exam, error = get_exam_or_response(request, exam_pk)
    if not error and exam.exam_type != 'LGS':
        error = Response({'error': 'İki DAT yüklemesi LGS sınavlarında kullanılabilir.'}, status=400)
    return exam, error


def _file_data(lines_by_part, sections):
    return {
        part: {
            'lines': lines[:10],
            'total_rows': len(lines),
            'sections': [
                {'id': section.pk, 'name': section.name, 'width': section.question_end - section.question_start + 1}
                for section in part_sections(sections, part)
            ],
        }
        for part, lines in lines_by_part.items()
    }


@api_view(['POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def upload_dual_dat(request, exam_pk):
    exam, error = _exam(request, exam_pk)
    if error:
        return error
    uploads = {part: request.FILES.get(part) for part in PARTS}
    if any(not file or not file.name.lower().endswith('.dat') for file in uploads.values()):
        return Response({'error': 'Sözel ve sayısal DAT dosyalarını seçin.'}, status=400)
    sections = _sections(exam)
    reference_file = request.FILES.get('booklet_reference')
    reference = None
    try:
        validate_layout(sections)
        lines = {part: read_lines(file) for part, file in uploads.items()}
        if lines['verbal'] == lines['numeric']:
            raise ValueError('Sözel ve sayısal için farklı dosyalar seçin.')
        if reference_file:
            reference = read_reference(reference_file, sections)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)

    for file in uploads.values():
        file.seek(0)
    session = ExamSession(
        exam=exam, dat_file=uploads['verbal'], numeric_dat_file=uploads['numeric'],
        original_filename=f"{uploads['verbal'].name} + {uploads['numeric'].name}"[:255],
        uploaded_by=request.user, align_version=CURRENT_ALIGN_VERSION,
        dual_dat_settings={'booklet_reference': reference} if reference else {},
    )
    try:
        session.save()
    except Exception:
        for file in (session.dat_file, session.numeric_dat_file):
            if file and file._committed:
                file.delete(save=False)
        raise
    return Response({
        'session': ExamSessionListSerializer(session).data,
        'files': _file_data(lines, sections),
        'settings': {}, 'has_booklet_reference': bool(reference),
    }, status=201)


def _preview_digest(request, session, settings, lines, sections, rows, maps):
    payload = [
        request.user.pk, session.pk, session.updated_at.isoformat(), settings, lines,
        [(sec.pk, sec.question_start, sec.question_end) for sec in sections], rows,
        maps, session.exam.wrong_answer_count, session.exam.per_section_penalty,
    ]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def _booklet_map(exam, booklet):
    key = AnswerKey.objects.filter(exam=exam, booklet=booklet).prefetch_related('items').first()
    if not key or not key.items.exists():
        return None
    mapped = {}
    for item in key.items.all():
        answer = (item.correct_answer or '').strip().upper()
        if answer in ('', 'EMPTY'):
            continue
        mapped[item.question_number] = {
            'answer': 'A' if answer == 'INVALID' else answer,
            'is_cancelled': item.is_cancelled or answer == 'INVALID',
            'section_id': item.section_id,
        }
    return mapped or None


def _scoring_maps(exam, booklets, reference):
    needs_a = bool(booklets & {'A', 'B'}) or bool(reference and booklets & {'C', 'D'})
    a = AnswerKey.objects.filter(exam=exam, booklet__in=['', 'A']).order_by('-booklet').first()
    if needs_a and (not a or not a.items.exists()):
        raise ValueError('Sınavın A cevap anahtarı gerekli.')
    maps = _correct_maps(exam, answer_key=a, align=False) if a else None
    if needs_a and not maps:
        raise ValueError('Önce sınavın cevap anahtarını girin.')
    if reference and maps:
        a_key = maps[0]
        if any(
            a_key.get(int(number), {}).get('answer', '').strip().upper() != answer
            for number, answer in reference['answers'].items()
        ):
            raise ValueError('Excel’deki A cevapları sınavın cevap anahtarıyla uyuşmuyor.')
    cd_maps = {booklet: _booklet_map(exam, booklet) for booklet in ('C', 'D') if booklet in booklets}
    for booklet, booklet_map in cd_maps.items():
        if reference:
            continue
        if not booklet_map:
            raise ValueError(f'{booklet} kitapçığı için cevap anahtarı ya da Excel karşılığı yok.')
        missing = next((number for number in range(1, 91) if number not in booklet_map), None)
        if missing:
            raise ValueError(f'{booklet} kitapçığında {missing}. soru anahtarı eksik.')
    return maps, cd_maps


def _save_pairs(session, settings, pairs, sections, maps, cd_maps, reference):
    exam = session.exam
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('question_start'))
    session.student_answers.all().delete()
    for student_id, verbal, numeric in pairs:
        raw_answers = verbal.answers + numeric.answers
        booklet = verbal.booklet
        active_maps = maps
        if booklet in ('C', 'D') and reference:
            raw_answers = canonical_answers(raw_answers, reference[booklet])
            booklet = 'A'
        elif booklet in ('C', 'D') and cd_maps.get(booklet):
            active_maps = (cd_maps[booklet], {}, {})
            booklet = 'A'
        answers, comparison, scores, totals = _score_answers(
            raw_answers, 90, booklet, *active_maps,
            sections, exam.wrong_answer_count, sub_sections, exam.per_section_penalty,
        )
        correct, wrong, empty, net = totals
        student_answer = StudentAnswer.objects.create(
            session=session, student_id=student_id,
            raw_student_id=(verbal.school_no or numeric.school_no or verbal.tc or numeric.tc or str(verbal.number))[:50],
            raw_student_name=(verbal.name or numeric.name)[:200],
            raw_tc_kimlik=(verbal.tc or numeric.tc)[:20],
            booklet=verbal.booklet, answers=answers, comparison=comparison,
            total_correct=correct, total_wrong=wrong, total_empty=empty, total_net=net,
            match_score=1, match_method=(
                'manual' if any(
                    'student_id' in settings.get('overrides', {}).get(part, {}).get(str(row.number), {})
                    for part, row in (('verbal', verbal), ('numeric', numeric))
                ) else 'dual_dat'
            ),
            is_processed=True,
        )
        StudentSectionScore.objects.bulk_create([
            StudentSectionScore(student_answer=student_answer, section_id=section_id, **score)
            for section_id, score in scores.items()
        ])

    session.dual_dat_settings = {
        **{key: settings[key] for key in PARTS},
        'overrides': settings.get('overrides', {}),
        'booklet_reference': reference,
    }
    session.status = ExamSession.Status.COMPLETED
    session.total_rows = session.matched_count = len(pairs)
    session.unmatched_count = 0
    session.save()
    if exam.status in ('DRAFT', 'ANSWER_KEY_READY'):
        exam.status = 'RESULTS_UPLOADED'
        exam.save(update_fields=['status'])
    refresh_exam_scores(exam)


@api_view(['GET', 'POST'])
@authentication_classes([CsrfExemptSessionAuthentication])
@permission_classes([IsAuthenticated, OlcmeModulePermission])
def dual_dat_session(request, exam_pk, session_pk):
    exam, error = _exam(request, exam_pk)
    if error:
        return error

    try:
        if request.method == 'POST' and not isinstance(request.data, dict):
            raise ValueError('İki DAT ayarları geçersiz.')
        if request.method == 'POST' and request.data.get('preview_token'):
            with transaction.atomic():
                exam = Exam.objects.select_for_update().get(pk=exam.pk, is_active=True, exam_type='LGS')
                error = assert_olcme_exam_access(request, exam)
                return error if error else _process(request, exam, session_pk, confirm=True)
        return _process(request, exam, session_pk)
    except (Exam.DoesNotExist, ExamSession.DoesNotExist):
        return Response({'error': 'İki DAT yüklemesi bulunamadı.'}, status=404)
    except ValueError as exc:
        return Response({'error': str(exc)}, status=400)
    except OSError:
        return Response({'error': 'Yüklemenin kaynak dosyaları okunamadı.'}, status=400)


def _process(request, exam, session_pk, confirm=False):
    sessions = ExamSession.objects.filter(exam=exam).exclude(numeric_dat_file='')
    session = (sessions.select_for_update() if confirm else sessions).get(pk=session_pk)
    sections = _sections(exam)
    lines = {}
    for part, file in (('verbal', session.dat_file), ('numeric', session.numeric_dat_file)):
        with file.open('rb') as source:
            lines[part] = read_lines(source)
    if request.method == 'GET':
        return Response({
            'session': ExamSessionListSerializer(session).data,
            'files': _file_data(lines, sections),
            'settings': {key: value for key, value in session.dual_dat_settings.items() if key != 'booklet_reference'},
            'has_booklet_reference': bool(session.dual_dat_settings.get('booklet_reference')),
        })
    settings = request.data.get('settings')
    pool = _branch_pool(exam)
    taken = set(StudentAnswer.objects.filter(
        session__exam=exam, student_id__isnull=False,
    ).exclude(session=session).values_list('student_id', flat=True))
    reference = session.dual_dat_settings.get('booklet_reference')
    keyed = [
        booklet for booklet in ('C', 'D')
        if AnswerKey.objects.filter(exam=exam, booklet=booklet, items__isnull=False).exists()
    ]
    pairs, rows = prepare_pairs(
        lines, sections, settings, pool, taken, reference=reference, keyed_booklets=keyed,
    )
    unresolved = sum(bool(row['issue']) for optical_rows in rows.values() for row in optical_rows)
    can_confirm = bool(pairs) and unresolved == 0
    scoring_error = None
    maps = cd_maps = None
    if can_confirm:
        try:
            maps, cd_maps = _scoring_maps(exam, {verbal.booklet for _, verbal, _ in pairs}, reference)
        except ValueError as exc:
            scoring_error = str(exc)
    digest = _preview_digest(request, session, settings, lines, sections, rows, {'maps': maps, 'cd_maps': cd_maps}) if maps or cd_maps else None
    if not confirm:
        return Response({
            'rows': rows, 'pair_count': len(pairs), 'unresolved_count': unresolved,
            'students': [
                {'id': student.pk, 'name': student.full_name, 'school_no': student.okul_no, 'class_name': student.sinif}
                for student in sorted(pool, key=lambda student: (student.full_name, student.pk))
                if student.pk not in taken
            ],
            'scoring_error': scoring_error,
            'preview_token': signing.dumps(digest, salt=PREVIEW_SALT) if digest else None,
        })
    try:
        previous_digest = signing.loads(request.data['preview_token'], salt=PREVIEW_SALT, max_age=1800)
    except (signing.BadSignature, TypeError, AttributeError):
        previous_digest = None
    if not digest or digest != previous_digest:
        return Response({'error': 'Önizleme güncel değil. Yeniden önizleyip onaylayın.'}, status=409)
    _save_pairs(session, settings, pairs, sections, maps, cd_maps, reference)
    return Response({'session': ExamSessionListSerializer(session).data})
