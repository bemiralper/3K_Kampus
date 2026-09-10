"""Alt kazanım kodu eşlemesi: 10.3.1.3 üst kod 10.3.1'e düşmemeli."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, SubOutcome, Topic
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.serializers.answer_key import AnswerKeyItemSerializer
from apps.coaching.olcme_degerlendirme.views.curriculum_views import (
    _match_single_text,
    relink_dump_answer_key,
    topic_is_bulk_dump,
)


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


class HeadingCodeStaysExactTest(TestCase):
    """21.10 başlık olarak kalır; 21.10.2 çocuğuna düşmez."""

    def setUp(self):
        self.subject = Subject.objects.create(code='MAT', name='Matematik')
        self.topic = Topic.objects.create(
            subject=self.subject, code='21.10', name='SHG21 · FONKSİYONLAR', order=10,
        )
        self.first = Outcome.objects.create(
            topic=self.topic, code='21.10.1', text='Fonksiyon tanımı', order=0,
        )
        self.last = Outcome.objects.create(
            topic=self.topic, code='21.10.2', text='Fonksiyon grafiği', order=1,
        )
        other_topic = Topic.objects.create(
            subject=self.subject, code='21.1', name='SHG21 · SAYILAR', order=1,
        )
        self.other = Outcome.objects.create(
            topic=other_topic, code='21.1.1', text='Doğal sayılar', order=0,
        )

    def test_heading_code_stays_heading(self):
        match = _match_single_text('21.10', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['outcome_code'], '21.10')
        self.assertEqual(match['outcome_text'], 'FONKSİYONLAR')

    def test_heading_code_does_not_match_sibling_unit(self):
        match = _match_single_text('21.10', self.subject)
        self.assertNotEqual(match['outcome_code'], '21.1.1')

    def test_heading_inferred_from_child_codes(self):
        self.topic.code = ''
        self.topic.save(update_fields=['code'])
        match = _match_single_text('21.10', self.subject)
        self.assertIsNotNone(match)
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['outcome_code'], '21.10')
        self.assertEqual(match['outcome_text'], 'FONKSİYONLAR')

    def test_trailing_dot_heading_code(self):
        match = _match_single_text('21.10.', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_code'], '21.10')
        self.assertIsNone(match['outcome_id'])


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

    def test_imported_code_stays_exact_even_if_parent_linked(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.answer_key,
            section=self.section,
            question_number=3,
            correct_answer='C',
            outcome=self.outcome,
            imported_outcome_text='9.4.1.3',
        )
        data = AnswerKeyItemSerializer(item).data
        self.assertEqual(data['outcome_code'], '9.4.1.3')

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


class BulkDumpTopicRelinkTest(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(code='MATD', name='Matematik')
        self.real = Topic.objects.create(
            subject=self.subject, code='21.10', name='SHG21 · FONKSİYONLAR',
        )
        self.real_out = Outcome.objects.create(
            topic=self.real, code='21.10.2', text='Fonksiyon grafiği',
        )
        self.dump = Topic.objects.create(
            subject=self.subject, code='TOPLU', name='Toplu Yükleme', order=999,
        )
        self.dump_out = Outcome.objects.create(
            topic=self.dump, code='MATD-1', text='21.10',
        )
        self.exam = Exam.objects.create(name='Dump', exam_type='YKS_TYT')
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Matematik', question_start=1, question_end=2,
            subject=self.subject,
        )
        self.ak = AnswerKey.objects.create(exam=self.exam, booklet='')

    def test_dump_topic_detected(self):
        self.assertTrue(topic_is_bulk_dump(self.dump))
        self.assertFalse(topic_is_bulk_dump(self.real))

    def test_relink_heading_keeps_real_topic_name(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.ak, section=self.section, question_number=1,
            correct_answer='A', outcome=self.dump_out,
            imported_outcome_text='21.10',
        )
        self.assertEqual(relink_dump_answer_key(self.ak), 1)
        item.refresh_from_db()
        self.assertIsNone(item.outcome_id)
        data = AnswerKeyItemSerializer(item).data
        self.assertEqual(data['topic_name'], 'FONKSİYONLAR')
        self.assertNotEqual(data['topic_name'], 'Toplu Yükleme')

    def test_relink_exact_child_code(self):
        dump_child = Outcome.objects.create(
            topic=self.dump, code='MATD-2', text='21.10.2',
        )
        item = AnswerKeyItem.objects.create(
            answer_key=self.ak, section=self.section, question_number=2,
            correct_answer='B', outcome=dump_child,
            imported_outcome_text='21.10.2',
        )
        relink_dump_answer_key(self.ak)
        item.refresh_from_db()
        self.assertEqual(item.outcome_id, self.real_out.id)
