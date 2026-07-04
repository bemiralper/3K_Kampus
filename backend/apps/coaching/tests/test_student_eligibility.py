from datetime import date

from django.test import TestCase

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.coaching.services.eligibility import get_assignable_kocluk_ogrenci_queryset
from apps.egitim_paketleri.models import EkHizmet
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class CoachingStudentEligibilityTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.egitim_yili = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026)
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )

    def _attach_kocluk(self, hizmet_turu='kocluk', ad='Koçluk', kod='KOCLUK'):
        ek_hizmet = EkHizmet.objects.create(
            ad=ad,
            kod=kod,
            hizmet_turu=hizmet_turu,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            brut_fiyat=0,
            aktif_mi=True,
        )
        OgrenciEkHizmet.objects.create(
            ogrenci=self.ogrenci,
            ek_hizmet=ek_hizmet,
            aktif_mi=True,
            egitim_yili=self.egitim_yili,
        )
        return ek_hizmet

    def test_assignable_student_with_kocluk_service(self):
        self._attach_kocluk()
        qs = get_assignable_kocluk_ogrenci_queryset(
            kurum_id=self.kurum.id,
            egitim_yili_id=self.egitim_yili.id,
        )
        self.assertEqual(list(qs.values_list('id', flat=True)), [self.ogrenci.id])

    def test_misclassified_kocluk_ek_hizmet_still_eligible(self):
        """Yanlışlıkla kutuphane türüyle kaydedilmiş Koçluk hizmeti de tanınmalı."""
        self._attach_kocluk(hizmet_turu='kutuphane', ad='Koçluk', kod='KUT_KOC')
        qs = get_assignable_kocluk_ogrenci_queryset(
            kurum_id=self.kurum.id,
            egitim_yili_id=self.egitim_yili.id,
        )
        self.assertEqual(list(qs.values_list('id', flat=True)), [self.ogrenci.id])

    def test_assigned_student_is_excluded(self):
        self._attach_kocluk()
        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Koç',
            tc_kimlik_no='12345678901',
        )
        coach = CoachProfile.objects.create(teacher=personel, capacity=10, is_active=True, is_coach=True)
        CoachStudentAssignment.objects.create(
            coach=coach,
            student=self.ogrenci,
            start_date=date.today(),
            is_primary=True,
        )

        qs = get_assignable_kocluk_ogrenci_queryset(
            kurum_id=self.kurum.id,
            egitim_yili_id=self.egitim_yili.id,
        )
        self.assertEqual(qs.count(), 0)
