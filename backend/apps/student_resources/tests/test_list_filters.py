from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.student_resources.models import StudentResourceAssignment

User = get_user_model()


class StudentResourceListFilterTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Filter Kurum', kod='SRF001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.sinif_seviyesi = SinifSeviyesi.objects.create(
            ad='10. Sınıf',
            kod='S10',
            sira=10,
        )
        self.ders = Ders.objects.create(ad='Fizik', kod='FIZ')

        self.soru_bankasi_type = BookType.objects.create(
            kod='SORU_BANKASI',
            ad='Soru Bankası',
        )
        self.konu_anlatim_type = BookType.objects.create(
            kod='KONU_ANLATIM',
            ad='Konu Anlatım',
        )

        self.soru_book = ResourceBook.objects.create(
            ad='Fizik Soru Bankası',
            kod='FSB001',
            book_type=self.soru_bankasi_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            kurum=self.kurum,
            yayinevi='Palme Yayınları',
            aktif_mi=True,
        )
        self.konu_book = ResourceBook.objects.create(
            ad='Fizik Konu Anlatım',
            kod='FKA001',
            book_type=self.konu_anlatim_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi,
            kurum=self.kurum,
            yayinevi='Karekök Yayınları',
            aktif_mi=True,
        )

        self.soru_assignment = StudentResourceAssignment.objects.create(
            student=self.student,
            lesson=self.ders,
            resource_book=self.soru_book,
        )
        self.konu_assignment = StudentResourceAssignment.objects.create(
            student=self.student,
            lesson=self.ders,
            resource_book=self.konu_book,
        )

        self.admin = User.objects.create_superuser(
            username='filteradmin',
            email='filteradmin@test.com',
            password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_list_filter_by_resource_type(self):
        response = self.client.get(
            '/api/student-resources/assignments/',
            {'student': self.student.id, 'resource_type': 'SORU_BANKASI'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.soru_assignment.id})

        response_by_ad = self.client.get(
            '/api/student-resources/assignments/',
            {'student': self.student.id, 'resource_type': 'Konu'},
        )
        self.assertEqual(response_by_ad.status_code, 200)
        ids_by_ad = {item['id'] for item in response_by_ad.data['data']}
        self.assertEqual(ids_by_ad, {self.konu_assignment.id})

    def test_list_filter_by_publisher(self):
        response = self.client.get(
            '/api/student-resources/assignments/',
            {'student': self.student.id, 'publisher': 'Palme'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.soru_assignment.id})

    def test_available_resources_filter_by_type(self):
        response = self.client.get(
            '/api/student-resources/assignments/available_resources/',
            {'resource_type': 'KONU_ANLATIM'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.konu_book.id})

        response_publisher = self.client.get(
            '/api/student-resources/assignments/available_resources/',
            {'publisher': 'Karekök'},
        )
        self.assertEqual(response_publisher.status_code, 200)
        ids_publisher = {item['id'] for item in response_publisher.data['data']}
        self.assertEqual(ids_publisher, {self.konu_book.id})
