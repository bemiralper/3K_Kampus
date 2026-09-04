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

    def test_trailing_dot_still_matches_sub_outcome(self):
        match = _match_single_text('10.3.1.3.', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_code'], '10.3.1.3')
        self.assertEqual(match['sub_outcome_id'], self.sub.id)

    def test_nine_four_one_three_style_code(self):
        self.outcome.code = '9.4.1'
        self.outcome.save(update_fields=['code'])
        self.sub.code = '9.4.1.3'
        self.sub.save(update_fields=['code'])
        match = _match_single_text('9.4.1.3', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_code'], '9.4.1.3')
        self.assertEqual(match['sub_outcome_id'], self.sub.id)


class DuplicateOutcomeNamePrefersRelatedTopicTest(TestCase):
    """Aynı isim iki konuda varsa konu başlığına yakın olan kazanım seçilmeli."""

    def setUp(self):
        self.subject = Subject.objects.create(code='MAT', name='Matematik')
        self.shg = Topic.objects.create(
            subject=self.subject, name='SHG21 · BÖLÜNEBİLME VE EBOB-EKOK', order=33,
        )
        self.meb = Topic.objects.create(
            subject=self.subject, name='9. sınıf · DENKLEM VE EŞİTSİZLİKLER', order=79,
        )
        self.shg_out = Outcome.objects.create(
            topic=self.shg, code='21.2.2', text='Bölünebilme Kuralları', order=1,
        )
        self.meb_out = Outcome.objects.create(
            topic=self.meb, code='9.3.2', text='Bölünebilme Kuralları', order=1,
        )
        self.olasilik_shg = Topic.objects.create(
            subject=self.subject, name='SHG21 · OLASILIK', order=42,
        )
        self.olasilik_meb = Topic.objects.create(
            subject=self.subject, name='10. sınıf · SAYMA VE OLASILIK', order=88,
        )
        self.shg_olasilik = Outcome.objects.create(
            topic=self.olasilik_shg, code='21.13.1',
            text='Basit Olayların Olasılıkları', order=0,
        )
        self.meb_olasilik = Outcome.objects.create(
            topic=self.olasilik_meb, code='10.1.2',
            text='Basit Olayların Olasılıkları', order=0,
        )

    def test_bolunebilme_prefers_shg_topic_not_equations(self):
        match = _match_single_text('Bölünebilme Kuralları', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_id'], self.shg_out.id)
        self.assertEqual(match['outcome_code'], '21.2.2')

    def test_olasilik_prefers_olasilik_topic(self):
        match = _match_single_text('Basit Olayların Olasılıkları', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_id'], self.shg_olasilik.id)
        self.assertEqual(match['outcome_code'], '21.13.1')

    def test_dotted_code_still_picks_exact_outcome(self):
        match = _match_single_text('9.3.2', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_id'], self.meb_out.id)
        self.assertEqual(match['outcome_code'], '9.3.2')

        match = _match_single_text('21.2.2', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_id'], self.shg_out.id)
        self.assertEqual(match['outcome_code'], '21.2.2')


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
