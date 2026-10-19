"""Pasif, kaydı kapanmış ve sözleşmesi düşen öğrenciler koç portalından çıkar."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.coaching.services.coach_self_stats import get_coach_self_stats
from apps.egitim_paketleri.models import EkHizmet
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.odeme_takip.application.services.fesih_service import FesihService
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.domain.enums import FesihNedeni, SozlesmeDurum
from apps.odeme_takip.domain.models import Sozlesme
from apps.ogrenci.domain.models import Ogrenci, OgrenciEkHizmet, OgrenciKayit
from apps.personel.domain.models import Personel
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

STUDENTS_URL = '/api/coaching/students/'
PROFILE_URL = '/api/coaching/students/{}/profile/'
COACH_STUDENTS_URL = '/api/coaching/coaches/{}/students/'
GORUSME_BILGI_URL = '/api/coaching/gorusmeler/kullanici-bilgi/'


class CoachPortalVisibilityTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Portal Kurum', kod='PVK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PVM')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            ad='11-A', kod='11A', aktif_mi=True,
        )
        self.coach_user = User.objects.create_user(
            username='portal_coach', email='portal_coach@test.com', password='testpass123',
        )
        self.admin_user = User.objects.create_superuser(
            username='portal_admin', email='portal_admin@test.com', password='testpass123',
        )
        personel = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Koç', soyad='Portal',
            tc_kimlik_no='22222222222', user=self.coach_user,
        )
        self.coach = CoachProfile.objects.create(
            teacher=personel, capacity=20, is_active=True, is_coach=True,
        )
        self.client = APIClient()
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        self.kocluk = EkHizmet.objects.create(
            ad='Koçluk', kod='KOC-PV', hizmet_turu='kocluk',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.egitim_yili,
            brut_fiyat=1000, aktif_mi=True,
        )

    def _student(self, ad, *, aktif=True, kayit=True, kayit_aktif=True):
        ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad=ad, soyad='Öğrenci', aktif_mi=aktif,
        )
        if kayit:
            OgrenciKayit.objects.create(
                ogrenci=ogrenci, sinif=self.sinif, egitim_yili=self.egitim_yili,
                kurum=self.kurum, sube=self.sube, aktif_mi=kayit_aktif,
            )
        return ogrenci

    def _assign(self, ogrenci):
        return CoachStudentAssignment.objects.create(
            coach=self.coach, student=ogrenci, start_date=date(2026, 1, 1), is_primary=True,
        )

    def _sozlesme(self, ogrenci, durum, no):
        today = timezone.localdate()
        return Sozlesme.objects.create(
            sozlesme_no=no,
            ogrenci=ogrenci,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            baslangic_tarihi=today - timedelta(days=30),
            bitis_tarihi=today + timedelta(days=300),
            paket_turu='ek_hizmet',
            paket_adi='Koçluk',
            brut_tutar=1000,
            net_tutar=1000,
            durum=durum,
        )

    def _ek_hizmet(self, ogrenci):
        return OgrenciEkHizmet.objects.create(
            ogrenci=ogrenci, ek_hizmet=self.kocluk, aktif_mi=True,
            egitim_yili=self.egitim_yili,
        )

    def _listed_ids(self, user):
        self.client.force_authenticate(user=user)
        response = self.client.get(STUDENTS_URL)
        self.assertEqual(response.status_code, 200)
        return {row['id'] for row in response.data['data']}

    def test_pasif_ogrenci_listeden_duser_ve_atama_kapanir(self):
        ogrenci = self._student('Pasif')
        assignment = self._assign(ogrenci)
        ogrenci.aktif_mi = False
        ogrenci.save(update_fields=['aktif_mi'])

        self.assertNotIn(ogrenci.id, self._listed_ids(self.coach_user))
        assignment.refresh_from_db()
        self.assertEqual(assignment.end_date, timezone.localdate())
        self.assertEqual(self.coach.current_student_count, 0)

    def test_kaydi_kapanan_ogrenci_listeden_duser(self):
        ogrenci = self._student('Kayitsiz', kayit_aktif=False)
        assignment = self._assign(ogrenci)

        self.assertNotIn(ogrenci.id, self._listed_ids(self.coach_user))
        assignment.refresh_from_db()
        self.assertIsNotNone(assignment.end_date)

    def test_iptal_sozlesme_listeden_duser_ve_erisim_kapanir(self):
        ogrenci = self._student('Iptal')
        assignment = self._assign(ogrenci)
        self._sozlesme(ogrenci, SozlesmeDurum.IPTAL, 'SZL-PV-IPTAL')
        erisim = self._ek_hizmet(ogrenci)

        self.assertNotIn(ogrenci.id, self._listed_ids(self.coach_user))
        assignment.refresh_from_db()
        erisim.refresh_from_db()
        self.assertIsNotNone(assignment.end_date)
        self.assertFalse(erisim.aktif_mi)

    def test_fesih_sozlesme_listeden_duser(self):
        ogrenci = self._student('Fesih')
        assignment = self._assign(ogrenci)
        self._sozlesme(ogrenci, SozlesmeDurum.FESHEDILMIS, 'SZL-PV-FESIH')

        self.assertNotIn(ogrenci.id, self._listed_ids(self.admin_user))
        assignment.refresh_from_db()
        self.assertIsNotNone(assignment.end_date)

    def test_iptal_yaninda_aktif_sozlesme_listede_kalir(self):
        ogrenci = self._student('Cift')
        assignment = self._assign(ogrenci)
        self._sozlesme(ogrenci, SozlesmeDurum.IPTAL, 'SZL-PV-IPTAL-2')
        self._sozlesme(ogrenci, SozlesmeDurum.AKTIF, 'SZL-PV-AKTIF')

        self.assertIn(ogrenci.id, self._listed_ids(self.coach_user))
        assignment.refresh_from_db()
        self.assertIsNone(assignment.end_date)

    def test_sozlesmesiz_aktif_ogrenci_listede_kalir(self):
        ogrenci = self._student('Sozlesmesiz', kayit=False)
        self._assign(ogrenci)
        self.assertIn(ogrenci.id, self._listed_ids(self.coach_user))
        self.assertIn(ogrenci.id, self._listed_ids(self.admin_user))

    def test_profil_pasif_ogrencide_bulunamadi_doner(self):
        ogrenci = self._student('Gizli')
        self._assign(ogrenci)
        ogrenci.aktif_mi = False
        ogrenci.save(update_fields=['aktif_mi'])

        self.client.force_authenticate(user=self.coach_user)
        response = self.client.get(PROFILE_URL.format(ogrenci.id))
        self.assertEqual(response.status_code, 404)

        self.client.force_authenticate(user=self.admin_user)
        response = self.client.get(PROFILE_URL.format(ogrenci.id))
        self.assertEqual(response.status_code, 404)

    def test_gorusme_listesi_ve_koc_ogrencileri_gizler(self):
        ogrenci = self._student('Gorusme')
        self._assign(ogrenci)
        self._sozlesme(ogrenci, SozlesmeDurum.IPTAL, 'SZL-PV-GOR')

        self.client.force_authenticate(user=self.coach_user)
        bilgi = self.client.get(GORUSME_BILGI_URL)
        self.assertEqual(bilgi.status_code, 200)
        self.assertEqual(bilgi.data['assigned_students'], [])

        roster = self.client.get(COACH_STUDENTS_URL.format(self.coach.id))
        self.assertEqual(roster.status_code, 200)
        self.assertEqual(roster.data['count'], 0)

    def test_koc_istatistigi_gizli_ogrenciyi_saymaz(self):
        ogrenci = self._student('Sayim')
        self._assign(ogrenci)
        ogrenci.aktif_mi = False
        ogrenci.save(update_fields=['aktif_mi'])

        stats = get_coach_self_stats(self.coach, self.coach_user)
        self.assertEqual(stats['ogrenciler']['aktif_ogrenci'], 0)

    def test_durum_iptal_atamayi_kapatir(self):
        ogrenci = self._student('Durum')
        assignment = self._assign(ogrenci)
        sozlesme = self._sozlesme(ogrenci, SozlesmeDurum.AKTIF, 'SZL-PV-DEG')
        erisim = self._ek_hizmet(ogrenci)

        result, err = SozlesmeService().change_status(sozlesme.id, SozlesmeDurum.IPTAL)
        self.assertIsNone(err)
        self.assertEqual(result.durum, SozlesmeDurum.IPTAL)
        assignment.refresh_from_db()
        erisim.refresh_from_db()
        self.assertEqual(assignment.end_date, timezone.localdate())
        self.assertFalse(erisim.aktif_mi)
        self.assertNotIn(ogrenci.id, self._listed_ids(self.coach_user))

    def test_fesih_uygula_atamayi_kapatir(self):
        ogrenci = self._student('FesihUygula')
        assignment = self._assign(ogrenci)
        sozlesme = self._sozlesme(ogrenci, SozlesmeDurum.AKTIF, 'SZL-PV-FES-UYG')
        erisim = self._ek_hizmet(ogrenci)

        fesih, err = FesihService().fesih_uygula(
            sozlesme.id,
            timezone.localdate(),
            FesihNedeni.VELI_TALEBI,
        )
        self.assertIsNone(err)
        self.assertIsNotNone(fesih)
        assignment.refresh_from_db()
        erisim.refresh_from_db()
        sozlesme.refresh_from_db()
        self.assertEqual(sozlesme.durum, SozlesmeDurum.FESHEDILMIS)
        self.assertEqual(assignment.end_date, timezone.localdate())
        self.assertFalse(erisim.aktif_mi)
