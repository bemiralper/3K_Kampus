"""Atama.lesson ile ResourceBook.ders sapması — ödev ver gruplaması."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.student_resources.lesson_sync import (
    heal_mismatched_assignments,
    sync_assignments_for_book,
)
from apps.student_resources.models import StudentResourceAssignment

User = get_user_model()


class AssignmentLessonSyncTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Sync Kurum', kod='SYNC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.sinif = SinifSeviyesi.objects.create(
            sube=self.sube, kurum=self.kurum, ad='12. Sınıf', kod='S12', sira=12,
        )
        self.tarih = Ders.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Tarih', kod='TAR',
        )
        self.cografya = Ders.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Coğrafya', kod='COG',
        )
        self.book_type, _ = BookType.objects.get_or_create(
            kod='SORU_BANKASI', defaults={'ad': 'Soru Bankası'},
        )
        self.tarih_kitap = ResourceBook.objects.create(
            sube=self.sube,
            kurum=self.kurum,
            ad='Hız ve Renk TYT Tarih Soru Bankası',
            kod='TAR-SB',
            book_type=self.book_type,
            ders=self.tarih,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
            icerik_tamamlandi_mi=True,
        )
        self.cografya_kitap = ResourceBook.objects.create(
            sube=self.sube,
            kurum=self.kurum,
            ad='Hız ve Renk TYT Coğrafya Soru Bankası',
            kod='COG-SB',
            book_type=self.book_type,
            ders=self.cografya,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
            icerik_tamamlandi_mi=True,
        )
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Rabia', soyad='Korucu', aktif_mi=True,
        )
        self.admin = User.objects.create_superuser(
            username='syncadmin', email='sync@test.com', password='x',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_heal_swaps_mismatched_assignment_lessons(self):
        # Kitaplar doğru derste; atamalar ters yazılmış (canlıdaki sapma)
        StudentResourceAssignment.objects.create(
            student=self.student,
            resource_book=self.tarih_kitap,
            lesson=self.cografya,
        )
        StudentResourceAssignment.objects.create(
            student=self.student,
            resource_book=self.cografya_kitap,
            lesson=self.tarih,
        )

        fixed = heal_mismatched_assignments(student_id=self.student.id)
        self.assertEqual(fixed, 2)

        a_tarih = StudentResourceAssignment.objects.get(resource_book=self.tarih_kitap)
        a_cog = StudentResourceAssignment.objects.get(resource_book=self.cografya_kitap)
        self.assertEqual(a_tarih.lesson_id, self.tarih.id)
        self.assertEqual(a_cog.lesson_id, self.cografya.id)

    def test_student_detail_groups_by_book_ders_not_stale_assignment(self):
        StudentResourceAssignment.objects.create(
            student=self.student,
            resource_book=self.tarih_kitap,
            lesson=self.cografya,  # yanlış
        )
        StudentResourceAssignment.objects.create(
            student=self.student,
            resource_book=self.cografya_kitap,
            lesson=self.tarih,  # yanlış
        )

        response = self.client.get(
            '/api/student-resources/assignments/student_detail/',
            {'student_id': self.student.id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['success'])
        lessons = {row['lesson_name']: row for row in response.data['data']['lessons']}
        self.assertIn('Tarih', lessons)
        self.assertIn('Coğrafya', lessons)
        tarih_names = [r['resource_name'] for r in lessons['Tarih']['resources']]
        cog_names = [r['resource_name'] for r in lessons['Coğrafya']['resources']]
        self.assertEqual(tarih_names, ['Hız ve Renk TYT Tarih Soru Bankası'])
        self.assertEqual(cog_names, ['Hız ve Renk TYT Coğrafya Soru Bankası'])

    def test_book_ders_update_syncs_assignments(self):
        assignment = StudentResourceAssignment.objects.create(
            student=self.student,
            resource_book=self.tarih_kitap,
            lesson=self.tarih,
        )
        self.tarih_kitap.ders = self.cografya
        self.tarih_kitap.save(update_fields=['ders'])
        updated = sync_assignments_for_book(self.tarih_kitap.id, self.cografya.id)
        self.assertEqual(updated, 1)
        assignment.refresh_from_db()
        self.assertEqual(assignment.lesson_id, self.cografya.id)
