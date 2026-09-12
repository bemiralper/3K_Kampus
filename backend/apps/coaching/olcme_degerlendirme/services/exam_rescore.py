"""Bölüm aralığı değişince öğrenci netlerini yeniden hesapla."""
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

    answers = (
        StudentAnswer.objects
        .filter(session__exam=exam)
        .prefetch_related('section_scores')
    )
    for sa in answers.iterator():
        answers_raw = ''
        for q in range(1, total_questions + 1):
            ch = (sa.answers or {}).get(str(q), '')
            answers_raw += ch if ch else ' '

        _, comparison_dict, section_scores_data, totals = _score_answers(
            answers_raw, total_questions, sa.booklet or 'A',
            correct_map_a, b_to_a_map, correct_map_b,
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
    return updated
