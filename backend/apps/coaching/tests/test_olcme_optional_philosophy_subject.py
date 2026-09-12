"""Felsefe (Seçmeli) ayrı müfredat dersi değil; Felsefe kazanımlarını kullanır."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.curriculum import Subject
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.exam_templates import (
    OPTIONAL_PHILOSOPHY_NAME,
    _apply_template_ranges,
    _auto_link_subjects,
    _resolve_curriculum_subject,
    create_sections_from_template,
    get_template_sections,
    get_template_sub_sections,
    purge_empty_exam_type_stubs,
    sync_optional_philosophy_section,
)


class ResolveCurriculumSubjectTest(TestCase):
    def test_reuses_short_code_instead_of_creating_tyt_alias(self):
        existing = Subject.objects.create(code='FELSEFE', name='Felsefe', display_name='Felsefe')
        resolved = _resolve_curriculum_subject('FELSEFE_TYT', 'Felsefe', 'YKS_TYT')
        self.assertEqual(resolved.id, existing.id)
        self.assertFalse(Subject.objects.filter(code='FELSEFE_TYT').exists())

    def test_prefers_named_curriculum_over_empty_tyt_stub(self):
        from apps.coaching.olcme_degerlendirme.models.curriculum import Topic

        stub = Subject.objects.create(code='BIO_TYT', name='Biyoloji', display_name='Biyoloji')
        real = Subject.objects.create(code='BIYOLOJI', name='Biyoloji', display_name='Biyoloji')
        Topic.objects.create(subject=real, code='9.1', name='Hücre')
        resolved = _resolve_curriculum_subject('BIO_TYT', 'Biyoloji', 'YKS_TYT')
        self.assertEqual(resolved.id, real.id)
        self.assertEqual(stub.topics.count(), 0)

    def test_creates_short_code_not_tyt_alias(self):
        resolved = _resolve_curriculum_subject('FELSEFE_TYT', 'Felsefe', 'YKS_TYT')
        self.assertEqual(resolved.code, 'FELSEFE')
        self.assertFalse(Subject.objects.filter(code='FELSEFE_TYT').exists())

    def test_purges_empty_tyt_stub_after_relink(self):
        from apps.coaching.olcme_degerlendirme.models.curriculum import Topic

        stub = Subject.objects.create(code='BIO_TYT', name='Biyoloji', display_name='Biyoloji')
        real = Subject.objects.create(code='BIYOLOJI', name='Biyoloji', display_name='Biyoloji')
        Topic.objects.create(subject=real, code='9.1', name='Hücre')
        exam = Exam.objects.create(name='TYT', exam_type='YKS_TYT')
        bio = ExamSection.objects.create(
            exam=exam, name='Biyoloji', question_start=120, question_end=125, subject=stub,
        )
        self.assertEqual(purge_empty_exam_type_stubs(), 1)
        bio.refresh_from_db()
        self.assertEqual(bio.subject_id, real.id)
        self.assertFalse(Subject.objects.filter(code='BIO_TYT').exists())

    def test_din_kulturu_uses_longer_curriculum_name(self):
        from apps.coaching.olcme_degerlendirme.models.curriculum import Topic

        stub = Subject.objects.create(code='DINKUL_TYT', name='Din Kültürü', display_name='Din Kültürü')
        real = Subject.objects.create(
            code='DKAB', name='Din Kültürü ve Ahlak Bilgisi', display_name='DKAB',
        )
        Topic.objects.create(subject=real, code='9.1', name='İnanç')
        resolved = _resolve_curriculum_subject('DINKUL_TYT', 'Din Kültürü', 'YKS_TYT')
        self.assertEqual(resolved.id, real.id)
        self.assertEqual(stub.topics.count(), 0)


class OptionalPhilosophySharesFelsefeSubjectTest(TestCase):
    def setUp(self):
        self.subject = Subject.objects.create(code='FELSEFE', name='Felsefe', display_name='Felsefe')
        self.exam = Exam.objects.create(name='TYT Deneme', exam_type='YKS_TYT')
        self.felsefe = ExamSection.objects.create(
            exam=self.exam, name='Felsefe', question_start=51, question_end=55,
            is_sub_section=True, subject=self.subject,
        )
        self.optional = ExamSection.objects.create(
            exam=self.exam, name=OPTIONAL_PHILOSOPHY_NAME,
            question_start=61, question_end=65, is_sub_section=False,
        )

    def test_optional_links_to_same_felsefe_subject(self):
        _auto_link_subjects(self.exam, [self.felsefe, self.optional])
        self.optional.refresh_from_db()
        self.assertEqual(self.optional.subject_id, self.subject.id)
        self.assertFalse(Subject.objects.filter(code='FELSEFE_TYT').exists())

    def test_optional_relinks_away_from_empty_alias_subject(self):
        alias = Subject.objects.create(code='FELSEFE_TYT', name='Felsefe', display_name='Felsefe')
        self.optional.subject = alias
        self.optional.save(update_fields=['subject'])

        _auto_link_subjects(self.exam, [self.felsefe, self.optional])
        self.optional.refresh_from_db()
        self.assertEqual(self.optional.subject_id, self.subject.id)


class OptionalPhilosophyIsSocialSubSectionTest(TestCase):
    def test_template_nests_under_sosyal_not_as_main(self):
        mains = get_template_sections('YKS_TYT', include_optional_philosophy=True)
        subs = get_template_sub_sections('YKS_TYT', include_optional_philosophy=True)
        self.assertNotIn(OPTIONAL_PHILOSOPHY_NAME, [row['name'] for row in mains])
        self.assertEqual(
            [row['name'] for row in mains],
            ['Türkçe', 'Sosyal Bilimler', 'Temel Matematik', 'Fen Bilimleri'],
        )
        sosyal_subs = [row['name'] for row in subs['Sosyal Bilimler']]
        self.assertEqual(
            sosyal_subs,
            ['Tarih', 'Coğrafya', 'Felsefe', 'Din Kültürü', OPTIONAL_PHILOSOPHY_NAME],
        )
        phil = next(row for row in subs['Sosyal Bilimler'] if row['name'] == OPTIONAL_PHILOSOPHY_NAME)
        self.assertEqual((phil['question_start'], phil['question_end']), (61, 65))
        sosyal = next(row for row in mains if row['name'] == 'Sosyal Bilimler')
        self.assertEqual((sosyal['question_start'], sosyal['question_end']), (41, 60))
        tmat = next(row for row in mains if row['name'] == 'Temel Matematik')
        self.assertEqual((tmat['question_start'], tmat['question_end']), (66, 105))

    def test_apply_ranges_reparents_existing_main_section(self):
        exam = Exam.objects.create(
            name='TYT Reparent', exam_type='YKS_TYT', include_optional_philosophy=True,
        )
        sosyal = ExamSection.objects.create(
            exam=exam, name='Sosyal Bilimler', question_start=41, question_end=60,
        )
        ExamSection.objects.create(
            exam=exam, name='Din Kültürü', question_start=56, question_end=60,
            is_sub_section=True, parent_section=sosyal,
        )
        phil = ExamSection.objects.create(
            exam=exam, name=OPTIONAL_PHILOSOPHY_NAME,
            question_start=61, question_end=65, is_sub_section=False,
        )
        _apply_template_ranges(exam, True)
        phil.refresh_from_db()
        self.assertTrue(phil.is_sub_section)
        self.assertEqual(phil.parent_section_id, sosyal.id)
        self.assertFalse(
            ExamSection.objects.filter(
                exam=exam, name=OPTIONAL_PHILOSOPHY_NAME, is_sub_section=False,
            ).exists()
        )


class EmptyTytStubRelinkTest(TestCase):
    """Sınav bölümü boş BIO_TYT kopyasına bağlıysa asıl Biyoloji'ye taşınır."""

    def test_biyoloji_section_leaves_empty_stub(self):
        from apps.coaching.olcme_degerlendirme.models.curriculum import Topic

        stub = Subject.objects.create(code='BIO_TYT', name='Biyoloji', display_name='Biyoloji')
        real = Subject.objects.create(code='BIYOLOJI', name='Biyoloji', display_name='Biyoloji')
        Topic.objects.create(subject=real, code='9.1', name='Hücre')
        exam = Exam.objects.create(name='Acil TYT', exam_type='YKS_TYT')
        fen = ExamSection.objects.create(
            exam=exam, name='Fen Bilimleri', question_start=106, question_end=125,
        )
        bio = ExamSection.objects.create(
            exam=exam, name='Biyoloji', question_start=120, question_end=125,
            is_sub_section=True, parent_section=fen, subject=stub,
        )
        _auto_link_subjects(exam, [fen, bio])
        bio.refresh_from_db()
        self.assertEqual(bio.subject_id, real.id)


class OptionalPhilosophyAytTemplateTest(TestCase):
    def test_template_nests_under_sosyal_2_not_as_main(self):
        mains = get_template_sections('YKS_AYT', include_optional_philosophy=True)
        subs = get_template_sub_sections('YKS_AYT', include_optional_philosophy=True)
        self.assertNotIn(OPTIONAL_PHILOSOPHY_NAME, [row['name'] for row in mains])
        self.assertEqual(
            [row['name'] for row in mains],
            ['TDE-Sosyal Bilimler-1', 'Sosyal Bilimler-2', 'Matematik', 'Fen Bilimleri'],
        )
        tde = next(row for row in mains if row['name'] == 'TDE-Sosyal Bilimler-1')
        sosyal = next(row for row in mains if row['name'] == 'Sosyal Bilimler-2')
        mat = next(row for row in mains if row['name'] == 'Matematik')
        fen = next(row for row in mains if row['name'] == 'Fen Bilimleri')
        self.assertEqual((tde['question_start'], tde['question_end']), (1, 40))
        self.assertEqual((sosyal['question_start'], sosyal['question_end']), (41, 80))
        self.assertEqual((mat['question_start'], mat['question_end']), (86, 125))
        self.assertEqual((fen['question_start'], fen['question_end']), (126, 165))

        sosyal_subs = [row['name'] for row in subs['Sosyal Bilimler-2']]
        self.assertEqual(
            sosyal_subs,
            [
                'Tarih-2', 'Coğrafya-2', 'Felsefe Grubu',
                'Din Kültürü ve Ahlak Bilgisi', OPTIONAL_PHILOSOPHY_NAME,
            ],
        )
        phil = next(row for row in subs['Sosyal Bilimler-2'] if row['name'] == OPTIONAL_PHILOSOPHY_NAME)
        self.assertEqual((phil['question_start'], phil['question_end']), (81, 85))
        bio = next(row for row in subs['Fen Bilimleri'] if row['name'] == 'Biyoloji')
        self.assertEqual((bio['question_start'], bio['question_end']), (153, 165))

    def test_template_without_optional_keeps_classic_ranges(self):
        mains = get_template_sections('YKS_AYT', include_optional_philosophy=False)
        subs = get_template_sub_sections('YKS_AYT', include_optional_philosophy=False)
        mat = next(row for row in mains if row['name'] == 'Matematik')
        fen = next(row for row in mains if row['name'] == 'Fen Bilimleri')
        self.assertEqual((mat['question_start'], mat['question_end']), (81, 120))
        self.assertEqual((fen['question_start'], fen['question_end']), (121, 160))
        self.assertNotIn(
            OPTIONAL_PHILOSOPHY_NAME,
            [row['name'] for row in subs['Sosyal Bilimler-2']],
        )

    def test_create_sections_links_to_felsefe_grubu_subject(self):
        subject = Subject.objects.create(code='FELSEFE', name='Felsefe', display_name='Felsefe')
        exam = Exam.objects.create(
            name='AYT Deneme', exam_type='YKS_AYT', include_optional_philosophy=True,
        )
        created = create_sections_from_template(exam)
        names = {sec.name: sec for sec in created}
        self.assertIn(OPTIONAL_PHILOSOPHY_NAME, names)
        phil = names[OPTIONAL_PHILOSOPHY_NAME]
        self.assertTrue(phil.is_sub_section)
        self.assertEqual(phil.parent_section.name, 'Sosyal Bilimler-2')
        self.assertEqual((phil.question_start, phil.question_end), (81, 85))
        self.assertEqual(phil.subject_id, subject.id)
        self.assertEqual(names['Felsefe Grubu'].subject_id, subject.id)

    def test_sync_insert_shifts_math_and_fen_keys(self):
        from apps.coaching.olcme_degerlendirme.models.answer_key import AnswerKey, AnswerKeyItem

        exam = Exam.objects.create(
            name='AYT Sync', exam_type='YKS_AYT', include_optional_philosophy=False,
        )
        create_sections_from_template(exam)
        mat = exam.sections.get(name='Matematik', is_sub_section=True)
        self.assertEqual((mat.question_start, mat.question_end), (81, 110))
        key = AnswerKey.objects.create(exam=exam, booklet='A', is_primary=True)
        item = AnswerKeyItem.objects.create(
            answer_key=key, section=mat, question_number=81, correct_answer='A',
        )

        exam.include_optional_philosophy = True
        exam.save(update_fields=['include_optional_philosophy'])
        sync_optional_philosophy_section(exam)

        item.refresh_from_db()
        self.assertEqual(item.question_number, 86)
        phil = exam.sections.get(name=OPTIONAL_PHILOSOPHY_NAME)
        self.assertEqual((phil.question_start, phil.question_end), (81, 85))
        mat.refresh_from_db()
        self.assertEqual((mat.question_start, mat.question_end), (86, 115))

    def test_sync_off_does_not_invent_section(self):
        exam = Exam.objects.create(
            name='AYT Classic', exam_type='YKS_AYT', include_optional_philosophy=False,
        )
        create_sections_from_template(exam)
        sync_optional_philosophy_section(exam)
        self.assertFalse(
            exam.sections.filter(name=OPTIONAL_PHILOSOPHY_NAME).exists(),
        )
        mat = exam.sections.get(name='Matematik', is_sub_section=False)
        self.assertEqual((mat.question_start, mat.question_end), (81, 120))


class OptionalPhilosophyAnswerGridTest(TestCase):
    def test_ayt_grid_includes_optional_block(self):
        from apps.coaching.olcme_degerlendirme.views.analysis_views import _build_answer_grids

        exam = Exam.objects.create(
            name='AYT Grid', exam_type='YKS_AYT', include_optional_philosophy=True,
        )
        create_sections_from_template(exam)
        grids = _build_answer_grids(exam, {})
        names = [g['section_name'] for g in grids]
        self.assertIn(OPTIONAL_PHILOSOPHY_NAME, names)
        self.assertNotIn('Sosyal Bilimler-2', names)
        phil = next(g for g in grids if g['section_name'] == OPTIONAL_PHILOSOPHY_NAME)
        self.assertEqual([q['q'] for q in phil['questions']], [81, 82, 83, 84, 85])
