"""
Sınav detay sayfasındaki düzenleme akışının backend karşılığı.

Kapsam: sinif_ids güncelleme, deneme alanlarını null'a çekme, geçersiz bölüm
aralığı ve oturum doğrulamaları, kilitli sınavda puanlama alanlarının korunması,
exam_date'in oturum tarihlerinden türetilmesi.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam, ExamSection
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'


class OlcmeExamEditAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Düzenleme Kurum', kod='DZN')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DZN-M')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_user(username='duzenleme', password='test')
        self.client.force_authenticate(user=self.user)

        self.sinif_a = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili, ad='12-A',
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili, ad='12-B',
        )

        self.exam = Exam.objects.create(
            name='Deneme 1', exam_type='DENEME',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
        )
        self.section = ExamSection.objects.create(
            exam=self.exam, name='Türkçe', order=0,
            question_start=1, question_end=40,
        )

    @property
    def headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def _patch(self, payload):
        return self.client.patch(
            f'{EXAMS_URL}{self.exam.id}/', data=payload, format='json', **self.headers
        )

    # ── Sınıf ilişkisi ──────────────────────────────────────────────────────

    def test_sinif_ids_can_be_updated_after_creation(self):
        """Detay sayfasındaki sınıf seçimi kaydedilmeli."""
        res = self._patch({'sinif_ids': [self.sinif_a.id, self.sinif_b.id]})
        self.assertEqual(res.status_code, 200)
        self.assertCountEqual(
            list(self.exam.siniflar.values_list('id', flat=True)),
            [self.sinif_a.id, self.sinif_b.id],
        )

    def test_sinif_ids_can_be_cleared(self):
        self.exam.siniflar.set([self.sinif_a.id])
        res = self._patch({'sinif_ids': []})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(list(self.exam.siniflar.all()), [])

    def test_sinif_display_reflects_selection(self):
        self.exam.siniflar.set([self.sinif_a.id, self.sinif_b.id])
        res = self.client.get(f'{EXAMS_URL}{self.exam.id}/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('12-A', res.json()['sinif_display'])

    # ── Deneme alanları ─────────────────────────────────────────────────────

    def test_deneme_fields_accept_null(self):
        """Deneme hizmeti/paketi temizlenebilmeli (SET_NULL alanlar)."""
        res = self._patch({'deneme_hizmeti': None, 'deneme_paketi': None})
        self.assertEqual(res.status_code, 200)
        self.exam.refresh_from_db()
        self.assertIsNone(self.exam.deneme_hizmeti_id)
        self.assertIsNone(self.exam.deneme_paketi_id)

    # ── Bölüm doğrulaması ───────────────────────────────────────────────────

    def test_update_section_rejects_inverted_range(self):
        """end < start artık 500 değil 400 dönmeli."""
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/update_section/',
            data={'section_id': self.section.id, 'question_start': 40, 'question_end': 10},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)
        self.section.refresh_from_db()
        self.assertEqual(self.section.question_start, 1)
        self.assertEqual(self.section.question_end, 40)

    def test_add_section_rejects_duplicate_name(self):
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_section/',
            data={'name': 'Türkçe', 'question_start': 41, 'question_end': 60},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    # ── Oturum doğrulaması ──────────────────────────────────────────────────

    def test_add_session_accepts_blank_optional_fields(self):
        """Frontend boş string gönderiyor; null'a çevrilmeli."""
        res = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data={
                'name': '1. Oturum', 'session_date': '', 'start_time': '',
                'end_time': '', 'duration_minutes': '',
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:300])

    def test_add_session_rejects_duplicate_name(self):
        payload = {'name': '1. Oturum'}
        first = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data=payload, format='json', **self.headers,
        )
        self.assertEqual(first.status_code, 201)
        second = self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data=payload, format='json', **self.headers,
        )
        self.assertEqual(second.status_code, 400)

    def test_exam_date_derived_from_earliest_session(self):
        """Oluşturma formunda exam_date alanı yok; oturumdan türetilir."""
        self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data={'name': '2. Oturum', 'session_date': '2026-04-20'},
            format='json', **self.headers,
        )
        self.exam.refresh_from_db()
        self.assertEqual(str(self.exam.exam_date), '2026-04-20')

        self.client.post(
            f'{EXAMS_URL}{self.exam.id}/add_session/',
            data={'name': '1. Oturum', 'session_date': '2026-04-19'},
            format='json', **self.headers,
        )
        self.exam.refresh_from_db()
        self.assertEqual(str(self.exam.exam_date), '2026-04-19')

    # ── Kilit ───────────────────────────────────────────────────────────────

    def test_locked_exam_rejects_scoring_change(self):
        self.client.post(f'{EXAMS_URL}{self.exam.id}/lock/', **self.headers)
        res = self._patch({'wrong_answer_count': 3})
        self.assertEqual(res.status_code, 400)

    def test_locked_exam_still_allows_name_change(self):
        self.client.post(f'{EXAMS_URL}{self.exam.id}/lock/', **self.headers)
        res = self._patch({'name': 'Deneme 1 (revize)'})
        self.assertEqual(res.status_code, 200)
        self.exam.refresh_from_db()
        self.assertEqual(self.exam.name, 'Deneme 1 (revize)')
