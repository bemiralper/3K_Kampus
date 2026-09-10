"""Alt kazanım kodu eşlemesi: 10.3.1.3 üst kod 10.3.1'e düşmemeli."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, SubOutcome, Topic
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.serializers.answer_key import AnswerKeyItemSerializer
from apps.coaching.olcme_degerlendirme.views.curriculum_views import (
    _code_is_under,
    _code_query_hits,
    _match_single_text,
    detach_false_heading_binds,
    detach_foreign_outcome_binds,
    relink_dump_answer_key,
    relink_unbound_answer_key,
    search_subject_outcomes,
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
        self.assertEqual(match['topic_name'], 'FONKSİYONLAR')

    def test_heading_code_does_not_match_sibling_unit(self):
        match = _match_single_text('21.10', self.subject)
        self.assertIsNone(match['outcome_id'])
        self.assertNotEqual(match['outcome_code'], '21.1.1')
        self.assertEqual(match['topic_name'], 'FONKSİYONLAR')

    def test_heading_inferred_from_child_codes(self):
        self.topic.code = ''
        self.topic.save(update_fields=['code'])
        match = _match_single_text('21.10', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['outcome_text'], 'FONKSİYONLAR')

    def test_trailing_dot_heading_code(self):
        match = _match_single_text('21.10.', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])

    def test_heading_without_outcomes_stays_topic(self):
        self.topic.outcomes.all().delete()
        match = _match_single_text('21.10', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['outcome_text'], 'FONKSİYONLAR')

    def test_short_unit_does_not_own_longer_sibling(self):
        match = _match_single_text('21.1', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['topic_name'], 'SAYILAR')
        self.assertNotEqual(match['outcome_text'], 'Fonksiyon tanımı')


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
        self.assertEqual(data['outcome_code'], '21.10')
        self.assertNotEqual(data['outcome_text'], 'Fonksiyon grafiği')
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


class UnboundHeadingRelinkTest(TestCase):
    """Başlık satırı çocuk kazanıma yapışmaz; tam kod sonra bağlanır."""

    def setUp(self):
        self.subject = Subject.objects.create(code='MATR', name='Matematik')
        self.topic = Topic.objects.create(
            subject=self.subject, code='21.10', name='SHG21 · FONKSİYONLAR',
        )
        self.exam = Exam.objects.create(name='Relink', exam_type='YKS_TYT')
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Matematik', question_start=1, question_end=2,
            subject=self.subject,
        )
        self.ak = AnswerKey.objects.create(exam=self.exam, booklet='')
        self.item = AnswerKeyItem.objects.create(
            answer_key=self.ak, section=self.section, question_number=1,
            correct_answer='A', imported_outcome_text='21.10',
        )

    def test_heading_does_not_bind_first_child(self):
        self.assertEqual(relink_unbound_answer_key(self.ak), 0)
        Outcome.objects.create(
            topic=self.topic, code='21.10.1', text='Fonksiyon kavramını açıklar.',
        )
        self.assertEqual(relink_unbound_answer_key(self.ak), 0)
        self.item.refresh_from_db()
        self.assertIsNone(self.item.outcome_id)

    def test_exact_child_code_links_after_outcome_added(self):
        self.item.imported_outcome_text = '21.10.1'
        self.item.save(update_fields=['imported_outcome_text'])
        self.assertEqual(relink_unbound_answer_key(self.ak), 0)

        added = Outcome.objects.create(
            topic=self.topic, code='21.10.1', text='Fonksiyon kavramını açıklar.',
        )
        self.assertEqual(relink_unbound_answer_key(self.ak), 1)
        self.item.refresh_from_db()
        self.assertEqual(self.item.outcome_id, added.id)
        data = AnswerKeyItemSerializer(self.item).data
        self.assertEqual(data['outcome_text'], 'Fonksiyon kavramını açıklar.')


class HeadingPrefixIsolationTest(TestCase):
    """21.1 Türkçe ünitesi 21.10 Geometri çocuklarını yutmamalı."""

    def setUp(self):
        self.subject = Subject.objects.create(code='MIX', name='Karışık')
        self.turkce = Topic.objects.create(
            subject=self.subject, code='21.1', name='SHG21 · SÖZEL', order=1,
        )
        self.geo = Topic.objects.create(
            subject=self.subject, code='21.10', name='SHG21 · GEOMETRİ', order=10,
        )
        self.tr_out = Outcome.objects.create(
            topic=self.turkce, code='21.1.1', text='Türkçe kazanım', order=0,
        )
        self.geo_out = Outcome.objects.create(
            topic=self.geo, code='21.10.1', text='Geometri kazanım', order=0,
        )

    def test_code_is_under_uses_segments(self):
        self.assertTrue(_code_is_under('21.1.2', '21.1'))
        self.assertFalse(_code_is_under('21.10.2', '21.1'))
        self.assertTrue(_code_is_under('21.10.1', '21.10'))
        self.assertFalse(_code_is_under('21.1.1', '21.10'))

    def test_heading_21_1_stays_verbal_topic(self):
        match = _match_single_text('21.1', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['topic_name'], 'SÖZEL')

    def test_heading_21_10_stays_geometry_topic(self):
        match = _match_single_text('21.10', self.subject)
        self.assertIsNotNone(match)
        self.assertEqual(match['match_type'], 'topic')
        self.assertIsNone(match['outcome_id'])
        self.assertEqual(match['topic_name'], 'GEOMETRİ')

    def test_child_codes_stay_in_own_unit(self):
        match = _match_single_text('21.1.1', self.subject)
        self.assertEqual(match['outcome_id'], self.tr_out.id)
        match = _match_single_text('21.10.1', self.subject)
        self.assertEqual(match['outcome_id'], self.geo_out.id)


class DetachFalseHeadingBindsTest(TestCase):
    """Önceki prefix hatasının yazdığı başlık→çocuk bağlarını çözer."""

    def setUp(self):
        self.subject = Subject.objects.create(code='FIX', name='Düzelt')
        self.turkce = Topic.objects.create(
            subject=self.subject, code='21.1', name='SHG21 · SÖZEL',
        )
        self.geo = Topic.objects.create(
            subject=self.subject, code='21.10', name='SHG21 · GEOMETRİ',
        )
        self.tr_out = Outcome.objects.create(
            topic=self.turkce, code='21.1.1', text='Türkçe kazanım',
        )
        self.geo_out = Outcome.objects.create(
            topic=self.geo, code='21.10.1', text='Geometri kazanım',
        )
        self.exam = Exam.objects.create(name='Detach', exam_type='YKS_TYT')
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Karışık', question_start=1, question_end=3,
            subject=self.subject,
        )
        self.ak = AnswerKey.objects.create(exam=self.exam, booklet='')

    def test_detaches_heading_bound_to_other_unit_child(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.ak, section=self.section, question_number=1,
            correct_answer='A', outcome=self.geo_out,
            imported_outcome_text='21.1',
        )
        self.assertEqual(detach_false_heading_binds(self.ak), 1)
        item.refresh_from_db()
        self.assertIsNone(item.outcome_id)

    def test_detaches_heading_bound_to_own_first_child(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.ak, section=self.section, question_number=2,
            correct_answer='B', outcome=self.geo_out,
            imported_outcome_text='21.10',
        )
        self.assertEqual(detach_false_heading_binds(self.ak), 1)
        item.refresh_from_db()
        self.assertIsNone(item.outcome_id)

    def test_keeps_exact_child_code_bind(self):
        item = AnswerKeyItem.objects.create(
            answer_key=self.ak, section=self.section, question_number=3,
            correct_answer='C', outcome=self.geo_out,
            imported_outcome_text='21.10.1',
        )
        self.assertEqual(detach_false_heading_binds(self.ak), 0)
        item.refresh_from_db()
        self.assertEqual(item.outcome_id, self.geo_out.id)


class CrossSubjectCurriculumMatchTest(TestCase):
    """Felsefe/Din satırı Edebiyat, Biyoloji, Türkçe, Mat kodunu yutmamalı."""

    def setUp(self):
        self.felsefe = Subject.objects.create(code='FELSEFE_TYT', name='Felsefe')
        self.din = Subject.objects.create(code='DINKUL_TYT', name='Din Kültürü')
        self.ede = Subject.objects.create(code='TDE_AYT', name='Türk Dili ve Edebiyatı')
        self.bio = Subject.objects.create(code='BIO_TYT', name='Biyoloji')
        self.turkce = Subject.objects.create(code='TURKCE_TYT', name='Türkçe')
        self.mat = Subject.objects.create(code='MAT_TYT', name='Matematik')

        giris = Topic.objects.create(
            subject=self.ede, code='11.1', name='11. sınıf · TÜRK DİLİ VE EDEBİYATINA GİRİŞ',
        )
        out = Outcome.objects.create(topic=giris, code='11.1.1', text='Edebiyat ve toplum')
        self.ede_sub = SubOutcome.objects.create(
            outcome=out, code='11.1.1.1', text='Edebiyatın toplumla ilişkisini belirler.',
        )
        siiri = Topic.objects.create(subject=self.ede, code='10.3', name='10. sınıf · ŞİİR')
        siiri_out = Outcome.objects.create(topic=siiri, code='10.3.1', text='Şiir')
        SubOutcome.objects.create(
            outcome=siiri_out, code='10.3.1.2',
            text='Destan Dönemi Türk şiirinin genel özelliklerini açıklar.',
        )
        eko = Topic.objects.create(
            subject=self.bio, code='10.3',
            name='10. sınıf · EKOSİSTEM EKOLOJİSİ VE GÜNCEL ÇEVRE SORUNLARI',
        )
        eko_out = Outcome.objects.create(topic=eko, code='10.3.1', text='Ekoloji')
        SubOutcome.objects.create(
            outcome=eko_out, code='10.3.1.4',
            text='Madde döngüleri ve hayatın sürdürülebilirliği arasında ilişki kurar.',
        )
        paragraf = Topic.objects.create(
            subject=self.turkce, code='21.5', name='SHG21 · PARAGRAF YORUMU',
        )
        self.tr_out = Outcome.objects.create(
            topic=paragraf, code='21.5.1', text='Paragrafta Ana Düşünce (Ana Fikir)',
        )
        esitsiz = Topic.objects.create(
            subject=self.mat, code='21.19', name='SHG21 · EŞİTSİZLİKLER',
        )
        Outcome.objects.create(topic=esitsiz, code='21.19.1', text='Eşitsizlikler')

        own = Topic.objects.create(
            subject=self.felsefe, code='10.1', name='10. sınıf · FELSEFEYE GİRİŞ',
        )
        self.fel_out = Outcome.objects.create(
            topic=own, code='10.1.1', text='Felsefenin anlamını açıklar.',
        )

    def test_felsefe_does_not_match_edebiyat_or_biology(self):
        self.assertIsNone(_match_single_text('11.1.1.1', self.felsefe))
        self.assertIsNone(_match_single_text('10.3.1.2', self.felsefe))
        self.assertIsNone(_match_single_text('10.3.1.4', self.felsefe))

    def test_din_does_not_match_turkce_or_math(self):
        self.assertIsNone(_match_single_text('21.5.1', self.din))
        self.assertIsNone(_match_single_text('21.19.1', self.din))

    def test_home_subject_still_matches_own_code(self):
        match = _match_single_text('10.1.1', self.felsefe)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_id'], self.fel_out.id)

    def test_same_code_on_other_subject_does_not_hide_home(self):
        """MEB kodları dersler arası tekrarlanır; ev dersindeki 10.1.1 kaybolmamalı."""
        other_topic = Topic.objects.create(
            subject=self.ede, code='10.1', name='10. sınıf · EDEBİYAT METİNLERİ',
        )
        Outcome.objects.create(topic=other_topic, code='10.1.1', text='Edebiyat 10.1.1')
        match = _match_single_text('10.1.1', self.felsefe)
        self.assertIsNotNone(match)
        self.assertEqual(match['outcome_id'], self.fel_out.id)
        self.assertEqual(match['outcome_text'], 'Felsefenin anlamını açıklar.')

    def test_polluted_felsefe_copy_is_rejected(self):
        leaked = Topic.objects.create(
            subject=self.felsefe, code='11.1',
            name='11. sınıf · TÜRK DİLİ VE EDEBİYATINA GİRİŞ',
        )
        leaked_out = Outcome.objects.create(topic=leaked, code='11.1.1', text='Kopya')
        SubOutcome.objects.create(
            outcome=leaked_out, code='11.1.1.1',
            text='Edebiyatın toplumla ilişkisini belirler.',
        )
        self.assertIsNone(_match_single_text('11.1.1.1', self.felsefe))

    def test_detaches_foreign_bind_on_felsefe_section(self):
        exam = Exam.objects.create(name='TYT Sosyal', exam_type='YKS_TYT')
        section = ExamSection.objects.create(
            exam=exam, name='Felsefe', question_start=51, question_end=55,
            subject=self.felsefe,
        )
        ak = AnswerKey.objects.create(exam=exam, booklet='')
        item = AnswerKeyItem.objects.create(
            answer_key=ak, section=section, question_number=51,
            correct_answer='B', outcome=self.ede_sub.outcome,
            imported_outcome_text='11.1.1.1',
        )
        self.assertEqual(detach_foreign_outcome_binds(ak), 1)
        item.refresh_from_db()
        self.assertIsNone(item.outcome_id)


class UnmatchedCodeSearchTest(TestCase):
    """Arama, cevap anahtarına bağlı olmayan kodları da bulmalı; 21.1 ≠ 21.10."""

    def setUp(self):
        self.mat = Subject.objects.create(code='MAT_TYT', name='Matematik')
        self.turkce = Subject.objects.create(code='TURKCE_TYT', name='Türkçe')
        sayilar = Topic.objects.create(
            subject=self.mat, code='21.1', name='SHG21 · SAYILAR',
        )
        self.out_211 = Outcome.objects.create(
            topic=sayilar, code='21.1.1', text='Doğal sayılar',
        )
        fonk = Topic.objects.create(
            subject=self.mat, code='21.10', name='SHG21 · FONKSİYONLAR',
        )
        self.out_2110 = Outcome.objects.create(
            topic=fonk, code='21.10.1', text='Fonksiyon tanımı',
        )
        self.out_21102 = Outcome.objects.create(
            topic=fonk, code='21.10.2', text='Fonksiyon grafiği',
        )
        paragraf = Topic.objects.create(
            subject=self.turkce, code='21.5', name='SHG21 · PARAGRAF YORUMU',
        )
        Outcome.objects.create(
            topic=paragraf, code='21.5.1', text='Paragrafta Ana Düşünce (Ana Fikir)',
        )

    def test_startswith_style_prefix_must_not_match_sibling_unit(self):
        self.assertTrue(_code_is_under('21.1.2', '21.1'))
        self.assertFalse(_code_is_under('21.10.2', '21.1'))
        self.assertTrue(_code_query_hits('21.1.1', '21.1'))
        self.assertFalse(_code_query_hits('21.10.2', '21.1'))
        self.assertTrue('21.10.2'.startswith('21.1'))  # string bug; segment must reject

    def test_search_finds_unmatched_code_on_home_subject(self):
        hits = search_subject_outcomes(self.mat, '21.10.1')
        codes = {row['outcome_code'] for row in hits}
        self.assertIn('21.10.1', codes)
        self.assertNotIn('21.5.1', codes)

    def test_search_21_1_does_not_return_21_10(self):
        hits = search_subject_outcomes(self.mat, '21.1')
        codes = {row['outcome_code'] for row in hits}
        self.assertIn('21.1.1', codes)
        self.assertNotIn('21.10.1', codes)
        self.assertNotIn('21.10.2', codes)

    def test_search_unmatched_text_on_home_subject(self):
        hits = search_subject_outcomes(self.mat, 'Fonksiyon tanımı')
        self.assertTrue(any(row['outcome_id'] == self.out_2110.id for row in hits))

    def test_search_does_not_return_other_subject(self):
        hits = search_subject_outcomes(self.mat, 'Paragrafta')
        self.assertEqual(hits, [])
        hits = search_subject_outcomes(self.turkce, '21.5.1')
        self.assertEqual(len(hits), 1)
        self.assertEqual(hits[0]['outcome_code'], '21.5.1')
