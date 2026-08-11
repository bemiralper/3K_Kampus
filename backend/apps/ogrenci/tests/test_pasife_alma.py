"""Pasife alma — Ogrenci.aktif_mi ile OgrenciKayit.aktif_mi senkronu."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.ogrenci.infrastructure.repositories import OgrenciRepository
from apps.personel.domain.models import Personel
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class PasifeAlmaSyncTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Pasif Kurum', kod='PSK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PSK-M')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Pasif', aktif_mi=True,
        )
        self.kayit = OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            aktif_mi=True,
        )
        self.repo = OgrenciRepository()

    def test_delete_soft_deactivates_kayit(self):
        self.assertTrue(self.repo.delete(self.ogrenci.id))
        self.ogrenci.refresh_from_db()
        self.kayit.refresh_from_db()
        self.assertFalse(self.ogrenci.aktif_mi)
        self.assertFalse(self.kayit.aktif_mi)

    def test_delete_deactivates_placement_and_coach(self):
        seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11', kod='PSK11', sira=11,
        )
        sinif = Sinif.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            ad='11-P', kod='11P', kapasite=30, sinif_seviyesi=seviye, aktif_mi=True,
        )
        today = date.today()
        term = Term.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            name='Güz', code='G', start_date=today - timedelta(days=10),
            end_date=today + timedelta(days=100), order_no=1, is_active=True,
        )
        placement = StudentClassPlacement.objects.create(
            academic_year=self.yil, term=term, student=self.ogrenci,
            classroom=sinif, is_active=True,
        )
        teacher = Personel.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Koç', soyad='Öğretmen',
            tc_kimlik_no='11111111111',
        )
        coach = CoachProfile.objects.create(
            teacher=teacher, capacity=10, is_active=True, is_coach=True,
        )
        assignment = CoachStudentAssignment.objects.create(
            coach=coach, student=self.ogrenci, start_date=today, is_primary=True,
        )

        self.assertTrue(self.repo.delete(self.ogrenci.id))
        placement.refresh_from_db()
        assignment.refresh_from_db()
        self.assertFalse(placement.is_active)
        self.assertEqual(assignment.end_date, today)

    def test_update_aktif_mi_false_deactivates_kayit(self):
        self.repo.update(self.ogrenci.id, {'aktif_mi': False})
        self.ogrenci.refresh_from_db()
        self.kayit.refresh_from_db()
        self.assertFalse(self.ogrenci.aktif_mi)
        self.assertFalse(self.kayit.aktif_mi)

    def test_update_aktif_mi_true_reactivates_latest_kayit(self):
        self.repo.delete(self.ogrenci.id)
        self.kayit.refresh_from_db()
        self.assertFalse(self.kayit.aktif_mi)

        self.repo.update(self.ogrenci.id, {'aktif_mi': True})
        self.ogrenci.refresh_from_db()
        self.kayit.refresh_from_db()
        self.assertTrue(self.ogrenci.aktif_mi)
        self.assertTrue(self.kayit.aktif_mi)


class PasifeAlmaListAPITest(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Pasif List Kurum', kod='PLK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PLK-M')
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Liste', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            aktif_mi=True,
        )
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }
        user = User.objects.create_user(username='pasif_admin', password='x', is_staff=True)
        role = Role.objects.get(code='kurum_yoneticisi')
        UserRole.objects.create(
            user=user, role=role, kurum=self.kurum, must_change_password=False,
        )
        self.client.force_login(user)

    def test_list_shows_pasif_after_delete(self):
        res = self.client.delete(
            f'/ogrenciler/api/{self.ogrenci.id}/delete/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json().get('success'))

        aktif = self.client.get(
            '/ogrenciler/api/list/?durum=aktif',
            **self.headers,
        )
        self.assertEqual(aktif.status_code, 200)
        aktif_ids = {row['id'] for row in aktif.json().get('ogrenciler', [])}
        self.assertNotIn(self.ogrenci.id, aktif_ids)

        pasif = self.client.get(
            '/ogrenciler/api/list/?durum=pasif',
            **self.headers,
        )
        self.assertEqual(pasif.status_code, 200)
        pasif_rows = pasif.json().get('ogrenciler', [])
        pasif_ids = {row['id'] for row in pasif_rows}
        self.assertIn(self.ogrenci.id, pasif_ids)
        row = next(r for r in pasif_rows if r['id'] == self.ogrenci.id)
        self.assertFalse(row['aktif_mi'])

    def test_list_shows_pasif_when_only_ogrenci_flag_false(self):
        """Eski tutarsız veri: öğrenci pasif, kayıt hâlâ aktif."""
        self.ogrenci.aktif_mi = False
        self.ogrenci.save(update_fields=['aktif_mi'])

        aktif = self.client.get(
            '/ogrenciler/api/list/?durum=aktif',
            **self.headers,
        )
        aktif_ids = {row['id'] for row in aktif.json().get('ogrenciler', [])}
        self.assertNotIn(self.ogrenci.id, aktif_ids)

        pasif = self.client.get(
            '/ogrenciler/api/list/?durum=pasif',
            **self.headers,
        )
        pasif_rows = pasif.json().get('ogrenciler', [])
        row = next(r for r in pasif_rows if r['id'] == self.ogrenci.id)
        self.assertFalse(row['aktif_mi'])

    def test_list_default_durum_is_aktif(self):
        res = self.client.delete(
            f'/ogrenciler/api/{self.ogrenci.id}/delete/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        res = self.client.get('/ogrenciler/api/list/', **self.headers)
        self.assertEqual(res.status_code, 200)
        ids = {row['id'] for row in res.json().get('ogrenciler', [])}
        self.assertNotIn(self.ogrenci.id, ids)
