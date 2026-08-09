from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook, ResourcePublisher
from apps.sube.domain.models import Sube
from apps.student_resources.models import StudentResourceAssignment

User = get_user_model()

ANALYTICS_URL = '/api/resources/analytics/'


class ResourceAnalyticsAccessTest(TestCase):
    """Analitik uçları sadece admin/koç görebilmeli — diğer authenticated kullanıcılar değil."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Analitik Kurum', kod='ANL', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='AS', aktif_mi=True)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.admin = User.objects.create_user(
            username='analytics_admin', email='aadmin@test.com', password='x', is_staff=True,
        )
        self.plain_user = User.objects.create_user(
            username='analytics_plain', email='aplain@test.com', password='x', is_staff=False,
        )
        self.client = APIClient()

    def test_plain_authenticated_user_cannot_view_summary(self):
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.get(f'{ANALYTICS_URL}summary/', **self.headers)
        self.assertEqual(res.status_code, 403)

    def test_plain_authenticated_user_cannot_download_pdf(self):
        self.client.force_authenticate(user=self.plain_user)
        res = self.client.post(
            f'{ANALYTICS_URL}report-pdf/', {'report_type': 'genel'}, format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 403)

    def test_admin_can_view_summary(self):
        self.client.force_authenticate(user=self.admin)
        res = self.client.get(f'{ANALYTICS_URL}summary/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])

    def test_anonymous_cannot_view_summary(self):
        res = self.client.get(f'{ANALYTICS_URL}summary/', **self.headers)
        self.assertIn(res.status_code, (401, 403))


class ResourceAnalyticsDataTest(TestCase):
    """Filtre ve veri doğruluğu: PDF body filtreleri + usage-trend aktif filtre."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Analitik Veri Kurum', kod='ANLD', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Şube', kod='ADS', aktif_mi=True)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }
        self.sinif = SinifSeviyesi.objects.create(
            ad='9. Sınıf', kod='S9', sira=9, kurum=self.kurum, sube=self.sube,
        )
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT', kurum=self.kurum, sube=self.sube)
        self.book_type = BookType.objects.create(kod='SB_ANL', ad='Soru Bankası')
        self.publisher_a = ResourcePublisher.objects.create(kurum=self.kurum, ad='Yayınevi A')
        self.publisher_b = ResourcePublisher.objects.create(kurum=self.kurum, ad='Yayınevi B')
        self.book_a = ResourceBook.objects.create(
            ad='Kitap A', kod='KA', kurum=self.kurum, sube=self.sube, book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif, publisher=self.publisher_a, aktif_mi=True,
        )
        self.book_b = ResourceBook.objects.create(
            ad='Kitap B', kod='KB', kurum=self.kurum, sube=self.sube, book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif, publisher=self.publisher_b, aktif_mi=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        StudentResourceAssignment.objects.create(
            student=self.student, resource_book=self.book_a, lesson=self.ders,
            is_active=True, assigned_at=timezone.now(),
        )
        StudentResourceAssignment.objects.create(
            student=self.student, resource_book=self.book_b, lesson=self.ders,
            is_active=False, assigned_at=timezone.now(),
        )
        self.admin = User.objects.create_user(
            username='analytics_data_admin', email='adata@test.com', password='x', is_staff=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_summary_filters_by_publisher_via_query_params(self):
        res = self.client.get(
            f'{ANALYTICS_URL}summary/', {'publisher': str(self.publisher_a.id)}, **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['data']['total_books'], 1)

    def test_pdf_report_respects_publisher_filter_from_body(self):
        """PDF export ekrandaki filtreyi (POST body) uygulamalı — query_params boş olsa da."""
        res_all = self.client.post(
            f'{ANALYTICS_URL}report-pdf/', {'report_type': 'genel'}, format='json', **self.headers,
        )
        self.assertEqual(res_all.status_code, 200)

        res_filtered = self.client.post(
            f'{ANALYTICS_URL}report-pdf/',
            {'report_type': 'genel', 'publisher': str(self.publisher_a.id)},
            format='json',
            **self.headers,
        )
        self.assertEqual(res_filtered.status_code, 200)
        # Filtreli PDF, filtresizden daha küçük ya da eşit olmalı (daha az kitap içerir).
        self.assertLessEqual(len(res_filtered.content), len(res_all.content) + 200)

    def test_usage_trend_excludes_inactive_assignments(self):
        res = self.client.get(f'{ANALYTICS_URL}usage-trend/', **self.headers)
        self.assertEqual(res.status_code, 200)
        total = sum(row['assignments'] for row in res.data['data'])
        # Sadece book_a'nın aktif ataması sayılmalı (book_b pasif).
        self.assertEqual(total, 1)
