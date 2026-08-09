from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.coaching.assignment_manual.models import ManualAssignment
from apps.student_resources.models import StudentResourceAssignment
from apps.student_resources.services.overdue_status import (
    refresh_manual_assignment_overdue,
    refresh_student_resource_overdue,
)

User = get_user_model()


class OverdueStatusTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Overdue Kurum', kod='OVD')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Yılmaz',
            aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            sube=self.sube,
            kurum=self.kurum, ad='Fizik', kod='FIZ')
        self.sinif = SinifSeviyesi.objects.create(
            sube=self.sube,
            kurum=self.kurum, ad='10. Sınıf', kod='S10', sira=10)
        self.book_type = BookType.objects.create(kod='SB2', ad='Soru Bankası')
        self.resource_book = ResourceBook.objects.create(
            sube=self.sube,
            ad='Fizik Soru Bankası',
            kod='FSB002',
            kurum=self.kurum,
            book_type=self.book_type,
            ders=self.ders,
            sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )

    def test_past_due_assignment_gets_overdue_on_refresh(self):
        assignment = StudentResourceAssignment.objects.create(
            student=self.student,
            lesson=self.ders,
            resource_book=self.resource_book,
            status=StudentResourceAssignment.Status.ASSIGNED,
            due_date=timezone.now().date() - timedelta(days=1),
        )

        updated = refresh_student_resource_overdue()
        self.assertEqual(updated, 1)

        assignment.refresh_from_db()
        self.assertEqual(assignment.status, StudentResourceAssignment.Status.OVERDUE)

    def test_completed_assignment_not_marked_overdue(self):
        assignment = StudentResourceAssignment.objects.create(
            student=self.student,
            lesson=self.ders,
            resource_book=ResourceBook.objects.create(
            sube=self.sube,
                ad='Fizik Konu',
                kod='FK002',
                kurum=self.kurum,
                book_type=self.book_type,
                ders=self.ders,
                sinif_seviyesi=self.sinif,
                aktif_mi=True,
            ),
            status=StudentResourceAssignment.Status.COMPLETED,
            due_date=timezone.now().date() - timedelta(days=1),
        )

        refresh_student_resource_overdue()
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, StudentResourceAssignment.Status.COMPLETED)

    def test_manual_assignment_overdue_scoped_to_kurum(self):
        other_kurum = Kurum.objects.create(ad='Diğer Kurum', kod='OVD2')
        other_sube = Sube.objects.create(kurum=other_kurum, ad='Merkez', kod='MRK2')
        other_student = Ogrenci.objects.create(
            kurum=other_kurum, sube=other_sube, ad='Ali', soyad='Kaya', aktif_mi=True,
        )

        due_past = timezone.now() - timedelta(days=1)
        own_assignment = ManualAssignment.objects.create(
            student=self.student, title='Kendi Kurum Ödevi',
            status=ManualAssignment.Status.ASSIGNED, due_date=due_past, is_active=True,
        )
        other_assignment = ManualAssignment.objects.create(
            student=other_student, title='Diğer Kurum Ödevi',
            status=ManualAssignment.Status.ASSIGNED, due_date=due_past, is_active=True,
        )

        updated = refresh_manual_assignment_overdue(self.kurum.id)
        self.assertEqual(updated, 1)

        own_assignment.refresh_from_db()
        other_assignment.refresh_from_db()
        self.assertEqual(own_assignment.status, ManualAssignment.Status.OVERDUE)
        self.assertEqual(other_assignment.status, ManualAssignment.Status.ASSIGNED)

        # kurum_id verilmezse (cron/management command yolu) tüm kurumlar güncellenir
        updated_all = refresh_manual_assignment_overdue()
        self.assertEqual(updated_all, 1)
        other_assignment.refresh_from_db()
        self.assertEqual(other_assignment.status, ManualAssignment.Status.OVERDUE)
