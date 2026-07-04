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


class PurchaseListWorkflowTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='PL Kurum', kod='PL001')
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
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Test', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.student, sinif=self.sinif, egitim_yili=self.egitim_yili,
            kurum=self.kurum, sube=self.sube, aktif_mi=True,
        )
        self.ders = Ders.objects.create(ad='Matematik', kod='MAT')
        self.book_type = BookType.objects.create(kod='SORU_BANKASI', ad='Soru Bankası')
        self.book = ResourceBook.objects.create(
            ad='Liste Kitabı', kod='PLB1', book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif_seviyesi, kurum=self.kurum, aktif_mi=True,
        )
        self.book2 = ResourceBook.objects.create(
            ad='İkinci Kitap', kod='PLB2', book_type=self.book_type,
            ders=self.ders, sinif_seviyesi=self.sinif_seviyesi, kurum=self.kurum, aktif_mi=True,
        )

        self.admin = User.objects.create_superuser(
            username='pladmin', email='pl@test.com', password='testpass123',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def _create_list_from_library(self, book_ids, list_type='PURCHASE'):
        return self.client.post(
            '/api/student-resources/purchase-lists/create_from_library/',
            {
                'student_id': self.student.id,
                'list_type': list_type,
                'items': [{'resource_book_id': bid} for bid in book_ids],
            },
            format='json',
        )

    def test_create_from_library_creates_assignments(self):
        response = self._create_list_from_library([self.book.id])
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])

        assignment = StudentResourceAssignment.objects.get(
            student=self.student,
            resource_book=self.book,
            is_active=True,
        )
        self.assertEqual(
            assignment.ownership_type,
            StudentResourceAssignment.OwnershipType.TO_PURCHASE,
        )

        purchase_list = ResourcePurchaseList.objects.get(student=self.student)
        self.assertEqual(purchase_list.status, ResourcePurchaseList.Status.FINALIZED)
        item = purchase_list.items.get()
        self.assertEqual(item.item_status, ResourcePurchaseListItem.ItemStatus.PENDING)
        self.assertEqual(item.assignment_id, assignment.id)

    def test_set_status_received_marks_student_owned(self):
        self._create_list_from_library([self.book.id])
        item = ResourcePurchaseListItem.objects.get(resource_book=self.book)
        response = self.client.post(
            f'/api/student-resources/purchase-lists/items/{item.id}/set_status/',
            {'item_status': 'RECEIVED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        item.refresh_from_db()
        self.assertEqual(item.item_status, ResourcePurchaseListItem.ItemStatus.RECEIVED)

        assignment = StudentResourceAssignment.objects.get(
            student=self.student, resource_book=self.book,
        )
        self.assertTrue(assignment.is_active)
        self.assertEqual(
            assignment.ownership_type,
            StudentResourceAssignment.OwnershipType.STUDENT_OWNED,
        )

        acq = get_student_book_acquisition_map(self.student.id)
        self.assertEqual(acq[self.book.id]['acquisition_status'], 'STUDENT_OWNED')

    def test_set_status_not_received_deactivates_assignment(self):
        self._create_list_from_library([self.book.id])
        item = ResourcePurchaseListItem.objects.get(resource_book=self.book)
        response = self.client.post(
            f'/api/student-resources/purchase-lists/items/{item.id}/set_status/',
            {'item_status': 'NOT_RECEIVED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        item.refresh_from_db()
        self.assertEqual(item.item_status, ResourcePurchaseListItem.ItemStatus.NOT_RECEIVED)

        assignment = StudentResourceAssignment.objects.get(
            student=self.student, resource_book=self.book,
        )
        self.assertFalse(assignment.is_active)

        detail = self.client.get(
            '/api/student-resources/assignments/student_detail/',
            {'student_id': self.student.id},
        )
        active_lists = detail.data['data']['active_purchase_lists']
        self.assertEqual(len(active_lists), 0)

    def test_set_status_cancelled_deactivates_assignment(self):
        self._create_list_from_library([self.book.id])
        item = ResourcePurchaseListItem.objects.get(resource_book=self.book)
        response = self.client.post(
            f'/api/student-resources/purchase-lists/items/{item.id}/set_status/',
            {'item_status': 'CANCELLED'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        assignment = StudentResourceAssignment.objects.get(
            student=self.student, resource_book=self.book,
        )
        self.assertFalse(assignment.is_active)

    def test_acquisition_map_only_counts_pending_as_on_list(self):
        purchase_list = ResourcePurchaseList.objects.create(
            student=self.student,
            list_type=ResourcePurchaseList.ListType.PURCHASE,
            status=ResourcePurchaseList.Status.FINALIZED,
        )
        ResourcePurchaseListItem.objects.create(
            purchase_list=purchase_list,
            resource_book=self.book,
            quantity=1,
            item_status=ResourcePurchaseListItem.ItemStatus.RECEIVED,
        )
        ResourcePurchaseListItem.objects.create(
            purchase_list=purchase_list,
            resource_book=self.book2,
            quantity=1,
            item_status=ResourcePurchaseListItem.ItemStatus.PENDING,
        )

        acq = get_student_book_acquisition_map(self.student.id)
        self.assertNotIn(self.book.id, acq)
        self.assertEqual(acq[self.book2.id]['acquisition_status'], 'ON_LIST')

    def test_list_not_auto_delivered_on_create(self):
        self._create_list_from_library([self.book.id])
        purchase_list = ResourcePurchaseList.objects.get(student=self.student)
        self.assertEqual(purchase_list.status, ResourcePurchaseList.Status.FINALIZED)
        self.assertIsNone(purchase_list.delivered_at)

    def test_list_delivered_when_all_items_resolved(self):
        self._create_list_from_library([self.book.id, self.book2.id])
        items = list(ResourcePurchaseListItem.objects.filter(
            purchase_list__student=self.student,
        ))
        for item in items:
            self.client.post(
                f'/api/student-resources/purchase-lists/items/{item.id}/set_status/',
                {'item_status': 'RECEIVED'},
                format='json',
            )

        purchase_list = ResourcePurchaseList.objects.get(student=self.student)
        self.assertEqual(purchase_list.status, ResourcePurchaseList.Status.DELIVERED)
        self.assertIsNotNone(purchase_list.delivered_at)

    def test_student_detail_includes_active_purchase_lists(self):
        self._create_list_from_library([self.book.id])
        response = self.client.get(
            '/api/student-resources/assignments/student_detail/',
            {'student_id': self.student.id},
        )
        self.assertEqual(response.status_code, 200)
        active_lists = response.data['data']['active_purchase_lists']
        self.assertEqual(len(active_lists), 1)
        self.assertEqual(len(active_lists[0]['items']), 1)
        self.assertEqual(active_lists[0]['items'][0]['item_status'], 'PENDING')

    def test_purchase_list_pdf_preserves_print_colors(self):
        self._create_list_from_library([self.book.id], list_type='INSTITUTION')
        purchase_list = ResourcePurchaseList.objects.get(student=self.student)

        response = self.client.get(
            f'/api/student-resources/purchase-lists/{purchase_list.id}/pdf/',
        )
        self.assertEqual(response.status_code, 200)
        html = response.content.decode('utf-8')
        self.assertIn('print-color-adjust: exact', html)
        self.assertIn('-webkit-print-color-adjust: exact', html)
        self.assertIn('Kurum Kaynak Listesi', html)

        purchase_response = self._create_list_from_library([self.book2.id], list_type='PURCHASE')
        self.assertTrue(purchase_response.data['success'])
        purchase_list2 = ResourcePurchaseList.objects.exclude(id=purchase_list.id).get(
            student=self.student,
        )
        response2 = self.client.get(
            f'/api/student-resources/purchase-lists/{purchase_list2.id}/pdf/',
        )
        self.assertEqual(response2.status_code, 200)
        html2 = response2.content.decode('utf-8')
        self.assertIn('print-color-adjust: exact', html2)
        self.assertIn('Kırtasiye Satın Alma Listesi', html2)
