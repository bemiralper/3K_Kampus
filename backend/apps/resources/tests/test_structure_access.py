"""Kitap structure okuma — şube / atama fallback."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.resources.models import BookType, ResourceBook, ResourceUnit
from apps.student_resources.models import StudentResourceAssignment
from apps.sube.domain.models import Sube

User = get_user_model()


class ResourceBookStructureAccessTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Str Kurum', kod='STRK', aktif_mi=True)
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='SA', aktif_mi=True)
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='SB', aktif_mi=True)
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )

        self.sinif_a = SinifSeviyesi.objects.create(
            ad='11. Sınıf', kod='S11', sira=11, kurum=self.kurum, sube=self.sube_a,
        )
        self.ders_a = Ders.objects.create(ad='Mat', kod='MAT', kurum=self.kurum, sube=self.sube_a)
        self.book_type = BookType.objects.create(kod='SB_STR', ad='Soru Bankası')

        self.book_a = ResourceBook.objects.create(
            ad='Şube A Kitabı',
            kod='BOOK-A-STR',
            kurum=self.kurum,
            sube=self.sube_a,
            book_type=self.book_type,
            ders=self.ders_a,
            sinif_seviyesi=self.sinif_a,
            aktif_mi=True,
        )
        ResourceUnit.objects.create(book=self.book_a, ad='Ünite 1', kod='U1', sira=1, aktif_mi=True)

        self.coach_user = User.objects.create_user(
            username='coach_str',
            email='coach_str@test.com',
            password='testpass123',
        )
        self.personel = Personel.objects.create(
            user=self.coach_user,
            ad='Koç',
            soyad='Test',
            tc_kimlik_no='22222222222',
            kurum=self.kurum,
            sube=self.sube_b,
            aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.personel,
            kurum=self.kurum,
            gorev_sube=self.sube_a,
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        PersonelGorevlendirme.objects.create(
            personel=self.personel,
            kurum=self.kurum,
            gorev_sube=self.sube_b,
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        self.coach = CoachProfile.objects.create(
            teacher=self.personel,
            capacity=20,
            is_active=True,
            is_coach=True,
        )

        self.client = APIClient()
        self.client.force_authenticate(user=self.coach_user)

    def test_structure_visible_when_active_sube_matches(self):
        response = self.client.get(
            f'/api/resources/books/{self.book_a.id}/structure/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_a.id),
            HTTP_X_EGITIMYILI_ID=str(self.egitim_yili.id),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['data']['units']), 1)
        self.assertEqual(response.data['data']['units'][0]['ad'], 'Ünite 1')

    def test_structure_fallback_when_coach_allowed_on_book_sube(self):
        """Aktif şube B iken A şubesindeki kitap yapısı (görevli şube) okunabilmeli."""
        response = self.client.get(
            f'/api/resources/books/{self.book_a.id}/structure/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
            HTTP_X_EGITIMYILI_ID=str(self.egitim_yili.id),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['success'])
        self.assertEqual(len(response.data['data']['units']), 1)

    def test_structure_student_assignment_fallback(self):
        student = Ogrenci.objects.create(
            ad='Ali',
            soyad='Veli',
            kurum=self.kurum,
            sube=self.sube_a,
            aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=self.coach,
            student=student,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )
        StudentResourceAssignment.objects.create(
            student=student,
            coach=self.coach_user,
            lesson=self.ders_a,
            resource_book=self.book_a,
            is_active=True,
        )

        # personel.sube ve görevleri temizleyip sadece B'de kalsın; A'ya görev yok
        PersonelGorevlendirme.objects.filter(gorev_sube=self.sube_a).delete()
        self.personel.sube = self.sube_b
        self.personel.save(update_fields=['sube'])

        response = self.client.get(
            f'/api/resources/books/{self.book_a.id}/structure/?student_id={student.id}',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube_b.id),
            HTTP_X_EGITIMYILI_ID=str(self.egitim_yili.id),
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data['data']['units']), 1)
