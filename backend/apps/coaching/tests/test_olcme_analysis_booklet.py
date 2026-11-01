"""
Soru analizi — B kitapçığı cevapları A sorusunun B karşılığından okunur.

comparison öğrencinin kendi kitapçık numarasıyla tutulur; A numarasıyla
okumak B öğrencisini başka bir soruya yazar.
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSession, StudentAnswer,
)
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

# A soru no → (A doğru, B soru no)
A_KEY = {1: ('C', 3), 2: ('A', 1), 3: ('E', 2)}


def _row(given, correct):
    result = 'empty' if not given else ('correct' if given == correct else 'wrong')
    return {'given': given, 'correct': correct, 'result': result}


class OlcmeAnalysisBookletTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Kitapçık Kurum', kod='KTPC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KTPC-A')
        self.user = User.objects.create_user(username='olcmekitapcik', password='test')
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='Kitapçık Analiz', exam_type='DENEME',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum, sube=self.sube,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=3,
        )
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='t.dat',
        )
        subject = Subject.objects.create(code='TRK_KTP', name='Türkçe')
        topic = Topic.objects.create(subject=subject, name='Paragraf', order=1)
        self.outcome = Outcome.objects.create(topic=topic, code='1.1', text='Paragrafta ana düşünce')

        self.a_key = AnswerKey.objects.create(exam=self.exam, booklet='A', is_primary=True)
        for q, (letter, b_q) in A_KEY.items():
            AnswerKeyItem.objects.create(
                answer_key=self.a_key, section=self.section, question_number=q,
                correct_answer=letter, b_question_number=b_q,
                outcome=self.outcome if q == 1 else None,
            )
        self.b_key = AnswerKey.objects.create(exam=self.exam, booklet='B', is_primary=False)
        for q, (letter, b_q) in A_KEY.items():
            AnswerKeyItem.objects.create(
                answer_key=self.b_key, section=self.section, question_number=b_q,
                correct_answer=letter,
            )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.base = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/analysis'

    def _answer(self, name, booklet, comparison, net):
        ogrenci = Ogrenci.objects.create(kurum=self.kurum, sube=self.sube, ad=name, soyad='Test')
        return StudentAnswer.objects.create(
            session=self.session, student=ogrenci, raw_student_id=name,
            raw_student_name=name, booklet=booklet, comparison=comparison,
            total_net=Decimal(net),
        )

    def _questions(self):
        res = self.client.get(f'{self.base}/questions/', **self.headers)
        self.assertEqual(res.status_code, 200)
        return {q['question_number']: q for q in res.json()['questions']}

    def test_b_student_read_from_b_position(self):
        # A öğrencisi 1. soruyu doğru yapar.
        self._answer('Aoğr', 'A', {
            '1': _row('C', 'C'),
            '2': _row('B', 'A'),
            '3': _row('', 'E'),
        }, '1.00')
        # B öğrencisi A1'i (B3) doğru, A2'yi (B1) yanlış, A3'ü (B2) boş bırakır.
        self._answer('Boğr', 'B', {
            '1': _row('D', 'A'),
            '2': _row('', 'E'),
            '3': _row('C', 'C'),
        }, '0.50')

        q = self._questions()
        self.assertEqual(q[1]['correct_pct'], 100.0)
        self.assertEqual(q[1]['choices']['C'], 2)
        self.assertEqual(q[2]['correct_pct'], 0.0)
        self.assertEqual(q[2]['wrong_pct'], 100.0)
        self.assertEqual(q[2]['choices'], {'A': 0, 'B': 1, 'C': 0, 'D': 1, 'E': 0, 'EMPTY': 0})
        self.assertEqual(q[2]['top_distractor_pct'], 50.0)
        self.assertEqual(q[3]['empty_pct'], 100.0)

    def test_unpaired_question_skips_b_students(self):
        AnswerKeyItem.objects.filter(answer_key=self.a_key, question_number=3).update(
            b_question_number=None,
        )
        self._answer('Aoğr', 'A', {'3': _row('E', 'E')}, '1.00')
        self._answer('Boğr', 'B', {'3': _row('A', 'C')}, '0.00')

        q = self._questions()
        self.assertEqual(q[3]['correct_pct'], 100.0)
        self.assertEqual(q[3]['choices']['A'], 0)

    def test_without_b_mapping_reads_own_numbers(self):
        AnswerKeyItem.objects.filter(answer_key=self.a_key).update(b_question_number=None)
        self.b_key.delete()
        self._answer('Boğr', 'B', {'1': _row('C', 'C')}, '1.00')

        q = self._questions()
        self.assertEqual(q[1]['correct_pct'], 100.0)

    def test_optional_section_counts_only_students_who_attempted(self):
        from apps.coaching.olcme_degerlendirme.models import StudentSectionScore

        felsefe = ExamSection.objects.create(
            exam=self.exam, name='Felsefe (Seçmeli)', order=2, question_start=4, question_end=4,
            is_sub_section=True, parent_section=self.section,
        )
        AnswerKeyItem.objects.create(
            answer_key=self.a_key, section=felsefe, question_number=4, correct_answer='A',
        )
        solver = self._answer('Çözen', 'A', {'4': _row('A', 'A')}, '1.00')
        self._answer('Çözmeyen', 'A', {'4': _row('', 'A')}, '0.00')
        StudentSectionScore.objects.create(student_answer=solver, section=felsefe, correct=1, net=Decimal('1'))

        q = self._questions()
        self.assertEqual(q[4]['answered_count'], 1)
        self.assertEqual(q[4]['correct_pct'], 100.0)
        self.assertEqual(q[4]['difficulty'], 'Kolay')
        self.assertEqual(q[1]['answered_count'], 2)

    def test_optional_section_nobody_solved_has_no_difficulty(self):
        felsefe = ExamSection.objects.create(
            exam=self.exam, name='Felsefe (Seçmeli)', order=2, question_start=4, question_end=4,
            is_sub_section=True, parent_section=self.section,
        )
        AnswerKeyItem.objects.create(
            answer_key=self.a_key, section=felsefe, question_number=4, correct_answer='A',
        )
        self._answer('Çözmeyen', 'A', {'4': _row('', 'A')}, '0.00')

        q = self._questions()
        self.assertEqual(q[4]['answered_count'], 0)
        self.assertEqual(q[4]['difficulty'], '')

    def test_strategy_outcome_uses_b_position(self):
        # İki B öğrencisi de A1'in karşılığı B3'ü doğru yapar; B1 yanlıştır.
        for name in ('B1', 'B2'):
            self._answer(name, 'B', {
                '1': _row('D', 'A'),
                '3': _row('C', 'C'),
            }, '1.00')

        res = self.client.get(f'{self.base}/strategy/', **self.headers)
        self.assertEqual(res.status_code, 200)
        titles = [s['title'] for s in res.json()['strategies']]
        self.assertFalse(any(t.startswith('Kritik Kazanım') for t in titles))
