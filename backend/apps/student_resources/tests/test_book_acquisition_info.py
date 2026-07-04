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
from apps.student_resources.filters import get_student_book_acquisition_map
from apps.student_resources.models import (
    ResourcePurchaseList,
    ResourcePurchaseListItem,
    StudentResourceAssignment,
)

User = get_user_model()


class BookAcquisitionInfoTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Acq Kurum', kod='ACQ001')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.sinif_seviyesi = SinifSeviyesi.objects.create(ad='12. Sınıf', kod='S12', sira=12)
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            ad='12-A', kod='12A', sinif_seviyesi=self.sinif_seviyesi, aktif_mi=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student, sinif=self.sinif, egitim_yili=self.egitim_yili,
            kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT')
        self.book_type = BookType.objects.create(kod='SORU_BANKASI', ad='Soru Bankası')
        self.book_owned = ResourceBook.objects.create(
            ad='Sahip Olunan', kod='OWN1', book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif_seviyesi, kurum=self.kurum, aktif_mi=True,
        )
        self.book_on_list = ResourceBook.objects.create(
            ad='Listedeki', kod='LST1', book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif_seviyesi, kurum=self.kurum, aktif_mi=True,
        )
        self.book_free = ResourceBook.objects.create(
            ad='Serbest', kod='FRE1', book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif_seviyesi, kurum=self.kurum, aktif_mi=True,
        )

        StudentResourceAssignment.objects.create(
            student=self.student,
            lesson=self.ders,
            resource_book=self.book_owned,
            ownership_type=StudentResourceAssignment.OwnershipType.STUDENT_OWNED,
        )
        purchase_list = ResourcePurchaseList.objects.create(
            student=self.student,
            list_type=ResourcePurchaseList.ListType.PURCHASE,
            title='Test',
            status=ResourcePurchaseList.Status.FINALIZED,
        )
        ResourcePurchaseListItem.objects.create(
            purchase_list=purchase_list,
            resource_book=self.book_on_list,
            quantity=1,
            item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
        )

        self.admin = User.objects.create_superuser(
            username='acqadmin', email='acq@test.com', password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)

    def test_acquisition_map_marks_owned_and_on_list(self):
        acq = get_student_book_acquisition_map(self.student.id)
        self.assertEqual(acq[self.book_owned.id]['acquisition_status'], 'STUDENT_OWNED')
        self.assertTrue(acq[self.book_owned.id]['hidden'])
        self.assertEqual(acq[self.book_on_list.id]['acquisition_status'], 'ON_LIST')
        self.assertFalse(acq[self.book_on_list.id]['selectable'])
        self.assertNotIn(self.book_free.id, acq)

    def test_available_resources_includes_acquisition_info(self):
        response = self.client.get(
            '/api/student-resources/assignments/available_resources/',
            {
                'student_ids': str(self.student.id),
                'lesson_ids': str(self.ders.id),
                'acquisition_info': 'true',
            },
        )
        self.assertEqual(response.status_code, 200)
        by_id = {item['id']: item for item in response.data['data']}
        self.assertFalse(by_id[self.book_owned.id]['selectable'])
        self.assertTrue(by_id[self.book_owned.id]['hidden'])
        self.assertFalse(by_id[self.book_on_list.id]['selectable'])
        self.assertEqual(by_id[self.book_on_list.id]['acquisition_label'], 'Listede')
        self.assertTrue(by_id[self.book_free.id]['selectable'])

    def test_create_from_library_rejects_listed_book(self):
        response = self.client.post(
            '/api/student-resources/purchase-lists/create_from_library/',
            {
                'student_id': self.student.id,
                'list_type': 'PURCHASE',
                'items': [{'resource_book_id': self.book_on_list.id}],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data['success'])
