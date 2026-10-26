import json
from datetime import date

from django.test import override_settings

from apps.coaching.olcme_degerlendirme.models import (
    Exam,
    ExamSection,
    ExamSession,
    StudentAnswer,
    StudentSectionScore,
)
from apps.mobile_identity.tests.test_teacher_read import TeacherReadTests


class TeacherExamTests(TeacherReadTests):
    def _publish(
        self,
        name,
        exam_type,
        when,
        sections,
        *,
        student=None,
        sube=None,
        status='COMPLETED',
        session_status='COMPLETED',
    ):
        exam = Exam.objects.create(
            name=name,
            exam_type=exam_type,
            status=status,
            kurum=self.kurum,
            sube=self.sube if sube is None else sube,
            egitim_yili=self.year,
            exam_date=when,
            is_active=True,
        )
        session = ExamSession.objects.create(exam=exam, status=session_status)
        answer = StudentAnswer.objects.create(
            session=session,
            student=student or self.student,
            total_net='99.00',
            is_processed=True,
        )
        for section_name, correct, wrong, empty, net, start, end in sections:
            section = ExamSection.objects.create(
                exam=exam,
                name=section_name,
                question_start=start,
                question_end=end,
            )
            StudentSectionScore.objects.create(
                student_answer=answer,
                section=section,
                correct=correct,
                wrong=wrong,
                empty=empty,
                net=net,
            )
        return exam

    def test_exam_analysis_keeps_only_the_teachers_subject(self):
        self._publish(
            'Eylül TYT',
            'YKS_TYT',
            date(2026, 9, 12),
            [
                ('Matematik', 22, 4, 4, '21.00', 1, 30),
                ('Geometri', 8, 2, 0, '7.50', 31, 40),
                ('Türkçe', 20, 4, 16, '19.00', 1, 40),
            ],
        )
        self._publish(
            'Ekim TYT',
            'YKS_TYT',
            date(2026, 10, 3),
            [('Matematik', 24, 0, 6, '24.00', 1, 30)],
        )
        self._publish(
            'Ekim AYT',
            'YKS_AYT',
            date(2026, 10, 10),
            [
                ('Matematik', 18, 4, 8, '17.00', 1, 30),
                ('Edebiyat', 20, 0, 4, '20.00', 1, 24),
            ],
        )
        self._publish(
            'Yabancı deneme',
            'YKS_TYT',
            date(2026, 9, 20),
            [('Matematik', 1, 0, 0, '1.00', 1, 40)],
            sube=self.other_sube,
        )
        self._publish(
            'Taslak deneme',
            'YKS_TYT',
            date(2026, 9, 21),
            [('Matematik', 40, 0, 0, '40.00', 1, 40)],
            status='DRAFT',
        )
        self._publish(
            'Bekleyen deneme',
            'YKS_TYT',
            date(2026, 9, 22),
            [('Matematik', 10, 0, 0, '10.00', 1, 40)],
            session_status='PENDING',
        )

        response = self._get(
            f'/api/teacher/students/{self.student.id}/exams/?term_id={self.term.id}',
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body['ders'], 'Matematik')
        self.assertEqual([group['code'] for group in body['groups']], ['YKS_TYT', 'YKS_AYT'])
        tyt, ayt = body['groups']
        self.assertEqual(tyt['label'], 'TYT')
        self.assertEqual([row['name'] for row in tyt['exams']], ['Eylül TYT', 'Ekim TYT'])
        self.assertEqual(tyt['exams'][0]['net'], 28.5)
        self.assertEqual(tyt['exams'][0]['correct'], 30)
        self.assertEqual(tyt['exams'][0]['wrong'], 6)
        self.assertEqual(tyt['exams'][0]['empty'], 4)
        self.assertEqual(tyt['exams'][0]['question_count'], 40)
        self.assertIsNone(tyt['exams'][0]['delta'])
        self.assertEqual(tyt['exams'][1]['net'], 24.0)
        self.assertEqual(tyt['exams'][1]['delta'], -4.5)
        self.assertEqual(tyt['last_net'], 24.0)
        self.assertEqual(tyt['average_net'], 26.25)
        self.assertEqual(tyt['delta'], -4.5)
        self.assertEqual(ayt['label'], 'AYT')
        self.assertEqual(ayt['exams'][0]['net'], 17.0)
        self.assertEqual(ayt['topics'], [])
        raw = json.dumps(body, ensure_ascii=False)
        self.assertNotIn('Türkçe', raw)
        self.assertNotIn('Edebiyat', raw)
        self.assertNotIn('Yabancı', raw)
        self.assertNotIn('Taslak', raw)
        self.assertNotIn('Bekleyen', raw)
        self.assertNotIn('total_net', raw)
        self.assertNotIn('99', raw)
        self.assertNotIn('puan', raw)
        self.assertNotIn('veli', raw)
        hidden = self._get(
            f'/api/teacher/students/{self.other_student.id}/exams/?term_id={self.term.id}',
        )
        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(hidden.json()['code'], 'not_found')

    def test_private_student_exams_use_the_private_lesson(self):
        self._publish(
            'Özel TYT',
            'YKS_TYT',
            date(2026, 9, 20),
            [('Matematik', 12, 2, 1, '11.50', 1, 40)],
            student=self.private_student,
        )
        response = self._get(
            f'/api/teacher/students/{self.private_student.id}/exams/?term_id={self.term.id}',
        )
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertEqual(body['ders'], 'Matematik')
        self.assertEqual(body['groups'][0]['exams'][0]['net'], 11.5)

    @override_settings(MOBILE_IDENTITY_ENABLED=False)
    def test_flag_off_hides_exam_analysis(self):
        response = self._get(
            f'/api/teacher/students/{self.student.id}/exams/?term_id={self.term.id}',
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['code'], 'not_found')
