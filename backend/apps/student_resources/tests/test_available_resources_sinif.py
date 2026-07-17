from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.resources.models import BookType, ResourceBook
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()


class AvailableResourcesSinifSeviyesiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sinif Filter Kurum', kod='SRS001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025,
            bitis_yil=2026,
            aktif_mi=True,
        )

        self.sinif_seviyesi_10 = SinifSeviyesi.objects.create(
            sube=self.sube,
            kurum=self.kurum,
            ad='10. Sınıf',
            kod='S10',
            sira=10,
        )
        self.sinif_seviyesi_11 = SinifSeviyesi.objects.create(
            sube=self.sube,
            kurum=self.kurum,
            ad='11. Sınıf',
            kod='S11',
            sira=11,
        )

        self.sinif_10 = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            ad='10-A',
            kod='10A',
            sinif_seviyesi=self.sinif_seviyesi_10,
            aktif_mi=True,
        )
        self.sinif_11 = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            ad='11-A',
            kod='11A',
            sinif_seviyesi=self.sinif_seviyesi_11,
            aktif_mi=True,
        )

        self.student_10 = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='On',
            aktif_mi=True,
        )
        self.student_11 = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Mehmet',
            soyad='OnBir',
            aktif_mi=True,
        )
        self.student_10_b = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='OnB',
            aktif_mi=True,
        )

        OgrenciKayit.objects.create(
            ogrenci=self.student_10,
            sinif=self.sinif_10,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student_10_b,
            sinif=self.sinif_10,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student_11,
            sinif=self.sinif_11,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            aktif_mi=True,
        )

        self.ders = Ders.objects.create(
            sube=self.sube,
            kurum=self.kurum, ad='Fizik', kod='FIZ')
        self.book_type = BookType.objects.create(
            kod='SORU_BANKASI',
            ad='Soru Bankası',
        )

        self.book_10 = ResourceBook.objects.create(
            sube=self.sube,
            ad='Fizik 10 Soru Bankası',
            kod='FSB10',
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi_10,
            kurum=self.kurum,
            aktif_mi=True,
        )
        self.book_11 = ResourceBook.objects.create(
            sube=self.sube,
            ad='Fizik 11 Soru Bankası',
            kod='FSB11',
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif_seviyesi_11,
            kurum=self.kurum,
            aktif_mi=True,
        )

        self.admin = User.objects.create_superuser(
            username='sinifadmin',
            email='sinifadmin@test.com',
            password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

        self.url = '/api/student-resources/assignments/available_resources/'

    def test_available_resources_filters_by_student_sinif_seviyesi(self):
        response = self.client.get(
            self.url,
            {'student_ids': str(self.student_10.id)},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.book_10.id})

    def test_available_resources_without_student_ids_returns_all(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.book_10.id, self.book_11.id})

    def test_available_resources_multiple_students_same_level(self):
        response = self.client.get(
            self.url,
            {'student_ids': f'{self.student_10.id},{self.student_10_b.id}'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.book_10.id})

    def test_available_resources_multiple_students_different_levels(self):
        response = self.client.get(
            self.url,
            {'student_ids': f'{self.student_10.id},{self.student_11.id}'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertEqual(ids, {self.book_10.id, self.book_11.id})

    def test_available_resources_matches_sinif_seviyeleri_m2m_when_fk_differs(self):
        """Book FK may point at first level; M2M holds all target levels."""
        self.book_10.sinif_seviyesi = self.sinif_seviyesi_11
        self.book_10.save(update_fields=['sinif_seviyesi'])
        self.book_10.sinif_seviyeleri.set([self.sinif_seviyesi_10, self.sinif_seviyesi_11])

        response = self.client.get(
            self.url,
            {'student_ids': str(self.student_10.id), 'lesson_ids': str(self.ders.id)},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        ids = {item['id'] for item in response.data['data']}
        self.assertIn(self.book_10.id, ids)
