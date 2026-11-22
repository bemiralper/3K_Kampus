"""Kayıtlı öğrenci cevaplarını güncel anahtar ve bölüm aralığıyla yeniden skorla."""
from __future__ import annotations

from django.db import transaction

from ..models import AnswerKey, ExamSession, StudentAnswer, StudentSectionScore


def rescore_exam_results(exam) -> int:
    """Kayıtlı cevapları güncel bölüm aralıklarıyla yeniden skorlar. Güncellenen öğrenci sayısı."""
    from ..views.result_views import _score_answers, exam_question_span

    sections = list(exam.sections.filter(is_sub_section=False).order_by('order', 'question_start'))
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('order', 'question_start'))
    if not sections:
        return 0

    answer_key = AnswerKey.primary_for(exam)
    if not answer_key:
        return 0

    from .booklet_align import align_b_question_numbers
    align_b_question_numbers(exam)

    correct_map_a = {}
    b_to_a_map = {}
    for item in answer_key.items.select_related('section', 'section__parent_section').all():
        correct_map_a[item.question_number] = {
            'answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'section_id': item.section_id,
        }
        b_global = item.booklet_b_global()
        if b_global:
            b_to_a_map[b_global] = item.question_number

    correct_map_b = {}
    b_key = AnswerKey.objects.filter(exam=exam, booklet='B').prefetch_related('items').first()
    if b_key:
        for item in b_key.items.all():
            correct_map_b[item.question_number] = {
                'answer': item.correct_answer,
                'is_cancelled': item.is_cancelled,
                'section_id': item.section_id,
            }

    total_questions = exam_question_span(sections, sub_sections)
    wrong_penalty = exam.wrong_answer_count
    updated = 0

    from ..views.dual_dat_views import _booklet_map
    cd_maps = {booklet: _booklet_map(exam, booklet) for booklet in ('C', 'D')}
    cd_maps = {booklet: booklet_map for booklet, booklet_map in cd_maps.items() if booklet_map}

    answers = (
        StudentAnswer.objects
        .filter(session__exam=exam)
        .select_related('session')
        .prefetch_related('section_scores')
    )
    for sa in answers.iterator():
        answers_raw = ''
        for q in range(1, total_questions + 1):
            ch = (sa.answers or {}).get(str(q), '')
            answers_raw += ch if ch else ' '

        booklet = sa.booklet or 'A'
        active_maps = (correct_map_a, b_to_a_map, correct_map_b)
        settings = sa.session.dual_dat_settings or {}
        if (
            sa.session.numeric_dat_file
            and booklet in cd_maps
            and not settings.get('booklet_reference')
        ):
            active_maps = (cd_maps[booklet], {}, {})
            booklet = 'A'

        _, comparison_dict, section_scores_data, totals = _score_answers(
            answers_raw, total_questions, booklet,
            *active_maps,
            sections, wrong_penalty, sub_sections,
            exam.per_section_penalty,
        )
        with transaction.atomic():
            sa.comparison = comparison_dict
            sa.total_correct = totals[0]
            sa.total_wrong = totals[1]
            sa.total_empty = totals[2]
            sa.total_net = totals[3]
            sa.save(update_fields=[
                'comparison', 'total_correct', 'total_wrong', 'total_empty', 'total_net',
            ])
            sa.section_scores.all().delete()
            for sec_id, scores in section_scores_data.items():
                StudentSectionScore.objects.create(
                    student_answer=sa,
                    section_id=sec_id,
                    correct=scores['correct'],
                    wrong=scores['wrong'],
                    empty=scores['empty'],
                    net=scores['net'],
                )
        updated += 1
    from .stored_scores import refresh_exam_scores
    refresh_exam_scores(exam)
    return updated
