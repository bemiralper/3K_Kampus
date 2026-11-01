"""
Analiz — önceki sınav tarih sırasıyla seçilir; strateji yaprak dersten okunur.
"""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, ExamSession, StudentAnswer, StudentSectionScore,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class AnalysisTrendBase(TestCase):
    exam_type = 'YKS_TYT'

    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Trend Kurum', kod='TRND')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TRND-A')
        self.other_sube = Sube.objects.create(kurum=self.kurum, ad='Diğer', kod='TRND-B')
        self.user = User.objects.create_user(username='olcmetrend', password='test')
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def _exam(self, name, day, nets, *, sube=None, is_active=True):
        exam = Exam.objects.create(
            name=name, exam_type=self.exam_type,
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum, sube=sube or self.sube,
            exam_date=day, is_active=is_active,
        )
        section = ExamSection.objects.create(
            exam=exam, name='Türkçe', order=1, question_start=1, question_end=40,
        )
        session = ExamSession.objects.create(
            exam=exam, status=ExamSession.Status.COMPLETED, original_filename='t.dat',
        )
        for i, net in enumerate(nets):
            ogrenci = Ogrenci.objects.create(
                kurum=self.kurum, sube=exam.sube, ad=f'{name}{i}', soyad='Test',
            )
            answer = StudentAnswer.objects.create(
                session=session, student=ogrenci, raw_student_id=f'{exam.pk}-{i}',
                total_net=Decimal(net),
            )
            StudentSectionScore.objects.create(
                student_answer=answer, section=section, net=Decimal(net),
            )
        return exam

    def _get(self, exam, path):
        res = self.client.get(
            f'/api/coaching/olcme-degerlendirme/exams/{exam.id}/analysis/{path}/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.json()


class PreviousExamTest(AnalysisTrendBase):
    def setUp(self):
        super().setUp()
        # Kayıt sırası tarih sırasının tersi: ŞUBAT önce kaydedilir.
        self.feb = self._exam('Şubat', date(2026, 2, 10), ['20'])
        self.jan = self._exam('Ocak', date(2026, 1, 10), ['10'])
        self.mar = self._exam('Mart', date(2026, 3, 10), ['30'])
        self._exam('Başka şube', date(2026, 3, 1), ['5'], sube=self.other_sube)
        self._exam('Silinmiş', date(2026, 3, 5), ['5'], is_active=False)

    def test_summary_trend_uses_exam_date(self):
        trend = self._get(self.mar, 'summary')['trend']
        self.assertEqual(trend['prev_exam_name'], 'Şubat')
        self.assertEqual(trend['diff'], 10.0)

        trend = self._get(self.feb, 'summary')['trend']
        self.assertEqual(trend['prev_exam_name'], 'Ocak')

        self.assertIsNone(self._get(self.jan, 'summary')['trend'])

    def test_comparison_keeps_current_and_skips_later(self):
        rows = self._get(self.feb, 'comparison')['comparisons']
        self.assertEqual([r['exam_name'] for r in rows], ['Şubat', 'Ocak'])
        self.assertTrue(rows[0]['is_current'])

        rows = self._get(self.mar, 'comparison')['comparisons']
        self.assertEqual([r['exam_name'] for r in rows], ['Mart', 'Şubat', 'Ocak'])

    def test_comparison_includes_current_when_many_later_exams(self):
        for month in range(4, 11):
            self._exam(f'Ay {month}', date(2026, month, 1), ['15'])
        rows = self._get(self.jan, 'comparison')['comparisons']
        self.assertEqual([r['exam_name'] for r in rows], ['Ocak'])

    def test_previous_without_results_is_skipped(self):
        StudentAnswer.objects.filter(session__exam=self.feb).delete()
        trend = self._get(self.mar, 'summary')['trend']
        self.assertEqual(trend['prev_exam_name'], 'Ocak')


class StrategySectionsTest(AnalysisTrendBase):
    def _sections(self, exam):
        sosyal = ExamSection.objects.create(
            exam=exam, name='Sosyal Bilimler', order=2, question_start=41, question_end=50,
        )
        tarih = ExamSection.objects.create(
            exam=exam, name='Tarih', order=1, question_start=41, question_end=45,
            is_sub_section=True, parent_section=sosyal,
        )
        cografya = ExamSection.objects.create(
            exam=exam, name='Coğrafya', order=2, question_start=46, question_end=50,
            is_sub_section=True, parent_section=sosyal,
        )
        felsefe = ExamSection.objects.create(
            exam=exam, name='Felsefe (Seçmeli)', order=3, question_start=121, question_end=125,
            is_sub_section=True, parent_section=sosyal,
        )
        return sosyal, tarih, cografya, felsefe

    def test_strategy_skips_parent_and_optional_sections(self):
        exam = self._exam('Strateji', date(2026, 3, 10), ['30', '30'])
        sosyal, tarih, cografya, felsefe = self._sections(exam)
        for answer in StudentAnswer.objects.filter(session__exam=exam):
            StudentSectionScore.objects.create(student_answer=answer, section=sosyal, correct=1, net=Decimal('1'))
            StudentSectionScore.objects.create(student_answer=answer, section=tarih, correct=1, net=Decimal('1'))
            StudentSectionScore.objects.create(student_answer=answer, section=cografya, correct=0, empty=5, net=Decimal('0'))
            StudentSectionScore.objects.create(student_answer=answer, section=felsefe, empty=5, net=Decimal('0'))

        titles = [s['title'] for s in self._get(exam, 'strategy')['strategies']]
        self.assertTrue(any(t.startswith('Coğrafya') for t in titles))
        self.assertFalse(any(t.startswith('Sosyal Bilimler') for t in titles))
        self.assertFalse(any(t.startswith('Felsefe') for t in titles))


class StrategyAytAttemptedTest(AnalysisTrendBase):
    exam_type = 'YKS_AYT'

    def test_ayt_section_counts_only_students_who_attempted(self):
        exam = self._exam('AYT', date(2026, 3, 10), ['30', '30'])
        fizik = ExamSection.objects.create(
            exam=exam, name='Fizik', order=2, question_start=41, question_end=50,
        )
        a1, a2 = StudentAnswer.objects.filter(session__exam=exam).order_by('id')
        StudentSectionScore.objects.create(student_answer=a1, section=fizik, correct=8, net=Decimal('8'))
        StudentSectionScore.objects.create(student_answer=a2, section=fizik, empty=10, net=Decimal('0'))

        titles = [s['title'] for s in self._get(exam, 'strategy')['strategies']]
        self.assertIn('Fizik — İyi Performans', titles)
        self.assertFalse(any(t.startswith('Fizik — Kritik') for t in titles))
