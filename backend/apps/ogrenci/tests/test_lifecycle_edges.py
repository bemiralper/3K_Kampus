"""Yaşam döngüsü sınırları: yetki, yıl, geri alma, geçmiş ve ortak haklar."""
import json
from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, TransactionTestCase

from apps.ozel_ders.tests import test_sync_service as fixtures
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciEgitimPaketi, OgrenciEkHizmet
from apps.ogrenci.infrastructure.repositories import OgrenciRepository
from apps.egitim_yili.domain.models import EgitimYili
from apps.egitim_paketleri.models import EkHizmet, OzelDers, PremiumPaket, GrupDersi, Deneme, YayinPaketi
from apps.egitim_paketleri.application import services as package_services
from apps.odeme_takip.domain.models import Sozlesme
from apps.odeme_takip.domain.enums import SozlesmeDurum
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.ozel_ders.services.sync_service import ensure_program_for_package, ensure_program_from_sozlesme
from apps.ozel_ders.domain.models import BirebirOgrenciProgrami
from apps.sube.domain.models import Sube


class LifecycleEdgeCasesTests(TestCase):
    def setUp(self):
        fixtures.SyncServiceTests.setUp(self)
        self.user = get_user_model().objects.create_superuser(username='lifecycle_admin', password='x')
        self.client.force_login(self.user)
        self.headers = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id),
                        'HTTP_X_EGITIMYILI_ID': str(self.ey.id)}
        self.repo = OgrenciRepository()

    def make_program(self):
        return ensure_program_for_package(ogrenci_id=self.ogrenci.id, kurum_id=self.kurum.id,
            sube_id=self.sube.id, egitim_yili_id=self.ey.id, paket_turu='ozel_ders', paket_id=self.ozel_paket.id)[0]

    def make_contract(self, *, year=None, status=SozlesmeDurum.AKTIF):
        return Sozlesme.objects.create(sozlesme_no=f'EDGE-{Sozlesme.objects.count()}',
            kurum=self.kurum, sube=self.sube, egitim_yili=year or self.ey, ogrenci=self.ogrenci,
            baslangic_tarihi=date.today(), bitis_tarihi=date.today()+timedelta(days=90),
            paket_turu='ozel_ders', paket_id=self.ozel_paket.id, paket_adi=self.ozel_paket.ad,
            brut_tutar=1000, kdv_dahil_tutar=1000, net_tutar=1000, durum=status)

    def put_student(self, **data):
        return self.client.put(f'/ogrenciler/api/{self.ogrenci.id}/',
            data=json.dumps({'ad': self.ogrenci.ad, 'soyad': self.ogrenci.soyad, **data}),
            content_type='application/json', **self.headers)

    def service_access(self, *, branch=None, year=None, included=False):
        service = EkHizmet.objects.create(kurum=self.kurum, sube=branch or self.sube, egitim_yili=year or self.ey,
            ad='Kütüphane', kod=f'K-{EkHizmet.objects.count()}', hizmet_turu='kutuphane', brut_fiyat=100)
        return OgrenciEkHizmet.objects.create(ogrenci=self.ogrenci, ek_hizmet=service,
            egitim_yili=year or self.ey, dahil_mi=included, aktif_mi=True, fiyat=100)

    def test_deactivation_is_idempotent(self):
        program = self.make_program()
        self.assertTrue(self.repo.delete(self.ogrenci.id))
        self.assertTrue(self.repo.delete(self.ogrenci.id))
        program.refresh_from_db()
        self.assertEqual(program.durum, 'PASIF')

    def test_link_failure_rolls_back_student_and_enrollment(self):
        kayit = OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                                           egitim_yili=self.ey, aktif_mi=True)
        with patch('apps.ozel_ders.services.sync_service.deactivate_programs', side_effect=RuntimeError('sync failed')):
            with self.assertRaises(RuntimeError):
                self.repo.delete(self.ogrenci.id)
        self.ogrenci.refresh_from_db()
        kayit.refresh_from_db()
        self.assertTrue(self.ogrenci.aktif_mi)
        self.assertTrue(kayit.aktif_mi)

    def test_active_contract_blocks_all_student_mutations(self):
        self.make_contract()
        response = self.put_student(ad='Değişmemeli', aktif_mi=False)
        self.assertEqual(response.status_code, 400)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Ali')
        self.assertTrue(self.ogrenci.aktif_mi)

    def test_invalid_academic_id_has_no_partial_writes(self):
        response = self.put_student(ad='Değişmemeli', sinif_id='invalid')
        self.assertEqual(response.status_code, 400)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Ali')

    def test_missing_selected_year_enrollment_is_rejected(self):
        response = self.put_student(ad='Değişmemeli', sinif_id=None)
        self.assertEqual(response.status_code, 400)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Ali')

    def test_wrong_year_class_is_rejected(self):
        from apps.sinif.domain.models import Sinif
        OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                                   egitim_yili=self.ey, aktif_mi=True)
        other_year = EgitimYili.objects.create(baslangic_yil=2028, bitis_yil=2029)
        classroom = Sinif.objects.create(kurum=self.kurum, sube=self.sube, egitim_yili=other_year, ad='Yeni yıl')
        response = self.put_student(ad='Değişmemeli', sinif_id=classroom.id)
        self.assertEqual(response.status_code, 400)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Ali')

    def test_placement_failure_rolls_back_all_changes(self):
        OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                                   egitim_yili=self.ey, aktif_mi=True)
        with patch('apps.ogrenci.interfaces.views._sync_term_placement_from_kayit', side_effect=RuntimeError('placement failed')):
            response = self.put_student(ad='Değişmemeli', sinif_id=None)
        self.assertEqual(response.status_code, 400)
        self.ogrenci.refresh_from_db()
        self.assertEqual(self.ogrenci.ad, 'Ali')

    def test_reactivation_uses_selected_enrollment_year(self):
        later = EgitimYili.objects.create(baslangic_yil=2028, bitis_yil=2029)
        old = OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                                         egitim_yili=self.ey, aktif_mi=True)
        new = OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                                         egitim_yili=later, aktif_mi=True)
        program = self.make_program()
        self.repo.delete(self.ogrenci.id)
        response = self.put_student(aktif_mi=True)
        self.assertEqual(response.status_code, 200)
        old.refresh_from_db()
        new.refresh_from_db()
        program.refresh_from_db()
        self.assertTrue(old.aktif_mi)
        self.assertFalse(new.aktif_mi)
        self.assertEqual(program.durum, 'PASIF')

    def test_manual_program_cannot_be_reactivated_for_inactive_student(self):
        from apps.ozel_ders.services.program_service import update_program
        from apps.ozel_ders.services.errors import OzelDersError
        program = self.make_program()
        self.repo.delete(self.ogrenci.id)
        with self.assertRaises(OzelDersError):
            update_program(program.id, {'durum': 'AKTIF'}, kurum_id=self.kurum.id, sube_id=self.sube.id)

    def test_draft_and_cancelled_contracts_do_not_open_programs(self):
        for state in (SozlesmeDurum.TASLAK, SozlesmeDurum.IPTAL, SozlesmeDurum.FESHEDILMIS):
            with self.subTest(state=state):
                contract = self.make_contract(status=state)
                program, _ = ensure_program_from_sozlesme(contract)
                self.assertIsNone(program)
        self.assertFalse(BirebirOgrenciProgrami.objects.filter(ogrenci=self.ogrenci).exists())

    def test_completed_and_frozen_contracts_keep_rights(self):
        for state in (SozlesmeDurum.TAMAMLANDI, SozlesmeDurum.DONDURULMUS):
            with self.subTest(state=state):
                contract = self.make_contract(status=state)
                program, _ = ensure_program_from_sozlesme(contract)
                self.assertEqual(program.durum, 'AKTIF')

    def test_cancelling_one_year_does_not_close_other_year(self):
        later = EgitimYili.objects.create(baslangic_yil=2028, bitis_yil=2029)
        first, second = self.make_contract(), self.make_contract(year=later)
        p1, _ = ensure_program_from_sozlesme(first)
        p2, _ = ensure_program_from_sozlesme(second)
        _, error = SozlesmeService().change_status(first.id, SozlesmeDurum.IPTAL)
        self.assertIsNone(error)
        p1.refresh_from_db()
        p2.refresh_from_db()
        self.assertEqual(p1.durum, 'PASIF')
        self.assertEqual(p2.durum, 'AKTIF')

    def test_service_cancel_scope_and_included_protection(self):
        other_branch = Sube.objects.create(kurum=self.kurum, ad='Başka', kod='BASKA')
        other_year = EgitimYili.objects.create(baslangic_yil=2028, bitis_yil=2029)
        cases = [(self.service_access(), 200), (self.service_access(included=True), 400),
                 (self.service_access(branch=other_branch), 404), (self.service_access(year=other_year), 404)]
        for access, status in cases:
            with self.subTest(status=status):
                response = self.client.delete(f'/egitim-paketleri/api/ek-hizmet-satis/{access.id}/iptal/', **self.headers)
                self.assertEqual(response.status_code, status, response.content)
                access.refresh_from_db()
                self.assertEqual(access.aktif_mi, status != 200)

    def test_foreign_student_service_list_and_suggestions_are_hidden(self):
        branch = Sube.objects.create(kurum=self.kurum, ad='Başka', kod='BASKA')
        student = Ogrenci.objects.create(kurum=self.kurum, sube=branch, ad='Başka', soyad='Öğrenci')
        for suffix in ('', 'uygun/', 'uygun-deneme-paketleri/'):
            response = self.client.get(f'/egitim-paketleri/api/ek-hizmet-satis/ogrenci/{student.id}/{suffix}', **self.headers)
            self.assertEqual(response.status_code, 404, response.content)

    def test_sales_reject_foreign_student_and_foreign_service(self):
        branch = Sube.objects.create(kurum=self.kurum, ad='Başka', kod='BASKA')
        student = Ogrenci.objects.create(kurum=self.kurum, sube=branch, ad='Başka', soyad='Öğrenci')
        access = self.service_access(branch=branch)
        for student_id in (student.id, self.ogrenci.id):
            response = self.client.post('/egitim-paketleri/api/ek-hizmet-satis/',
                data=json.dumps({'ogrenci_id': student_id, 'ek_hizmet_id': access.ek_hizmet_id}),
                content_type='application/json', **self.headers)
            self.assertEqual(response.status_code, 404, response.content)

    def test_cancel_requires_auth_and_context(self):
        access = self.service_access()
        url = f'/egitim-paketleri/api/ek-hizmet-satis/{access.id}/iptal/'
        self.assertEqual(self.client.delete(url).status_code, 400)
        self.client.logout()
        self.assertEqual(self.client.delete(url, **self.headers).status_code, 401)
        access.refresh_from_db()
        self.assertTrue(access.aktif_mi)

    def test_all_catalog_types_protect_enrollment_history(self):
        types = [(GrupDersi, package_services.GrupDersiService, 'grup_dersi'),
                 (OzelDers, package_services.OzelDersService, 'ozel_ders'),
                 (PremiumPaket, package_services.PremiumPaketService, 'premium'),
                 (Deneme, package_services.DenemeService, 'deneme'),
                 (YayinPaketi, package_services.YayinPaketiService, 'yayin')]
        for model, service, kind in types:
            with self.subTest(kind=kind):
                package = model.objects.create(kurum=self.kurum, sube=self.sube, egitim_yili=self.ey,
                    ad=f'Geçmiş {kind}', kod=f'H-{kind}', brut_fiyat=100)
                OgrenciEgitimPaketi.objects.create(ogrenci=self.ogrenci, paket_turu=kind,
                    paket_id=package.pk, aktif_mi=False)
                success, error = service().delete(package.pk)
                self.assertFalse(success)
                self.assertIsNotNone(error)
                self.assertTrue(model.objects.filter(pk=package.pk).exists())

    def test_unused_package_can_be_deleted_without_confusing_ids(self):
        OgrenciEgitimPaketi.objects.create(ogrenci=self.ogrenci, paket_turu='ozel_ders',
            paket_id=self.ozel_paket.id, aktif_mi=True)
        success, error = package_services.PremiumPaketService().delete(self.premium.id)
        self.assertTrue(success)
        self.assertIsNone(error)
        self.assertTrue(OzelDers.objects.filter(pk=self.ozel_paket.pk).exists())

    def test_read_student_uses_selected_year(self):
        for year in (self.ey, EgitimYili.objects.create(baslangic_yil=2028, bitis_yil=2029)):
            OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
                egitim_yili=year, aktif_mi=True, okul_no=f'NO-{year.id}')
        response = self.client.get(f'/ogrenciler/api/{self.ogrenci.id}/', **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['okul_no'], f'NO-{self.ey.id}')

    def test_student_search_and_service_suggestions_use_enrollment_level(self):
        from apps.egitim_tanimlari.models import SinifSeviyesi
        level = SinifSeviyesi.objects.create(kurum=self.kurum, sube=self.sube, ad='11', kod='L11', sira=11)
        OgrenciKayit.objects.create(ogrenci=self.ogrenci, kurum=self.kurum, sube=self.sube,
            egitim_yili=self.ey, sinif_seviyesi=level, aktif_mi=True)
        response = self.client.get('/egitim-paketleri/api/ek-hizmet-satis/ogrenci-ara/?q=Ali', **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['data'][0]['sinif_seviyesi'], '11')
        for suffix in ('uygun/', 'uygun-deneme-paketleri/'):
            response = self.client.get(f'/egitim-paketleri/api/ek-hizmet-satis/ogrenci/{self.ogrenci.id}/{suffix}', **self.headers)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()['data']['ogrenci']['sinif_seviyesi'], '11')

    def test_own_service_sale_and_cancel_work(self):
        access = self.service_access()
        service_id = access.ek_hizmet_id
        access.delete()
        response = self.client.post('/egitim-paketleri/api/ek-hizmet-satis/',
            data=json.dumps({'ogrenci_id': self.ogrenci.id, 'ek_hizmet_id': service_id}),
            content_type='application/json', **self.headers)
        self.assertEqual(response.status_code, 201, response.content)
        access_id = response.json()['data']['id']
        response = self.client.delete(f'/egitim-paketleri/api/ek-hizmet-satis/{access_id}/iptal/', **self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(OgrenciEkHizmet.objects.get(pk=access_id).aktif_mi)

    def test_cancel_rejects_user_without_module_permission(self):
        access = self.service_access()
        self.client.force_login(get_user_model().objects.create_user(username='no_permission', password='x'))
        response = self.client.delete(f'/egitim-paketleri/api/ek-hizmet-satis/{access.id}/iptal/', **self.headers)
        self.assertEqual(response.status_code, 403)
        access.refresh_from_db()
        self.assertTrue(access.aktif_mi)


class LifecycleHistoryTests(TestCase):
    def test_deactivation_preserves_past_completed_and_locked_sessions(self):
        from apps.ozel_ders.tests import test_slot_oturum_sync as session_fixtures
        from apps.ozel_ders.domain.models import BirebirHakedis, HakedisDurumu, OturumDurumu

        fixture = session_fixtures.SlotOturumSyncTests
        fixture.setUp(self)
        past = fixture._oturum(self, self.today - timedelta(days=7))
        future = fixture._oturum(self, self.today + timedelta(days=7))
        completed = fixture._oturum(self, self.today + timedelta(days=14), durum=OturumDurumu.ISLENDI)
        locked = fixture._oturum(self, self.today + timedelta(days=21))
        payment = BirebirHakedis.objects.create(
            oturum=locked, ogretmen=self.ogretmen, ders=self.ders,
            tarih=locked.session_date, sure_dk=50, birim_ucret=100, tutar=100,
            durum=HakedisDurumu.ONAYLANDI,
        )

        OgrenciRepository().delete(self.ogrenci.id)

        for session in (past, completed, locked):
            session.refresh_from_db()
            self.assertTrue(session.is_active)
        future.refresh_from_db()
        self.assertFalse(future.is_active)
        payment.refresh_from_db()
        self.assertEqual(payment.durum, HakedisDurumu.ONAYLANDI)
        self.assertEqual(payment.tutar, 100)
        self.program.refresh_from_db()
        self.assertEqual(self.program.durum, 'PASIF')


class LifecycleConcurrencyTests(TransactionTestCase):
    def test_concurrent_sync_creates_only_one_program(self):
        from concurrent.futures import ThreadPoolExecutor
        from django.db import close_old_connections
        from threading import Barrier
        fixtures.SyncServiceTests.setUp(self)
        barrier = Barrier(2)
        kwargs = dict(ogrenci_id=self.ogrenci.id, kurum_id=self.kurum.id, sube_id=self.sube.id,
                      egitim_yili_id=self.ey.id, paket_turu='ozel_ders', paket_id=self.ozel_paket.id)
        def sync():
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                return ensure_program_for_package(**kwargs)[0].id
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            ids = list(pool.map(lambda _: sync(), range(2)))
        self.assertEqual(ids[0], ids[1])
        self.assertEqual(BirebirOgrenciProgrami.objects.filter(ogrenci=self.ogrenci).count(), 1)
