"""DAT ve OMR'nin aynı eşleştirme/skorlama kurallarına bağlandığı servis."""
from __future__ import annotations

from ..models import AnswerKey, StudentAnswer, StudentSectionScore


def _scoring_context(exam):
    from ..views.result_views import exam_question_span

    sections = list(exam.sections.filter(is_sub_section=False).order_by('question_start'))
    sub_sections = list(exam.sections.filter(is_sub_section=True).order_by('question_start'))
    answer_key = AnswerKey.primary_for(exam)
    if answer_key is None or not answer_key.items.exists():
        answer_key = max(
            AnswerKey.objects.filter(exam=exam).prefetch_related('items'),
            key=lambda key: key.items.count(),
            default=None,
        )
    if answer_key is None:
        raise ValueError('Cevap anahtarı bulunamadı. Önce cevap anahtarını girin.')

    from .booklet_align import align_b_question_numbers, forget_prefetched_items
    align_b_question_numbers(exam)
    forget_prefetched_items(answer_key)

    parent_offset = {sec.id: sec.question_start for sec in sections}
    sub_to_parent = {sec.id: sec.parent_section_id for sec in sub_sections if sec.parent_section_id}
    correct_a = {}
    b_to_a = {}
    for item in answer_key.items.all():
        correct_a[item.question_number] = {
            'answer': item.correct_answer,
            'is_cancelled': item.is_cancelled,
            'section_id': item.section_id,
        }
        if item.b_question_number is not None:
            offset = parent_offset.get(sub_to_parent.get(item.section_id, item.section_id))
            if offset is not None:
                b_to_a[offset + item.b_question_number - 1] = item.question_number
    correct_b = {}
    b_key = AnswerKey.objects.filter(exam=exam, booklet='B').prefetch_related('items').first()
    if b_key:
        for item in b_key.items.all():
            correct_b[item.question_number] = {
                'answer': item.correct_answer,
                'is_cancelled': item.is_cancelled,
                'section_id': item.section_id,
            }
    return {
        'sections': sections,
        'sub_sections': sub_sections,
        'total_questions': exam_question_span(sections, sub_sections),
        'correct_a': correct_a,
        'correct_b': correct_b,
        'b_to_a': b_to_a,
        'has_b': bool(b_to_a) or bool(correct_b),
    }


def import_normalized_rows(exam, session, rows: list[dict]) -> list[StudentAnswer]:
    """Normalize satırları mevcut DAT eşleştirme/skorlama davranışıyla yazar."""
    from ..views.result_views import _build_student_pool, _match_student, _score_answers

    context = _scoring_context(exam)
    by_tc, by_number, students = _build_student_pool(exam.kurum_id, exam.sube_id)
    used = set()
    created = []
    for index, row in enumerate(rows, start=1):
        tc = str(row.get('tc') or row.get('tc_kimlik') or '').strip()
        number = str(row.get('ogrenci_no') or row.get('numara') or '').strip()
        name = str(row.get('ad_soyad') or '').strip()
        student, match_score, match_method = _match_student(
            tc, number, name, by_tc, by_number, students, used,
        )
        answers = row.get('cevaplar') or {}
        answer_text = ''.join(
            str(answers.get(str(question), '') or ' ')[:1]
            for question in range(1, context['total_questions'] + 1)
        )
        booklet = str(row.get('kitapcik') or '').strip().upper()
        auto = False
        if booklet not in ('A', 'B', 'C', 'D'):
            booklet = ''
        if not booklet and context['has_b']:
            totals = {}
            for candidate in ('A', 'B'):
                totals[candidate] = _score_answers(
                    answer_text, context['total_questions'], candidate,
                    context['correct_a'], context['b_to_a'], context['correct_b'],
                    context['sections'], exam.wrong_answer_count, context['sub_sections'],
                    exam.per_section_penalty,
                )[3][3]
            booklet = 'B' if totals['B'] > totals['A'] else 'A'
            auto = True
        answers_dict, comparison, section_scores, totals = _score_answers(
            answer_text, context['total_questions'], booklet,
            context['correct_a'], context['b_to_a'], context['correct_b'],
            context['sections'], exam.wrong_answer_count, context['sub_sections'],
            exam.per_section_penalty,
        )
        answer = StudentAnswer.objects.create(
            session=session,
            student=student,
            raw_student_id=(tc or number or str(index)),
            raw_student_name=name,
            raw_tc_kimlik=tc[:20],
            booklet=booklet,
            booklet_auto_detected=auto,
            answers=answers_dict,
            comparison=comparison,
            total_correct=totals[0],
            total_wrong=totals[1],
            total_empty=totals[2],
            total_net=totals[3],
            match_score=match_score,
            match_method=match_method,
            is_processed=True,
        )
        StudentSectionScore.objects.bulk_create([
            StudentSectionScore(
                student_answer=answer,
                section_id=section_id,
                correct=score['correct'],
                wrong=score['wrong'],
                empty=score['empty'],
                net=score['net'],
            )
            for section_id, score in section_scores.items()
        ])
        created.append(answer)
    return created
