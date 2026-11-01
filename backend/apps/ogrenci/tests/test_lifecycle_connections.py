"""Öğrenci/sözleşme/paket bağlantıları için regresyon testleri."""
import json
from datetime import date, timedelta
from django.test import TestCase
from django.contrib.auth import get_user_model
from apps.ozel_ders.tests import test_sync_service as sync_fixture
from apps.ogrenci.tests import test_ogrenci_adres_update as api_fixture
from apps.ogrenci.domain.models import OgrenciKayit, OgrenciEgitimPaketi, OgrenciEkHizmet
from apps.ogrenci.infrastructure.repositories import OgrenciRepository
from apps.ozel_ders.services.sync_service import ensure_program_for_package, ensure_program_from_sozlesme, sync_sube_programs
from apps.ozel_ders.domain.models import BirebirOgrenciProgrami
from apps.odeme_takip.domain.models import Sozlesme
from apps.odeme_takip.domain.enums import SozlesmeDurum
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.egitim_yili.domain.models import EgitimYili

class StudentLifecycleConnectionsTests(TestCase):

    def program(self):
        return ensure_program_for_package(ogrenci_id=self.ogrenci.id, kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.ey.id, paket_turu='ozel_ders', paket_id=self.ozel_paket.id)[0]

    def contract(self):
        return Sozlesme.objects.create(sozlesme_no='AUDIT001', kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ogrenci=self.ogrenci, baslangic_tarihi=date.today(), bitis_tarihi=date.today() + timedelta(days=90), paket_turu='ozel_ders', paket_id=self.ozel_paket.id, paket_adi='Birebir', brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000, taksit_sayisi=1, durum=SozlesmeDurum.AKTIF)

    def test_deactivation_closes_private_program(self):
        sync_fixture.SyncServiceTests.setUp(self)
        p = self.program()
        OgrenciRepository().delete(self.ogrenci.id)
        p.refresh_from_db()
        self.assertEqual(p.durum, 'PASIF')

    def test_sync_does_not_reopen_inactive_student(self):
        sync_fixture.SyncServiceTests.setUp(self)
        OgrenciEgitimPaketi.objects.create(ogrenci=self.ogrenci, paket_turu='ozel_ders', paket_id=self.ozel_paket.id, aktif_mi=True)
        OgrenciRepository().delete(self.ogrenci.id)
        sync_sube_programs(kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.ey.id)
        self.assertFalse(BirebirOgrenciProgrami.objects.filter(ogrenci=self.ogrenci, durum='AKTIF').exists())

    def test_sync_does_not_copy_package_to_unregistered_year(self):
        sync_fixture.SyncServiceTests.setUp(self)
        OgrenciEgitimPaketi.objects.create(ogrenci=self.ogrenci, paket_turu='ozel_ders', paket_id=self.ozel_paket.id, aktif_mi=True)
        later = EgitimYili.objects.create(baslangic_yil=2027, bitis_yil=2028)
        sync_sube_programs(kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=later.id)
        self.assertFalse(BirebirOgrenciProgrami.objects.filter(ogrenci=self.ogrenci, egitim_yili=later, durum='AKTIF').exists())
        self.assertFalse(OgrenciKayit.objects.filter(ogrenci=self.ogrenci, egitim_yili=later).exists())

    def test_cancel_last_contract_closes_program(self):
        sync_fixture.SyncServiceTests.setUp(self)
        OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                                   egitim_yili=self.ey, aktif_mi=True)
        c = self.contract()
        p, _ = ensure_program_from_sozlesme(c)
        result, error = SozlesmeService().change_status(c.id, SozlesmeDurum.IPTAL)
        self.assertIsNone(error)
        p.refresh_from_db()
        self.assertEqual(p.durum, 'PASIF')
        sync_sube_programs(kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.ey.id)
        p.refresh_from_db()
        self.assertEqual(p.durum, 'PASIF')

    def test_used_package_cannot_be_deleted(self):
        sync_fixture.SyncServiceTests.setUp(self)
        p = self.program()
        pid = self.ozel_paket.id
        OgrenciEgitimPaketi.objects.create(ogrenci=self.ogrenci, paket_turu='ozel_ders', paket_id=pid, aktif_mi=True)
        from apps.egitim_paketleri.application.services import OzelDersService
        success, error = OzelDersService().delete(pid)
        self.assertFalse(success)
        self.assertIsNotNone(error)
        p.refresh_from_db()
        self.assertEqual(p.ozel_ders_paket_id, pid)
        self.assertTrue(OgrenciEgitimPaketi.objects.filter(ogrenci=self.ogrenci, paket_id=pid, aktif_mi=True).exists())

    def test_update_cannot_bypass_active_contract_guard(self):
        api_fixture.OgrenciAdresUpdateTests.setUp(self)
        self.ey = EgitimYili.objects.create(baslangic_yil=2028, bitis_yil=2029)
        self.ozel_paket = type('P', (), {'id': 999})()
        self.contract()
        user = get_user_model().objects.create_superuser(username='audit_admin', password='x')
        self.client.force_login(user)
        denied = self.client.delete(f'/ogrenciler/api/{self.ogrenci.id}/delete/', **self.headers)
        self.assertEqual(denied.status_code, 400)
        accepted = api_fixture.OgrenciAdresUpdateTests._put(self, {'ad': self.ogrenci.ad, 'soyad': self.ogrenci.soyad, 'aktif_mi': False})
        self.assertEqual(accepted.status_code, 400, accepted.content[:200])
        self.ogrenci.refresh_from_db()
        self.assertTrue(self.ogrenci.aktif_mi)

    def test_invalid_school_update_is_atomic(self):
        api_fixture.OgrenciAdresUpdateTests.setUp(self)
        response = api_fixture.OgrenciAdresUpdateTests._put(self, {'ad': 'Degisen', 'soyad': self.ogrenci.soyad, 'school_id': 987654})
        self.assertEqual(response.status_code, 400, response.content[:200])
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Ayşe')

    def test_foreign_service_cannot_be_cancelled(self):
        sync_fixture.SyncServiceTests.setUp(self)
        from apps.kurum.domain.models import Kurum
        from apps.sube.domain.models import Sube
        from apps.ogrenci.domain.models import Ogrenci
        from apps.egitim_paketleri.models import EkHizmet
        foreign = Kurum.objects.create(ad='Diger', kod='AUDOTHER')
        branch = Sube.objects.create(kurum=foreign, ad='Sube', kod='S')
        student = Ogrenci.objects.create(kurum=foreign, sube=branch, ad='Baska', soyad='Ogrenci')
        service = EkHizmet.objects.create(kurum=foreign, sube=branch, egitim_yili=self.ey, ad='Kutuphane', kod='K', hizmet_turu='kutuphane', brut_fiyat=100)
        access = OgrenciEkHizmet.objects.create(ogrenci=student, ek_hizmet=service, egitim_yili=self.ey, aktif_mi=True, dahil_mi=False)
        from apps.roller.seed import ensure_default_roles
        from apps.roller.models import Role, UserRole
        ensure_default_roles()
        user = get_user_model().objects.create_user(username='audit_scope', password='x')
        role = Role.objects.filter(code='kurum_yoneticisi').first()
        self.assertIsNotNone(role)
        UserRole.objects.create(user=user, role=role, kurum=self.kurum, must_change_password=False)
        self.client.force_login(user)
        response = self.client.delete(f'/egitim-paketleri/api/ek-hizmet-satis/{access.id}/iptal/', HTTP_X_KURUM_ID=str(self.kurum.id), HTTP_X_SUBE_ID=str(self.sube.id), HTTP_X_EGITIMYILI_ID=str(self.ey.id))
        self.assertEqual(response.status_code, 404, response.content[:300])
        access.refresh_from_db()
        self.assertTrue(access.aktif_mi)

    def test_class_update_uses_selected_year(self):
        sync_fixture.SyncServiceTests.setUp(self)
        from apps.sinif.domain.models import Sinif
        newyear = EgitimYili.objects.create(baslangic_yil=2027, bitis_yil=2028)
        oldclass = Sinif.objects.create(kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ad='Eski')
        newclass = Sinif.objects.create(kurum=self.kurum, sube=self.sube, egitim_yili=newyear, ad='Yeni')
        old = OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, sinif=oldclass, aktif_mi=True)
        new = OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube, egitim_yili=newyear, sinif=newclass, aktif_mi=True)
        user = get_user_model().objects.create_superuser(username='audit_year', password='x')
        self.client.force_login(user)
        res = self.client.put(f'/ogrenciler/api/{self.ogrenci.id}/', data=json.dumps({'ad': self.ogrenci.ad, 'soyad': self.ogrenci.soyad, 'sinif_id': None}), content_type='application/json', HTTP_X_KURUM_ID=str(self.kurum.id), HTTP_X_SUBE_ID=str(self.sube.id), HTTP_X_EGITIMYILI_ID=str(self.ey.id))
        self.assertEqual(res.status_code, 200, res.content[:200])
        old.refresh_from_db()
        new.refresh_from_db()
        self.assertIsNone(old.sinif_id)
        self.assertEqual(new.sinif_id, newclass.id)

    def test_deactivation_releases_locker(self):
        sync_fixture.SyncServiceTests.setUp(self)
        from apps.kutuphane.domain.models import Locker, LockerAssignment
        locker = Locker.objects.create(kurum_id=self.kurum.id, sube_id=self.sube.id, dolap_no='D1', durum='ASSIGNED')
        assignment = LockerAssignment.objects.create(kurum_id=self.kurum.id, locker=locker, ogrenci_id=self.ogrenci.id, durum='ACTIVE', baslangic_tarihi=date.today())
        OgrenciRepository().delete(self.ogrenci.id)
        assignment.refresh_from_db()
        locker.refresh_from_db()
        self.assertEqual(assignment.durum, 'ENDED')
        self.assertEqual(locker.durum, 'AVAILABLE')

    def test_package_replacement_closes_old_program(self):
        sync_fixture.SyncServiceTests.setUp(self)
        c = self.contract()
        old, _ = ensure_program_from_sozlesme(c)
        result, error = SozlesmeService().update(c.id, {'paket_turu': 'premium', 'paket_id': self.premium.id, 'paket_adi': 'Yeni Premium', 'kalemler': [], 'brut_tutar': 1000, 'kdv_orani': 0})
        self.assertIsNone(error, error)
        old.refresh_from_db()
        self.assertEqual(old.durum, 'PASIF')
        self.assertTrue(BirebirOgrenciProgrami.objects.filter(ogrenci=self.ogrenci, premium_paket=self.premium, durum='AKTIF').exists())

    def test_removing_one_contract_preserves_shared_right(self):
        sync_fixture.SyncServiceTests.setUp(self)
        from apps.odeme_takip.domain.models import SozlesmeKalemi
        from apps.odeme_takip.domain.enums import KalemTuru
        c = self.contract()
        c.paket_turu = 'ek_hizmet'
        c.paket_id = None
        c.save()
        second = Sozlesme.objects.get(pk=c.pk)
        second.pk = None
        second.sozlesme_no = 'AUDIT002'
        second.save()
        k1 = SozlesmeKalemi.objects.create(sozlesme=c, kalem_turu=KalemTuru.OZEL_DERS, kalem_id=self.ozel_paket.id, kalem_adi='Birebir', brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000)
        SozlesmeKalemi.objects.create(sozlesme=second, kalem_turu=KalemTuru.OZEL_DERS, kalem_id=self.ozel_paket.id, kalem_adi='Birebir', brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000)
        p, _ = ensure_program_from_sozlesme(c)
        ensure_program_from_sozlesme(second)
        result, error = SozlesmeService().kalem_cikar(k1.id)
        self.assertIsNone(error, error)
        p.refresh_from_db()
        self.assertEqual(p.durum, 'AKTIF')
        self.assertTrue(second.kalemler.filter(kalem_id=self.ozel_paket.id).exists())
