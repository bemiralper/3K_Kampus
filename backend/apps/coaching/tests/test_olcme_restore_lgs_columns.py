from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.coaching.olcme_degerlendirme.models import (
    AnswerKey, AnswerKeyItem, Exam, ExamSection, ExamSession, MappingTemplate, StudentAnswer,
)
from apps.coaching.olcme_degerlendirme.services.exam_rescore import rescore_exam_results
from apps.coaching.olcme_degerlendirme.services.exam_templates import get_template_sections
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class RestoreLgsSocialColumnsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sütun', kod='SUT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SUT-M')
        self.exam = self.make_exam('Ters çevrilmiş')
        self.session = self.make_session(self.exam, inkilap_start=200, din_start=180)
        # Öğrenci İnkılap'ta hep C, Din'de hep B işaretledi; kayıtta yer değiştirmiş.
        self.answer = self.make_answer(self.session, inkilap='B', din='C')
        rescore_exam_results(self.exam)

    def make_exam(self, name):
        exam = Exam.objects.create(kurum=self.kurum, sube=self.sube, name=name, exam_type='LGS')
        sections = [
            ExamSection.objects.create(
                exam=exam, name=data['name'], order=order,
                question_start=data['question_start'], question_end=data['question_end'],
            )
            for order, data in enumerate(get_template_sections('LGS'))
        ]
        key = AnswerKey.objects.create(exam=exam, booklet='A', is_primary=True)
        AnswerKeyItem.objects.bulk_create([
            AnswerKeyItem(
                answer_key=key, section=section, question_number=number,
                correct_answer={'İnkılap Tarihi': 'C', 'Din Kültürü': 'B'}.get(section.name, 'A'),
            )
            for section in sections
            for number in range(section.question_start, section.question_end + 1)
        ])
        return exam

    def section(self, exam, name):
        return exam.sections.get(name=name)

    def make_session(self, exam, *, inkilap_start, din_start):
        inkilap, din = self.section(exam, 'İnkılap Tarihi'), self.section(exam, 'Din Kültürü')
        return ExamSession.objects.create(exam=exam, field_mappings=[
            {'field': f'ders_{inkilap.pk}', 'label': inkilap.name, 'start': inkilap_start, 'end': inkilap_start + 10},
            {'field': f'ders_{din.pk}', 'label': din.name, 'start': din_start, 'end': din_start + 10},
        ])

    def make_answer(self, session, *, inkilap, din):
        answers = {str(n): 'A' for n in range(1, 91)}
        answers.update({str(n): inkilap for n in range(21, 31)})
        answers.update({str(n): din for n in range(31, 41)})
        return StudentAnswer.objects.create(session=session, answers=answers, booklet='A')

    def correct(self, answer, name):
        return answer.section_scores.get(section__name=name).correct

    def run_command(self, *args):
        out = StringIO()
        call_command('restore_lgs_social_columns', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing(self):
        output = self.run_command('--exam', str(self.exam.pk))
        self.assertIn('Deneme', output)
        self.assertIn('İnkılap Tarihi 10.00', output)
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.answers['21'], 'B')
        self.assertEqual(self.correct(self.answer, 'İnkılap Tarihi'), 0)
        self.session.refresh_from_db()
        self.assertEqual(self.session.field_mappings[0]['start'], 200)

    def test_apply_restores_answers_mapping_and_scores_once(self):
        self.run_command('--exam', str(self.exam.pk), '--apply')
        self.answer.refresh_from_db()
        self.assertEqual((self.answer.answers['21'], self.answer.answers['31']), ('C', 'B'))
        self.assertEqual(self.correct(self.answer, 'İnkılap Tarihi'), 10)
        self.assertEqual(self.correct(self.answer, 'Din Kültürü'), 10)
        self.assertEqual(self.answer.total_correct, 90)
        self.session.refresh_from_db()
        self.assertEqual([m['start'] for m in self.session.field_mappings], [180, 200])

        output = self.run_command('--exam', str(self.exam.pk), '--apply')
        self.assertIn('zaten düz', output)
        self.answer.refresh_from_db()
        self.assertEqual(self.answer.answers['21'], 'C')

    def test_exam_read_in_form_order_is_left_alone(self):
        exam = self.make_exam('Din önce gelen optik')
        session = self.make_session(exam, inkilap_start=91, din_start=71)
        answer = self.make_answer(session, inkilap='C', din='B')
        rescore_exam_results(exam)
        # Din sütunu önde ama yalnız adı verilen sınava dokunulur.
        self.run_command('--exam', str(self.exam.pk), '--apply')
        answer.refresh_from_db()
        self.assertEqual(answer.answers['21'], 'C')
        self.assertEqual(self.correct(answer, 'İnkılap Tarihi'), 10)

    def test_template_is_restored_by_label(self):
        template = MappingTemplate.objects.create(kurum=self.kurum, name='LGS-8', exam_type='LGS', mappings=[
            {'field': 'ders_1', 'label': 'İnkılap Tarihi', 'start': 103, 'end': 113},
            {'field': 'ders_2', 'label': 'Din Kültürü', 'start': 83, 'end': 93},
        ])
        self.run_command('--template', str(template.pk), '--apply')
        template.refresh_from_db()
        self.assertEqual([m['start'] for m in template.mappings], [83, 103])
        self.assertIn('zaten düz', self.run_command('--template', str(template.pk), '--apply'))
