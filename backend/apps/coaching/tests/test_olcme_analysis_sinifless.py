"""
Analiz endpoint'leri — sınıfı atanmamış OgrenciKayit 500 üretmemeli.
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
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sube.domain.models import Sube

User = get_user_model()


class OlcmeAnalysisSiniflessKayitTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Analiz Sinifsiz Kurum', kod='ASNZ')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ASNZ-A')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='olcmesinifless', password='test')
        self.client.force_authenticate(user=self.user)

        self.exam = Exam.objects.create(
            name='Sınıfsız Kayıt Analiz Testi',
            exam_type='DENEME',
            status=Exam.Status.RESULTS_UPLOADED,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=1, question_start=1, question_end=40,
        )
        self.session = ExamSession.objects.create(
            exam=self.exam, status=ExamSession.Status.COMPLETED, original_filename='test.dat',
        )

        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Sınıfsız', soyad='Öğrenci',
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            sinif=None,
            aktif_mi=True,
        )
        answer = StudentAnswer.objects.create(
            session=self.session,
            student=self.ogrenci,
            raw_student_id='1001',
            raw_student_name='Sınıfsız Öğrenci',
            total_correct=20,
            total_wrong=8,
            total_empty=12,
            total_net=Decimal('18.00'),
        )
        StudentSectionScore.objects.create(
            student_answer=answer, section=self.section,
            correct=20, wrong=8, empty=12, net=Decimal('18.00'),
        )
        self.answer = answer
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.base = f'/api/coaching/olcme-degerlendirme/exams/{self.exam.id}/analysis'

    def test_rankings_ok_without_sinif(self):
        res = self.client.get(f'{self.base}/rankings/', **self.headers)
        self.assertEqual(res.status_code, 200)
        row = res.json()['rankings'][0]
        self.assertEqual(row['sinif'], '')

    def test_students_ok_without_sinif(self):
        res = self.client.get(f'{self.base}/students/', **self.headers)
        self.assertEqual(res.status_code, 200)
        row = res.json()['students'][0]
        self.assertEqual(row['sinif'], '')

    def test_student_detail_ok_without_sinif(self):
        res = self.client.get(
            f'{self.base}/students/{self.answer.id}/detail/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['sinif'], '')
        self.assertIn('exam_name', data)
        self.assertIn('answer_grids', data)
        self.assertIn('topic_blocks', data)
        self.assertIn('profil_foto', data)
        self.assertIsNone(data['profil_foto'])

    def test_classes_groups_sinifsiz(self):
        res = self.client.get(f'{self.base}/classes/', **self.headers)
        self.assertEqual(res.status_code, 200)
        names = {c['sinif_name'] for c in res.json()['classes']}
        self.assertIn('Sınıfsız', names)
