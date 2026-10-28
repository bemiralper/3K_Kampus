"""11. sınıf AYT denemesi: dersler ve soru sayıları kitapçıkla aynı."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.curriculum_band import (
    BAND_YKS,
    band_is_locked,
    normalize_band,
    subject_filters_for_exam_type,
)
from apps.coaching.olcme_degerlendirme.services.development_analysis import (
    group_for_exam_type,
    types_for_group,
)
from apps.coaching.olcme_degerlendirme.views.analysis_views import _section_name_key
from apps.coaching.olcme_degerlendirme.views.curriculum_views import (
    detach_foreign_outcome_binds,
    match_text_for_section,
)
from apps.coaching.olcme_degerlendirme.services.exam_templates import (
    create_sections_from_template,
    get_default_duration,
    get_template_sections,
    get_template_sub_sections,
)
from apps.coaching.olcme_degerlendirme.services.scoring import (
    calculate_ayt11_score,
    calculate_score_for_exam,
    estimate_ranking,
)


class Ayt11TemplateTest(TestCase):
    def test_sections_match_booklet(self):
        sections = get_template_sections('AYT_11', include_optional_philosophy=True)
        subs = get_template_sub_sections('AYT_11', include_optional_philosophy=True)

        self.assertEqual(
            [(row['name'], row['question_count']) for row in sections],
            [
                ('Türk Dili', 30),
                ('Sosyal Bilimler', 30),
                ('Matematik', 30),
                ('Fen Bilimleri', 30),
            ],
        )
        self.assertEqual(
            [(row['name'], row['question_count']) for row in subs['Sosyal Bilimler']],
            [
                ('Tarih', 10),
                ('Coğrafya', 10),
                ('Felsefe', 5),
                ('Din Kültürü', 5),
            ],
        )
        self.assertEqual(
            [(row['name'], row['question_count']) for row in subs['Fen Bilimleri']],
            [
                ('Fizik', 10),
                ('Kimya', 10),
                ('Biyoloji', 10),
            ],
        )
        self.assertNotIn('Felsefe (Seçmeli)', {row['name'] for row in sections})
        self.assertEqual(sections[-1]['question_end'], 120)
        self.assertEqual(get_default_duration('AYT_11'), 165)

    def test_create_locks_yks_band_and_writes_ranges(self):
        exam = Exam.objects.create(name='11. Sınıf TG Deneme', exam_type='AYT_11')
        create_sections_from_template(exam)

        self.assertTrue(band_is_locked('AYT_11'))
        self.assertEqual(normalize_band('', 'AYT_11'), BAND_YKS)

        mains = list(
            ExamSection.objects.filter(exam=exam, is_sub_section=False).order_by('order')
        )
        self.assertEqual([s.question_count for s in mains], [30, 30, 30, 30])
        self.assertEqual(sum(s.question_count for s in mains), 120)

        sosyal = next(s for s in mains if s.name == 'Sosyal Bilimler')
        sosyal_subs = list(sosyal.sub_sections.order_by('order'))
        self.assertEqual([s.question_count for s in sosyal_subs], [10, 10, 5, 5])

        fen = next(s for s in mains if s.name == 'Fen Bilimleri')
        fen_subs = list(fen.sub_sections.order_by('order'))
        self.assertEqual([s.name for s in fen_subs], ['Fizik', 'Kimya', 'Biyoloji'])

    def test_score_scales_net_to_500_without_osym_weights(self):
        full = {
            'Türk Dili': 30,
            'Sosyal Bilimler': 30,
            'Matematik': 30,
            'Fen Bilimleri': 30,
        }
        self.assertEqual(calculate_ayt11_score(full)['puan'], 500.0)
        self.assertEqual(calculate_ayt11_score({name: 0 for name in full})['puan'], 0.0)
        self.assertEqual(
            calculate_ayt11_score({
                'Türk Dili': 15,
                'Sosyal Bilimler': 15,
                'Matematik': 15,
                'Fen Bilimleri': 15,
            })['puan'],
            250.0,
        )

        exam = Exam(exam_type='AYT_11')
        only_math = calculate_score_for_exam(exam, {'Matematik': 30})
        self.assertEqual(only_math['puan'], 125.0)
        self.assertIsNone(estimate_ranking(only_math['puan'], 'AYT_11', 2025)['tahmini_siralama'])

    def test_links_ayt_subjects_and_keeps_geometry_outcomes(self):
        exam = Exam.objects.create(name='11 bağ', exam_type='AYT_11')
        create_sections_from_template(exam)
        by_name = {
            row.name: row
            for row in ExamSection.objects.filter(exam=exam).select_related('subject')
        }

        self.assertEqual(by_name['Türk Dili'].subject.code, 'TDE')
        self.assertEqual(by_name['Türk Dili'].subject.exam_type_filter, 'YKS_AYT')
        self.assertEqual(by_name['Matematik'].subject.code, 'MATEMATIK')
        self.assertEqual(by_name['Fizik'].subject.code, 'FIZIK')
        self.assertEqual(by_name['Din Kültürü'].subject.code, 'DKAB')
        self.assertEqual(_section_name_key('Türk Dili'), 'edebiyat')
        self.assertEqual(group_for_exam_type('AYT_11'), 'AYT_11')
        self.assertEqual(types_for_group('AYT'), ('YKS_AYT',))
        self.assertNotIn('AYT_11', types_for_group('manuel'))
        self.assertEqual(subject_filters_for_exam_type('AYT_11'), ('ALL', 'YKS_AYT'))
        self.assertEqual(subject_filters_for_exam_type('YKS_TYT'), ('ALL', 'YKS_TYT'))

        geo = Subject.objects.create(
            code='GEOMETRI', name='Geometri', display_name='Geometri',
            exam_type_filter='YKS_AYT',
        )
        topic = Topic.objects.create(subject=geo, name='Üçgenler', code='11.1', order=1)
        outcome = Outcome.objects.create(
            topic=topic, code='11.1.1', text='Üçgende açı bağıntılarını uygular',
        )
        match = match_text_for_section(by_name['Matematik'], outcome.text)
        self.assertEqual(match['outcome_id'], outcome.id)

        key = AnswerKey.objects.create(exam=exam, booklet='A', is_primary=True)
        item = AnswerKeyItem.objects.create(
            answer_key=key, section=by_name['Matematik'], question_number=61,
            correct_answer='A', outcome=outcome, imported_outcome_text=outcome.text,
        )
        self.assertEqual(detach_foreign_outcome_binds(key), 0)
        item.refresh_from_db()
        self.assertEqual(item.outcome_id, outcome.id)
