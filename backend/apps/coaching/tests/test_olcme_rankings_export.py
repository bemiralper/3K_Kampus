"""
Sıralama listesi Excel/CSV dışa aktarma — /exams/{pk}/analysis/rankings/?format=xlsx|csv
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamSection, ExamSession, StudentAnswer, StudentSectionScore,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class OlcmeRankingsExportAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Sıralama Export Kurum', kod='SEXP')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez Şube', kod='SEXP-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='olcmeexport', password='test')
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='Deneme Sınavı Export Testi',
            exam_type='DENEME',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
        )
        self.turkce = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=40,
        )
        self.matematik = ExamSection.objects.create(
            exam=self.exam, name='Matematik', order=2, question_start=41, question_end=80,
        )

        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='test.dat',
        )

        self.ogrenciler = []
        for i in range(3):
            ogrenci = Ogrenci.objects.create(
                kurum=self.kurum, sube=self.sube, ad=f'Öğrenci{i}', soyad='Test',
            )
            self.ogrenciler.append(ogrenci)
            correct = 30 - i * 5
            wrong = 5 + i
            empty = 40 - correct - wrong
            net = Decimal(correct) - Decimal(wrong) / Decimal(4)
            answer = StudentAnswer.objects.create(
                session=self.session,
                student=ogrenci,
                raw_student_id=str(1000 + i),
                raw_student_name=f'Öğrenci{i} Test',
                total_correct=correct * 2,
                total_wrong=wrong * 2,
                total_empty=empty * 2,
                total_net=net * 2,
            )
            for section in (self.turkce, self.matematik):
                StudentSectionScore.objects.create(
                    student_answer=answer, section=section,
                    correct=correct, wrong=wrong, empty=empty, net=net,
                )

        self.url = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/analysis/rankings/'
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_rankings_json_default(self):
        res = self.client.get(self.url, **self.headers)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data['rankings']), 3)
        self.assertIn('total_correct', data['rankings'][0])

    def test_rankings_export_xlsx(self):
        res = self.client.get(self.url, {'format': 'xlsx'}, **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            res['Content-Type'],
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        self.assertIn('Content-Disposition', res)
        self.assertGreater(len(res.content), 0)

    def test_rankings_export_csv(self):
        res = self.client.get(self.url, {'format': 'csv'}, **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('text/csv', res['Content-Type'])
        body = res.content.decode('utf-8-sig')
        self.assertIn('Öğrenci0 Test', body)
        self.assertIn('Sıra', body)
