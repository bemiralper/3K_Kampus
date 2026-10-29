"""11. sınıf AYT denemesi: dersler ve soru sayıları kitapçıkla aynı."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem
from apps.coaching.olcme_degerlendirme.models.curriculum import Outcome, Subject, Topic
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.curriculum_band import (
    BAND_YKS,
    band_is_locked,
    curriculum_program_for_exam_type,
    normalize_band,
    subject_filters_for_exam_type,
    topic_program,
    topic_program_q,
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
    calculate_tyt11_score,
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

    def test_score_say_and_ea_without_osym_weights(self):
        only_math = calculate_ayt11_score({'Matematik': 30})
        self.assertEqual(only_math['puan_turleri']['SAY']['puan'], 250.0)
        self.assertEqual(only_math['puan_turleri']['SAY']['net'], 30.0)
        self.assertEqual(only_math['puan_turleri']['EA']['puan'], 187.5)
        self.assertEqual(only_math['puan'], 250.0)

        full_say = {'Matematik': 30, 'Fizik': 10, 'Kimya': 10, 'Biyoloji': 10}
        self.assertEqual(calculate_ayt11_score(full_say)['puan_turleri']['SAY']['puan'], 500.0)

        full_ea = {'Türk Dili': 30, 'Tarih': 10, 'Coğrafya': 10, 'Matematik': 30}
        self.assertEqual(calculate_ayt11_score(full_ea)['puan_turleri']['EA']['puan'], 500.0)

        outside = calculate_ayt11_score({'Felsefe': 5, 'Din Kültürü': 5, 'Fen Bilimleri': 30})
        self.assertEqual(outside['puan_turleri']['SAY']['puan'], 0.0)
        self.assertEqual(outside['puan_turleri']['EA']['puan'], 0.0)

        exam = Exam(exam_type='AYT_11')
        via_exam = calculate_score_for_exam(exam, {'Matematik': 30})
        self.assertEqual(via_exam['puan_turleri']['SAY']['puan'], 250.0)
        self.assertIsNone(estimate_ranking(via_exam['puan'], 'AYT_11', 2025)['tahmini_siralama'])

    def test_rankings_export_has_say_and_ea_only(self):
        from apps.coaching.application.olcme_rankings_export import (
            build_export_columns,
            build_export_rows,
        )

        keys = [c.key for c in build_export_columns(is_ayt=True, pt_keys=('SAY', 'EA'))]
        self.assertIn('puan_say', keys)
        self.assertIn('puan_ea', keys)
        self.assertNotIn('puan_soz', keys)
        default_keys = [c.key for c in build_export_columns(is_ayt=True)]
        self.assertIn('puan_soz', default_keys)

        rows = build_export_rows(
            [
                {'answer_id': 1, 'puan_turleri': {'SAY': {'puan': 300}, 'EA': {'puan': 200}}},
                {'answer_id': 2, 'puan_turleri': {'SAY': {'puan': 100}, 'EA': {'puan': 400}}},
            ],
            is_ayt=True, include_avg_row=False, pt_keys=('SAY', 'EA'),
        )
        self.assertEqual([r['kurs_say'] for r in rows], [1, 2])
        self.assertEqual([r['kurs_ea'] for r in rows], [2, 1])
        self.assertNotIn('puan_soz', rows[0])

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
        topic = Topic.objects.create(
            subject=geo, name='Üçgenler', code='11.1', order=1, program='maarif',
        )
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

    def test_maarif_catalog_stays_off_yks_and_2018_stays_off_maarif(self):
        subject = Subject.objects.create(
            code='MATAYIR', name='Matematik', display_name='Matematik',
            exam_type_filter='YKS_AYT',
        )
        maarif_topic = Topic.objects.create(
            subject=subject, name='Fonksiyonlar', code='MAT.8.1',
            program='maarif', order=1,
        )
        y2018_topic = Topic.objects.create(
            subject=subject, name='Fonksiyonlar', code='9.1',
            program='program_2018', order=2,
        )
        shared = 'Fonksiyonun tanım kümesini belirler'
        maarif_out = Outcome.objects.create(
            topic=maarif_topic, code='MAT.8.1.1', text=shared,
        )
        y2018_out = Outcome.objects.create(
            topic=y2018_topic, code='9.1.1', text=shared,
        )
        maarif_exam = Exam.objects.create(name='11 Maarif', exam_type='AYT_11')
        yks_exam = Exam.objects.create(name='YKS', exam_type='YKS_TYT')
        lgs_exam = Exam.objects.create(name='LGS', exam_type='LGS')
        maarif_sec = ExamSection.objects.create(
            exam=maarif_exam, name='Matematik', subject=subject,
            question_start=61, question_end=90, order=0,
        )
        yks_sec = ExamSection.objects.create(
            exam=yks_exam, name='Temel Matematik', subject=subject,
            question_start=61, question_end=100, order=0,
        )
        lgs_sec = ExamSection.objects.create(
            exam=lgs_exam, name='Matematik', subject=subject,
            question_start=51, question_end=70, order=0,
        )

        self.assertEqual(curriculum_program_for_exam_type('AYT_11'), 'maarif')
        self.assertEqual(curriculum_program_for_exam_type('TYT_11'), 'maarif')
        self.assertEqual(curriculum_program_for_exam_type('YKS_TYT'), 'program_2018')
        self.assertEqual(curriculum_program_for_exam_type('YKS_AYT'), 'program_2018')
        self.assertEqual(curriculum_program_for_exam_type('DENEME'), 'program_2018')
        self.assertEqual(curriculum_program_for_exam_type('LGS'), '')

        self.assertEqual(match_text_for_section(maarif_sec, shared)['outcome_id'], maarif_out.id)
        self.assertEqual(match_text_for_section(yks_sec, shared)['outcome_id'], y2018_out.id)
        self.assertIsNone(match_text_for_section(yks_sec, 'MAT.8.1.1'))
        self.assertIsNone(match_text_for_section(maarif_sec, '9.1.1'))
        self.assertIsNotNone(match_text_for_section(lgs_sec, shared))

    def test_ortaokul_maarif_without_program_field_is_still_maarif(self):
        """maarif_ortaokul program yazmaz; resmi ünite kodu yine Maarif sayılır."""
        subject = Subject.objects.create(
            code='MATORTA', name='Matematik', display_name='Matematik',
            exam_type_filter='ALL',
        )
        orta = Topic.objects.create(
            subject=subject, name='8. sınıf · Sayılar', code='MAT.8.1', order=1,
        )
        turkce = Topic.objects.create(
            subject=subject, name='5. sınıf · Okuma', code='T.O.5', order=2,
        )
        y2018 = Topic.objects.create(
            subject=subject, name='Sayılar', code='M.9.1', order=3,
        )
        self.assertEqual(orta.program, 'program_2018')
        self.assertEqual(topic_program(orta), 'maarif')
        self.assertEqual(topic_program(turkce), 'maarif')
        self.assertEqual(topic_program(y2018), 'program_2018')
        self.assertEqual(
            set(Topic.objects.filter(topic_program_q('maarif'), subject=subject)),
            {orta, turkce},
        )
        self.assertEqual(
            list(Topic.objects.filter(topic_program_q('program_2018'), subject=subject)),
            [y2018],
        )

        text = 'Tam sayılarla çarpma işlemini modeller'
        orta_out = Outcome.objects.create(topic=orta, code='MAT.8.1.1', text=text)
        maarif_exam = Exam.objects.create(name='11 TYT', exam_type='TYT_11')
        yks_exam = Exam.objects.create(name='TYT', exam_type='YKS_TYT')
        maarif_sec = ExamSection.objects.create(
            exam=maarif_exam, name='Temel Matematik', subject=subject,
            question_start=61, question_end=100, order=0,
        )
        yks_sec = ExamSection.objects.create(
            exam=yks_exam, name='Temel Matematik', subject=subject,
            question_start=61, question_end=100, order=0,
        )
        self.assertEqual(match_text_for_section(maarif_sec, text)['outcome_id'], orta_out.id)
        self.assertEqual(match_text_for_section(maarif_sec, 'MAT.8.1.1')['outcome_id'], orta_out.id)
        self.assertIsNone(match_text_for_section(yks_sec, text))
        self.assertIsNone(match_text_for_section(yks_sec, 'MAT.8.1.1'))


class Tyt11TemplateTest(TestCase):
    def test_booklet_includes_optional_philosophy_by_default(self):
        sections = get_template_sections('TYT_11', include_optional_philosophy=True)
        subs = get_template_sub_sections('TYT_11', include_optional_philosophy=True)
        self.assertEqual(
            [(row['name'], row['question_count']) for row in sections],
            [
                ('Türkçe', 40),
                ('Sosyal Bilimler', 20),
                ('Temel Matematik', 40),
                ('Fen Bilimleri', 20),
            ],
        )
        self.assertEqual(sections[-1]['question_end'], 125)
        sosyal = subs['Sosyal Bilimler']
        self.assertEqual(
            [row['name'] for row in sosyal],
            ['Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', 'Felsefe (Seçmeli)'],
        )
        phil = sosyal[-1]
        self.assertEqual((phil['question_start'], phil['question_end']), (61, 65))
        temel = next(row for row in sections if row['name'] == 'Temel Matematik')
        self.assertEqual((temel['question_start'], temel['question_end']), (66, 105))
        self.assertEqual(subs['Fen Bilimleri'][-1]['question_end'], 125)

        plain = get_template_sections('TYT_11', include_optional_philosophy=False)
        self.assertEqual(plain[-1]['question_end'], 120)
        self.assertEqual(get_default_duration('TYT_11'), 165)

        exam = Exam.objects.create(name='11 TYT', exam_type='TYT_11')
        create_sections_from_template(exam)
        self.assertTrue(band_is_locked('TYT_11'))
        self.assertEqual(normalize_band('', 'TYT_11'), BAND_YKS)
        turkce = ExamSection.objects.get(exam=exam, name='Türkçe')
        self.assertEqual(turkce.subject.code, 'TURKCE')
        secimli = ExamSection.objects.get(exam=exam, name='Felsefe (Seçmeli)')
        self.assertEqual((secimli.question_start, secimli.question_end), (61, 65))
        self.assertEqual(secimli.subject.code, 'FELSEFE')
        self.assertEqual(secimli.parent_section.name, 'Sosyal Bilimler')
        self.assertEqual(turkce.subject.exam_type_filter, 'YKS_TYT')
        self.assertEqual(subject_filters_for_exam_type('TYT_11'), ('ALL', 'YKS_TYT'))
        self.assertEqual(group_for_exam_type('TYT_11'), 'TYT_11')
        self.assertEqual(types_for_group('TYT'), ('YKS_TYT',))
        self.assertNotIn('TYT_11', types_for_group('manuel'))

        full = calculate_tyt11_score({
            'Türkçe': 40,
            'Sosyal Bilimler': 20,
            'Temel Matematik': 40,
            'Fen Bilimleri': 20,
        })
        self.assertEqual(full['puan'], 500.0)
        self.assertEqual(full['toplam_net'], 120.0)
        elif_solak = calculate_tyt11_score({
            'Türkçe': 24.50,
            'Sosyal Bilimler': 5.75,
            'Temel Matematik': 5.50,
            'Fen Bilimleri': 2.50,
        })
        self.assertAlmostEqual(elif_solak['puan'], 257.05, places=2)
        self.assertAlmostEqual(elif_solak['toplam_net'], 38.25, places=2)
        negative_fen = calculate_tyt11_score({
            'Türkçe': 23.25,
            'Sosyal Bilimler': 2.50,
            'Temel Matematik': 6.75,
            'Fen Bilimleri': -2.00,
        })
        self.assertAlmostEqual(negative_fen['puan'], 233.36, places=2)
        overridden = calculate_tyt11_score(
            {'Türkçe': 10},
            coefficients={
                'Türkçe': 1, 'Sosyal Bilimler': 1,
                'Temel Matematik': 1, 'Fen Bilimleri': 1, '_base': 100,
            },
        )
        self.assertEqual(overridden['puan'], 110.0)
        half = calculate_score_for_exam(Exam(exam_type='TYT_11'), {'Türkçe': 40, 'Fen Bilimleri': 20})
        self.assertAlmostEqual(half['puan'], 324.25, places=2)
        self.assertIsNone(estimate_ranking(half['puan'], 'TYT_11', 2025)['tahmini_siralama'])
