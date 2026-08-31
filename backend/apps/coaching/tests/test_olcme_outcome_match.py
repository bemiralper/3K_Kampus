"""Alt kazanım kodu eşlemesi: 10.3.1.3 üst kod 10.3.1'e düşmemeli."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, SubOutcome, Topic
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.serializers.answer_key import AnswerKeyItemSerializer
from apps.coaching.olcme_degerlendirme.views.curriculum_views import _match_single_text


class SubOutcomeCodeMatchTest(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(code='MAT', name='Matematik')
        self.topic = Topic.objects.create(
            subject=self.subject, code='10.3', name='Fonksiyonlar', order=0,
        )
        self.outcome = Outcome.objects.create(
            topic=self.topic, code='10.3.1', text='Fonksiyon kavramını açıklar.', order=0,
        )
        self.sub = SubOutcome.objects.create(
            outcome=self.outcome, code='10.3.1.3',
            text='Bileşke fonksiyonu hesaplar.', order=2,
        )

    def test_four_part_code_returns_sub_outcome(self):
        match = _match_single_text('10.3.1.3', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'sub_outcome')
        self.assertEqual(match['outcome_code'], '10.3.1.3')
        self.assertEqual(match['outcome_text'], 'Bileşke fonksiyonu hesaplar.')
        self.assertEqual(match['outcome_id'], self.outcome.id)
        self.assertEqual(match['sub_outcome_id'], self.sub.id)
        self.assertEqual(match['match_score'], 100)

    def test_three_part_code_still_matches_outcome(self):
        match = _match_single_text('10.3.1', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'outcome')
        self.assertEqual(match['outcome_code'], '10.3.1')
        self.assertIsNone(match['sub_outcome_id'])

    def test_unknown_four_part_code_does_not_fall_back_to_parent(self):
        match = _match_single_text('10.3.1.9', self.subject)
        self.assertIsNone(match)


class AnswerKeySubOutcomeDisplayTest(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(code='MAT', name='Matematik')
        self.topic = Topic.objects.create(
            subject=self.subject, code='10.3', name='Fonksiyonlar',
        )
        self.outcome = Outcome.objects.create(
            topic=self.topic, code='10.3.1', text='Fonksiyon kavramını açıklar.',
        )
        self.sub = SubOutcome.objects.create(
            outcome=self.outcome, code='10.3.1.3',
            text='Bileşke fonksiyonu hesaplar.',
        )
        self.exam = Exam.objects.create(name='Deneme', exam_type='YKS_TYT')
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Matematik', question_start=1, question_end=5,
        )
        self.answer_key = AnswerKey.objects.create(exam=self.exam, booklet='')

    def test_serializer_shows_sub_outcome_code(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.answer_key,
            section=self.section,
            question_number=1,
            correct_answer='A',
            outcome=self.outcome,
            sub_outcome=self.sub,
            imported_outcome_text='10.3.1.3',
        )
        data = AnswerKeyItemSerializer(item).data
        self.assertEqual(data['outcome_code'], '10.3.1.3')
        self.assertEqual(data['outcome_text'], 'Bileşke fonksiyonu hesaplar.')
        self.assertEqual(data['sub_outcome'], self.sub.id)

    def test_serializer_falls_back_to_outcome_when_no_sub(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.answer_key,
            section=self.section,
            question_number=2,
            correct_answer='B',
            outcome=self.outcome,
        )
        data = AnswerKeyItemSerializer(item).data
        self.assertEqual(data['outcome_code'], '10.3.1')
        self.assertEqual(data['sub_outcome'], None)
