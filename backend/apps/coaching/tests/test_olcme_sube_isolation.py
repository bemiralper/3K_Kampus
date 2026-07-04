"""
Şube zorunluluğu — ölçme değerlendirme sınav endpoint'leri.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class OlcmeSubeIsolationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Ölçme Iso Kurum', kod='OISO')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='OISO-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='OISO-B')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )
        self.user = User.objects.create_user(username='olcmeiso', password='test')
        self.client.force_authenticate(user=self.user)

        self.exam_a = Exam.objects.create(
            name='Sınav A',
            exam_type='DENEME',
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.egitim_yili,
        )
        self.exam_b = Exam.objects.create(
            name='Sınav B',
            exam_type='DENEME',
            kurum=self.kurum,
            sube=self.sube_b,
            egitim_yili=self.egitim_yili,
        )

    def test_exam_list_requires_sube_context(self):
        res = self.client.get(
            EXAMS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('sube_id', res.json().get('error', '').lower())

    def test_exam_list_scoped_to_active_sube(self):
        res = self.client.get(
            EXAMS_URL,
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json()}
        self.assertIn(self.exam_a.id, ids)
        self.assertNotIn(self.exam_b.id, ids)

    def test_exam_detail_forbidden_wrong_sube(self):
        res = self.client.get(
            f'{EXAMS_URL}{self.exam_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
        )
        self.assertEqual(res.status_code, 403)

        res_ok = self.client.get(
            f'{EXAMS_URL}{self.exam_b.id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
        )
        self.assertEqual(res_ok.status_code, 200)
        self.assertEqual(res_ok.json()['name'], 'Sınav B')

    def test_exam_create_assigns_active_sube(self):
        res = self.client.post(
            EXAMS_URL,
            data={
                'name': 'Yeni Sınav',
                'exam_type': 'DENEME',
                'apply_template': False,
            },
            format='json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
            HTTP_X_EGITIMYILI_ID=str(self.egitim_yili.id),
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['sube'], self.sube_a.id)
