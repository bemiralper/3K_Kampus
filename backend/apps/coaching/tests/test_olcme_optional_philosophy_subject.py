"""Felsefe (Seçmeli) ayrı müfredat dersi değil; Felsefe kazanımlarını kullanır."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.curriculum import Subject
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.exam_templates import (
    OPTIONAL_PHILOSOPHY_NAME,
    _apply_template_ranges,
    _auto_link_subjects,
    _resolve_curriculum_subject,
    get_template_sections,
    get_template_sub_sections,
)


class ResolveCurriculumSubjectTest(TestCase):
    def test_reuses_short_code_instead_of_creating_tyt_alias(self):
        existing = Subject.objects.create(code='FELSEFE', name='Felsefe', display_name='Felsefe')
        resolved = _resolve_curriculum_subject('FELSEFE_TYT', 'Felsefe', 'YKS_TYT')
        self.assertEqual(resolved.id, existing.id)
        self.assertFalse(Subject.objects.filter(code='FELSEFE_TYT').exists())


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
