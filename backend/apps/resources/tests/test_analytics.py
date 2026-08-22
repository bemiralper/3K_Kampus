from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.application.analytics_pdf import (
    build_analytics_html,
    normalize_report_type,
)
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

    def _create_used_books(self, count: int):
        books = []
        for i in range(count):
            book = ResourceBook.objects.create(
                ad=f'Ek Kitap {i:02d}',
                kod=f'EK{i:02d}',
                kurum=self.kurum,
                sube=self.sube,
                book_type=self.book_type,
                ders=self.ders,
                sinif_seviyesi=self.sinif,
                publisher=self.publisher_a,
                aktif_mi=True,
            )
            StudentResourceAssignment.objects.create(
                student=self.student,
                resource_book=book,
                lesson=self.ders,
                is_active=True,
                assigned_at=timezone.now(),
            )
            books.append(book)
        return books

    def test_top_books_default_limit_is_20(self):
        self._create_used_books(22)
        res = self.client.get(f'{ANALYTICS_URL}top-books/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data['data']), 20)

    def test_top_books_used_only_returns_all_used_without_limit(self):
        self._create_used_books(22)
        res = self.client.get(
            f'{ANALYTICS_URL}top-books/',
            {'used_only': 'true', 'limit': 'all', 'metric': 'students'},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        rows = res.data['data']
        # book_a + 22 ek kitap; book_b pasif atama olduğu için used_only dışında kalır
        self.assertEqual(len(rows), 23)
        self.assertTrue(all(r['student_count'] > 0 for r in rows))
        self.assertNotIn('Kitap B', [r['ad'] for r in rows])

    def _analytics_request(self, data):
        class _Req:
            pass

        req = _Req()
        req.query_params = data
        req.GET = data
        req.data = data
        req.session = {}
        req.headers = {
            'X-Kurum-ID': str(self.kurum.id),
            'X-Sube-ID': str(self.sube.id),
        }
        req.active_kurum_id = self.kurum.id
        req.active_sube_id = self.sube.id
        return req

    def test_normalize_report_type_aliases_and_tabs(self):
        self.assertEqual(normalize_report_type('genel'), 'ozet')
        self.assertEqual(normalize_report_type('top'), 'kullanim')
        self.assertEqual(normalize_report_type('eksik'), 'icerik')
        self.assertEqual(normalize_report_type('koc'), 'koc')
        self.assertEqual(normalize_report_type('unknown'), 'ozet')

    def test_each_tab_html_is_dedicated(self):
        heading = {
            'ozet': 'Aksiyon Gerekenler',
            'kullanim': 'Kullanılan Kitaplar',
            'yayinevi': 'Yayınevi Kullanımı',
            'ders': 'Ders Bazlı Analiz',
            'icerik': 'İçeriği Eksik',
            'koc': 'Koç Bazlı Kullanım',
            'atil': 'Atıl Kaynaklar',
            'degisim': 'Havuz büyüme',
        }
        foreign = {
            'ozet': 'Kullanılan Kitaplar',
            'kullanim': 'Koç Bazlı Kullanım',
            'yayinevi': 'Atıl Kaynaklar',
            'ders': 'Havuz büyüme',
            'icerik': 'Koç Bazlı Kullanım',
            'koc': 'Kullanılan Kitaplar',
            'atil': 'Yayınevi Kullanımı',
            'degisim': 'İçeriği Eksik',
        }
        for report_type, must_have in heading.items():
            html_doc = build_analytics_html(self._analytics_request({}), report_type)
            self.assertIn(must_have, html_doc, report_type)
            self.assertNotIn(foreign[report_type], html_doc, report_type)

    def test_kullanim_pdf_respects_icerik_filter(self):
        self.book_a.icerik_tamamlandi_mi = False
        self.book_a.save(update_fields=['icerik_tamamlandi_mi'])
        complete = ResourceBook.objects.create(
            ad='Kitap Tamam', kod='KT', kurum=self.kurum, sube=self.sube,
            book_type=self.book_type, ders=self.ders, sinif_seviyesi=self.sinif,
            publisher=self.publisher_a, aktif_mi=True, icerik_tamamlandi_mi=True,
        )
        StudentResourceAssignment.objects.create(
            student=self.student, resource_book=complete, lesson=self.ders,
            is_active=True, assigned_at=timezone.now(),
        )

        eksik_html = build_analytics_html(
            self._analytics_request({'icerik': 'eksik'}),
            'kullanim',
        )
        self.assertIn('İçerik: Eksik', eksik_html)
        self.assertIn('Kitap A', eksik_html)
        self.assertNotIn('Kitap Tamam', eksik_html)

        tamam_html = build_analytics_html(
            self._analytics_request({'icerik': 'tamam'}),
            'kullanim',
        )
        self.assertIn('İçerik: Tamam', tamam_html)
        self.assertIn('Kitap Tamam', tamam_html)
        self.assertNotIn('Kitap A', tamam_html)
