"""Sınav listesi: tarih, varsayılan sıra, filtrelenmiş PDF."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam, ExamSessionModel
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()
EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class OlcmeExamListAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Liste Kurum', kod='LST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='LST-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='listeci', password='test')
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }

    def _exam(self, name, *, exam_date=None, created_offset=0, exam_type='DENEME'):
        exam = Exam.objects.create(
            name=name,
            exam_type=exam_type,
            exam_date=exam_date,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        if created_offset:
            Exam.objects.filter(pk=exam.pk).update(
                created_at=timezone.now() + timedelta(minutes=created_offset),
            )
            exam.refresh_from_db()
        return exam

    def test_list_includes_exam_date(self):
        self._exam('Tarihli', exam_date=date(2026, 3, 15))
        res = self.client.get(EXAMS_URL, **self.headers)
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.json() if r['name'] == 'Tarihli')
        self.assertEqual(row['exam_date'], '2026-03-15')

    def test_list_exam_date_falls_back_to_session(self):
        exam = self._exam('Oturumlu')
        ExamSessionModel.objects.create(
            exam=exam, name='1. Oturum', session_date=date(2026, 5, 8),
        )
        res = self.client.get(EXAMS_URL, **self.headers)
        self.assertEqual(res.status_code, 200)
        row = next(r for r in res.json() if r['name'] == 'Oturumlu')
        self.assertEqual(row['exam_date'], '2026-05-08')

    def test_list_default_newest_created_first(self):
        self._exam('Eski', created_offset=-10)
        self._exam('Yeni', created_offset=10)
        res = self.client.get(EXAMS_URL, **self.headers)
        self.assertEqual(res.status_code, 200)
        names = [r['name'] for r in res.json()]
        self.assertLess(names.index('Yeni'), names.index('Eski'))

    def test_list_pdf_returns_pdf(self):
        self._exam('PDF Sınav', exam_date=date(2026, 4, 1))
        res = self.client.get(f'{EXAMS_URL}list-pdf/', **self.headers)
        self.assertEqual(res.status_code, 200, res.content[:200])
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertIn('application/pdf', res['Content-Type'])

    def test_list_pdf_respects_search_filter(self):
        self._exam('TYT Deneme A')
        self._exam('AYT Deneme B')
        res = self.client.get(f'{EXAMS_URL}list-pdf/', {'search': 'TYT'}, **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content.startswith(b'%PDF'))
        self.assertGreater(len(res.content), 200)
