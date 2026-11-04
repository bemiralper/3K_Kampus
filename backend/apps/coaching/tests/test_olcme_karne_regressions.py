"""Karne denetimindeki kimlik, kapsam, iptal ve tarih sınırları."""
from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from apps.coaching.application.olcme_karne_html import build_karne_context
from apps.coaching.application.olcme_karne_pdf import _comment_lines
from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSession,
    StudentAnswer, StudentSectionScore, StudentStoredScore,
)
from apps.coaching.olcme_degerlendirme.services.difficulty_bands import summarize_difficulty
from apps.coaching.olcme_degerlendirme.services.scoring import build_linked_tyt_index
from apps.coaching.olcme_degerlendirme.services.stored_scores import blocks_for_answers, refresh_exam_scores
from apps.coaching.olcme_degerlendirme.services.topic_blocks import build_topic_blocks
from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _karne_net_history, _mark_alan_inclusion, build_student_detail_payload,
)
from apps.coaching.tests.test_olcme_karne_html import _section, _tyt_payload
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.ogrenci.domain.models import Ogrenci


class KarneScopeRegressionTests(SimpleTestCase):
    def test_cancelled_is_neither_retry_nor_empty_cell(self):
        data = _tyt_payload(answer_grids=[{'section_id': 1, 'section_name': 'Türkçe',
            'questions': [{'n': 1, 'given': '', 'correct': 'A', 'result': 'cancelled'}]}])
        ctx = build_karne_context(data)
        self.assertEqual(ctx['retry'], [])
        self.assertEqual(ctx['answers'][0]['cells'][0]['cls'], 'cancelled')
        self.assertEqual(ctx['answers'][0]['cells'][0]['fix'], '')

    def test_general_penalty_comes_from_exam_even_when_sections_unpenalized(self):
        ctx = build_karne_context(_tyt_payload(
            section_details=[_section(1, 'Türkçe', c=10, w=4, e=6, q=20, net=10)],
            total_correct=10, total_wrong=4, total_questions=20, alan_soru=20,
            total_empty=6, toplam_net=9, alan_net=9,
            wrong_answer_count=4, per_section_penalty=False))
        self.assertEqual(ctx['lost_net'], '1')
        self.assertEqual(ctx['accuracy'], "71'i")
        self.assertIn('4 yanlış', ctx['penalty_text'])

    def test_ayt_behavior_uses_field_counts(self):
        ctx = build_karne_context(_tyt_payload(exam_type='YKS_AYT',
            section_details=[_section(1, 'Matematik', c=10, w=10, q=20),
                             _section(2, 'Edebiyat', c=20, q=20, alana_dahil=False)],
            dogruluk_orani=75))
        self.assertEqual((ctx['correct'], ctx['wrong']), (10, 10))
        self.assertEqual(ctx['accuracy'], "50'si")

    def test_ayt_target_counts_only_field_questions(self):
        comparison = {str(i): {'result': 'empty'} for i in range(1, 101)}
        summary = summarize_difficulty(booklet='A', comparison=comparison,
            participant_count=20, bands={str(i): 'kolay' for i in range(1, 101)},
            field_questions={'1', '2'}, field_only=True)
        ctx = build_karne_context(_tyt_payload(exam_type='YKS_AYT', alan_net=16,
            section_details=[_section(1, 'Matematik', c=16, e=64, q=80)],
            target_difficulty=summary))
        self.assertEqual(ctx['target']['count'], 2)
        self.assertEqual(ctx['target']['net'], '18')

    def test_ayt11_priorities_exclude_subjects_outside_score(self):
        sections = [_section(1, 'Matematik', c=30, q=30), _section(2, 'Felsefe', e=5, q=5)]
        _mark_alan_inclusion(sections, 'AYT_11', 'SAYISAL')
        ctx = build_karne_context(_tyt_payload(exam_type='AYT_11', section_details=sections,
            topic_blocks=[], total_correct=30, total_wrong=0, total_questions=35, alan_soru=35))
        self.assertEqual(ctx['priorities'], [])
        self.assertEqual(ctx['soru'], 35)

    def test_small_delta_is_reported_precisely(self):
        data = _tyt_payload(net_history=[{'exam_id': 1, 'toplam_net': 10},
            {'exam_id': 2, 'toplam_net': 10.25, 'is_current': True}])
        self.assertIn('0,25 net arttı', ' '.join(_comment_lines(data)))

    def test_optional_sections_hidden_without_precomputed_insights(self):
        ctx = build_karne_context(_tyt_payload(karne_insights=None))
        self.assertNotIn('Felsefe (Seçmeli)', [row['name'] for row in ctx['table_rows']])


class KarneDataRegressionTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Karne Audit', kod='AUDIT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='AUDIT-M')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026)
        self.student = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Test')

    def exam(self, kind='YKS_TYT', day=None, names=('Temel Matematik',)):
        exam = Exam.objects.create(name=kind, exam_type=kind, kurum=self.kurum,
            egitim_yili=self.year, exam_date=day)
        for i, name in enumerate(names):
            ExamSection.objects.create(exam=exam, name=name, order=i,
                question_start=i*40+1, question_end=(i+1)*40)
        return exam

    def answer(self, exam, net=10, student=None, raw='0', name='Ada Test'):
        session = ExamSession.objects.create(exam=exam, status='COMPLETED')
        answer = StudentAnswer.objects.create(session=session, student=student or self.student,
            raw_student_id=raw, raw_student_name=name, total_correct=net*exam.sections.count(),
            total_net=Decimal(net*exam.sections.count()))
        for sec in exam.sections.all():
            StudentSectionScore.objects.create(student_answer=answer, section=sec,
                correct=net, empty=40-net, net=Decimal(net))
        return answer

    def test_linked_tyt_score_sections_and_rank_use_same_latest_answer(self):
        tyt = self.exam()
        self.answer(tyt, 10)
        latest = self.answer(tyt, 30)
        ayt = self.exam('YKS_AYT', names=('Matematik',))
        ayt.linked_tyt_exam = tyt
        ayt.save()
        answer = self.answer(ayt, 20)
        data = build_student_detail_payload(ayt, answer, 2026, include_trend=False)
        self.assertEqual(data['tyt_siralama']['net'], 30)
        self.assertEqual(data['puan_turleri']['SAY']['tyt_net'], 30)
        self.assertEqual([r['net'] for r in data['section_details'] if r['source']=='tyt'], [30])
        self.assertEqual([r['kurum_avg_net'] for r in data['section_details'] if r['source']=='tyt'], [30])
        self.assertEqual(build_linked_tyt_index(ayt).lookup(self.student.id).id, latest.id)

    def test_no_tyt_match_does_not_use_shared_zero(self):
        tyt = self.exam()
        self.answer(tyt, 30)
        ayt = self.exam('YKS_AYT', names=('Matematik',))
        ayt.linked_tyt_exam = tyt
        ayt.save()
        other = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Başka', soyad='Kişi')
        answer = self.answer(ayt, 20, student=other, name='Başka Kişi')
        data = build_student_detail_payload(ayt, answer, 2026, include_trend=False)
        self.assertIsNone(data['tyt_siralama'])
        self.assertEqual(data['puan_turleri']['SAY']['tyt_net'], 0)

    def test_ambiguous_name_is_not_selected(self):
        tyt = self.exam()
        self.answer(tyt, 10)
        other = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Test')
        self.answer(tyt, 30, student=other)
        ayt = self.exam('YKS_AYT')
        ayt.linked_tyt_exam = tyt
        ayt.save()
        self.assertIsNone(build_linked_tyt_index(ayt).lookup(None, 'Ada Test', '0'))

    def test_ea_headline_average_and_field_net_match_scope(self):
        exam = self.exam('YKS_AYT', names=('Matematik', 'Fizik', 'Türk Dili ve Edebiyatı'))
        answer = self.answer(exam, 10)
        with patch('apps.coaching.olcme_degerlendirme.views.analysis_views._get_student_alan', return_value='ESIT_AGIRLIK'):
            data = build_student_detail_payload(exam, answer, 2026, include_trend=False)
        self.assertEqual(data['kurum_avg_puan'], data['puan_turleri_avgs']['EA'])
        self.assertEqual(data['kurum_avg_net'], data['puan_turleri']['EA']['ayt_net'])
        ctx = build_karne_context(data)
        self.assertEqual(ctx['kurum_scale']['diff']['text'], '+0')

    def test_history_excludes_later_same_day_and_uses_latest_upload(self):
        previous = self.exam(day=date(2026, 3, 1))
        self.answer(previous, 10)
        latest = self.answer(previous, 20)
        current = self.exam(day=date(2026, 3, 2))
        answer = self.answer(current, 30)
        later = self.exam(day=current.exam_date)
        self.answer(later, 40)
        Exam.objects.filter(pk=later.pk).update(created_at=current.created_at+timedelta(seconds=1))
        history = _karne_net_history(current, answer)
        self.assertEqual([r['exam_id'] for r in history], [previous.id, current.id])
        self.assertEqual(history[0]['answer_id'], latest.id)
        self.assertEqual(history[0]['section_nets']['Temel Matematik'], 20)

    def test_ayt_history_is_field_net_not_total(self):
        previous = self.exam('YKS_AYT', date(2026, 3, 1), ('Matematik', 'Türk Dili ve Edebiyatı'))
        self.answer(previous, 10)
        current = self.exam('YKS_AYT', date(2026, 3, 2), ('Matematik', 'Türk Dili ve Edebiyatı'))
        answer = self.answer(current, 20)
        history = _karne_net_history(current, answer)
        self.assertEqual([r['toplam_net'] for r in history], [10, 20])

    def test_cancelled_and_unmapped_b_questions_do_not_pollute_outcomes(self):
        exam = self.exam(names=('Türkçe',))
        section = exam.sections.get()
        key = AnswerKey.objects.create(exam=exam, booklet='A', is_primary=True)
        AnswerKeyItem.objects.create(answer_key=key, section=section, question_number=1,
            b_question_number=2, correct_answer='A', imported_outcome_text='İptal kazanımı', is_cancelled=True)
        AnswerKeyItem.objects.create(answer_key=key, section=section, question_number=2,
            correct_answer='B', imported_outcome_text='Eşlemesiz kazanım')
        blocks = build_topic_blocks(exam, {'1': {'result': 'correct'}, '2': {'result': 'cancelled'}}, 'B')
        self.assertEqual(blocks, [])

    def test_old_cached_ayt_scores_are_upgraded_once(self):
        exam = self.exam('YKS_AYT', names=('Matematik',))
        answer = self.answer(exam, 10)
        refresh_exam_scores(exam)
        stored = StudentStoredScore.objects.get(student_answer=answer)
        for block in stored.by_year.values():
            block.pop('scoring_version')
        stored.save()
        block = blocks_for_answers(exam, [answer], 2026)[answer.id]
        self.assertEqual(block['scoring_version'], 2)
        stamp = StudentStoredScore.objects.get(pk=stored.pk).updated_at
        blocks_for_answers(exam, [answer], 2026)
        self.assertEqual(StudentStoredScore.objects.get(pk=stored.pk).updated_at, stamp)

    def test_known_different_student_is_not_linked_by_same_name(self):
        tyt = self.exam()
        self.answer(tyt, 10)
        other = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Test')
        ayt = self.exam('YKS_AYT')
        ayt.linked_tyt_exam = tyt
        ayt.save()
        self.assertIsNone(build_linked_tyt_index(ayt).lookup(other.id, 'Ada Test', '0'))

    def test_history_excludes_different_year_and_question_count(self):
        previous = self.exam(day=date(2026, 3, 1))
        self.answer(previous, 10)
        previous.egitim_yili = EgitimYili.objects.create(baslangic_yil=2024, bitis_yil=2025)
        previous.save()
        shorter = self.exam(day=date(2026, 3, 1))
        self.answer(shorter, 10)
        sec = shorter.sections.get()
        sec.question_end = 20
        sec.save()
        current = self.exam(day=date(2026, 3, 2))
        answer = self.answer(current, 20)
        self.assertEqual([r['exam_id'] for r in _karne_net_history(current, answer)], [current.id])

    def test_undated_history_ends_at_current_exam(self):
        previous = self.exam()
        self.answer(previous, 10)
        current = self.exam()
        answer = self.answer(current, 20)
        later = self.exam(day=date(2020, 1, 1))
        self.answer(later, 30)
        self.assertEqual([r['exam_id'] for r in _karne_net_history(current, answer)], [previous.id, current.id])
