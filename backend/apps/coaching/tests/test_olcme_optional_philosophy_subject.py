"""Felsefe (Seçmeli) ayrı müfredat dersi değil; Felsefe kazanımlarını kullanır."""
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models.curriculum import Subject
from apps.coaching.olcme_degerlendirme.models.exam import Exam, ExamSection
from apps.coaching.olcme_degerlendirme.services.exam_templates import (
    OPTIONAL_PHILOSOPHY_NAME,
    _auto_link_subjects,
    _resolve_curriculum_subject,
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
