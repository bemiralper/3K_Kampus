"""Kayıtlı DAT + mapping ile öğrenci cevaplarını yeniden hizala.

Eski parse sütunları arka arkaya ekliyordu; Biyoloji (son alt bölüm)
kaymış netlerle kalıyordu. DAT dosyası ve field_mappings oturumda
duruyorsa öğrenci eşleşmesine dokunmadan skorları yeniden yazar.
"""
import logging

from django.db import transaction

from ..models import AnswerKey, ExamSession, StudentAnswer, StudentSectionScore

logger = logging.getLogger(__name__)

CURRENT_ALIGN_VERSION = 3


def _read_dat_lines(session):
    if not session.dat_file:
        return []
    session.dat_file.open('rb')
    try:
        raw = session.dat_file.read()
    finally:
        session.dat_file.close()
    text = None
    for enc in ['utf-8', 'windows-1254', 'iso-8859-9', 'latin-1']:
        try:
            text = raw.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    if text is None:
        text = raw.decode('latin-1', errors='replace')
    lines = text.strip().splitlines()
    if session.first_line_is_header and lines:
        lines = lines[1:]
    from ..views.result_views import _normalize_lines
    return [ln for ln in _normalize_lines(lines) if ln.strip()]


def _correct_maps(exam):
    answer_key = AnswerKey.primary_for(exam)
    if answer_key is None or not answer_key.items.exists():
        answer_key = max(
            AnswerKey.objects.filter(exam=exam).prefetch_related('items'),
            key=lambda ak: ak.items.count(),
            default=None,
        )
    if not answer_key:
        return None

    correct_map_a = {}
    parent_offset = {
        sec.id: sec.question_start
        for sec in exam.sections.filter(is_sub_section=False)
    }
    sub_to_parent = {
        sec.id: sec.parent_section_id
        for sec in exam.sections.filter(is_sub_section=True)
        if sec.parent_section_id
    }
    b_to_a_map = {}
    for item in answer_key.items.select_related('section').all():
        correct_map_a[item.question_number] = {
            'answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'section_id': item.section_id,
        }
        if item.b_question_number is not None:
            sec_id = item.section_id
            if sec_id in sub_to_parent:
                offset = parent_offset.get(sub_to_parent[sec_id])
            else:
                offset = parent_offset.get(sec_id)
            if offset is not None:
                b_to_a_map[offset + item.b_question_number - 1] = item.question_number

    correct_map_b = {}
    b_key = (
        AnswerKey.objects.filter(exam=exam, booklet='B')
        .prefetch_related('items').first()
    )
    if b_key:
        for item in b_key.items.all():
            correct_map_b[item.question_number] = {
                'answer': item.correct_answer,
                'is_cancelled': item.is_cancelled,
                'section_id': item.section_id,
            }
    return correct_map_a, b_to_a_map, correct_map_b


def _section_fields(session, sections, sub_sections):
    field_mappings = session.field_mappings or []
    mapping = {fm['field']: (fm['start'], fm['end']) for fm in field_mappings if 'field' in fm}
    section_fields = {k: v for k, v in mapping.items() if k.startswith('ders_')}
    all_ids = {sec.id for sec in sections + sub_sections}
    label_map = {
        fm['field']: fm.get('label', '')
        for fm in field_mappings
        if str(fm.get('field', '')).startswith('ders_')
    }
    needs_remap = False
    for k in section_fields:
        try:
            if int(k.replace('ders_', '')) not in all_ids:
                needs_remap = True
                break
        except ValueError:
            pass
    if needs_remap:
        name_to_section = {sec.name.strip().lower(): sec for sec in sections + sub_sections}
        remapped = {}
        for k, v in section_fields.items():
            label = label_map.get(k, '').strip().lower()
            matched = name_to_section.get(label)
            remapped[f'ders_{matched.id}' if matched else k] = v
        section_fields = remapped
    return mapping, section_fields


def realign_session(session) -> int:
    """Kayıtlı DAT'ı yeni hizayla oku; öğrenci eşleşmesini koru.

    Dönüş: güncellenen öğrenci sayısı. DAT/mapping yoksa 0 (sürüm yine işaretlenir).
    """
    exam = session.exam
    maps = _correct_maps(exam)
    lines = _read_dat_lines(session)
    field_mappings = session.field_mappings or []
    if not maps or not lines or not field_mappings:
        if getattr(session, 'align_version', 0) != CURRENT_ALIGN_VERSION:
            session.align_version = CURRENT_ALIGN_VERSION
            session.save(update_fields=['align_version'])
        return 0

    from ..views.result_views import _assemble_section_answers, _score_answers

    correct_map_a, b_to_a_map, correct_map_b = maps
    sections = list(exam.sections.filter(is_sub_section=False).order_by('question_start'))
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('question_start'))
    mapping, section_fields = _section_fields(session, sections, sub_sections)
    has_cevaplar = 'cevaplar' in mapping
    if not has_cevaplar and not section_fields:
        session.align_version = CURRENT_ALIGN_VERSION
        session.save(update_fields=['align_version'])
        return 0

    sub_ids = {sec.id for sec in sub_sections}
    mapped_ids = set()
    for k in section_fields:
        try:
            mapped_ids.add(int(k.replace('ders_', '')))
        except ValueError:
            pass
    use_subs = any(sid in sub_ids for sid in mapped_ids)
    from ..views.result_views import exam_question_span
    total_questions = exam_question_span(sections, sub_sections)
    wrong_penalty = exam.wrong_answer_count

    existing = list(
        StudentAnswer.objects.filter(session=session).order_by('id')
    )
    updated = 0
    with transaction.atomic():
        for sa, line in zip(existing, lines):
            if has_cevaplar:
                s, e = mapping['cevaplar']
                answers_raw = line[s:e]
            else:
                answers_raw = _assemble_section_answers(
                    line, sections, sub_sections, section_fields,
                    total_questions, use_subs,
                )
            booklet = sa.booklet or 'A'
            answers_dict, comparison_dict, section_scores, totals = _score_answers(
                answers_raw, total_questions, booklet,
                correct_map_a, b_to_a_map, correct_map_b,
                sections, wrong_penalty, sub_sections,
                exam.per_section_penalty,
            )
            sa.answers = answers_dict
            sa.comparison = comparison_dict
            sa.total_correct, sa.total_wrong, sa.total_empty, sa.total_net = totals
            sa.save(update_fields=[
                'answers', 'comparison',
                'total_correct', 'total_wrong', 'total_empty', 'total_net',
            ])
            sa.section_scores.all().delete()
            for sec_id, scores in section_scores.items():
                StudentSectionScore.objects.create(
                    student_answer=sa,
                    section_id=sec_id,
                    correct=scores['correct'],
                    wrong=scores['wrong'],
                    empty=scores['empty'],
                    net=scores['net'],
                )
            updated += 1
        session.align_version = CURRENT_ALIGN_VERSION
        session.save(update_fields=['align_version'])
    return updated


def realign_exam_if_needed(exam) -> int:
    total = 0
    sessions = ExamSession.objects.filter(
        exam=exam,
        align_version__lt=CURRENT_ALIGN_VERSION,
    )
    for session in sessions:
        try:
            total += realign_session(session)
        except Exception:
            logger.exception('DAT yeniden hizalama başarısız session=%s', session.pk)
    return total
