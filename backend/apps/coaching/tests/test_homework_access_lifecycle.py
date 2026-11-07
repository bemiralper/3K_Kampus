"""Coach/service lifecycle and frozen contract rights regression scenarios."""
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from . import test_coach_change as coach_fixtures
from apps.odeme_takip.tests import test_sozlesme_erisim_sync as contract_fixtures
from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.coaching.assignment_manual.models import ManualAssignment, AssignmentLesson, AssignmentTask
from apps.coaching.services.coach_access import get_active_coach_student_ids, user_can_access_student
from apps.coaching.services.coach_change import change_primary_coach, CoachChangeError
from apps.coaching.services.eligibility import get_kocluk_ogrenci_ids, get_assignable_kocluk_ogrenci_queryset
from apps.odeme_takip.application.services.sozlesme_erisim_sync import sync_sozlesme_erisim
from apps.odeme_takip.domain.models import Sozlesme, SozlesmeKalemi
from apps.odeme_takip.application.services.sozlesme_service import SozlesmeService
from apps.odeme_takip.domain.enums import KalemTuru, SozlesmeDurum
from apps.ogrenci.domain.models import OgrenciEkHizmet
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube
from apps.egitim_paketleri.models import EkHizmet, GrupDersi


class CoachAccessLifecycleTests(TestCase):
    setUp = coach_fixtures.CoachChangeServiceTest.setUp

    def test_former_coach_loses_all_homework_read_routes(self):
        homework = ManualAssignment.objects.create(student=self.ogrenci, coach=self.old_user,
            title='History', status='ASSIGNED', due_date=timezone.now())
        block = AssignmentLesson.objects.create(assignment=homework, order=0)
        task = AssignmentTask.objects.create(lesson_block=block, title='Task', task_type='SOLVE_TEST', order=0)
        self.assignment.end_date = timezone.localdate()
        self.assignment.save(update_fields=['end_date'])
        self.assertFalse(user_can_access_student(self.old_user, self.ogrenci.pk))
        client = APIClient()
        client.force_authenticate(user=self.old_user)
        client.credentials(HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
        base = '/api/coaching/manual-assignments/'
        self.assertEqual(client.get(base + 'assignments/').json()['data'], [])
        for path in [f'assignments/{homework.pk}/', f'lessons/{block.pk}/', f'tasks/{task.pk}/']:
            response = client.get(base + path)
            self.assertEqual(response.status_code, 404, response.content)
        self.assertTrue(ManualAssignment.objects.filter(pk=homework.pk).exists())

    def test_disabled_coach_cannot_fall_back_to_owned_homework(self):
        self.old_user.is_staff = True
        self.old_user.save(update_fields=['is_staff'])
        ManualAssignment.objects.create(student=self.ogrenci, coach=self.old_user,
            title='History', due_date=timezone.now())
        self.old_coach.is_active = False
        self.old_coach.save(update_fields=['is_active'])
        self.assertFalse(user_can_access_student(self.old_user, self.ogrenci.pk))

    def test_cross_branch_coach_is_rejected_without_changing_assignment(self):
        branch = Sube.objects.create(kurum=self.kurum, ad='Other', kod='OT')
        self.new_personel.sube = branch
        self.new_personel.save(update_fields=['sube'])
        with self.assertRaises(CoachChangeError) as error:
            change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)
        self.assertEqual(error.exception.code, 'scope_mismatch')
        self.assignment.refresh_from_db()
        self.assertIsNone(self.assignment.end_date)

    def test_inactive_student_and_non_coach_are_rejected(self):
        self.ogrenci.aktif_mi = False
        self.ogrenci.save(update_fields=['aktif_mi'])
        with self.assertRaises(CoachChangeError):
            change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)
        self.ogrenci.aktif_mi = True
        self.ogrenci.save(update_fields=['aktif_mi'])
        self.new_coach.is_coach = False
        self.new_coach.save(update_fields=['is_coach'])
        with self.assertRaises(CoachChangeError):
            change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)

    def test_failed_work_transfer_rolls_back_relationship_and_ownership(self):
        homework = ManualAssignment.objects.create(student=self.ogrenci, coach=self.old_user,
            title='History', due_date=timezone.now())
        with patch('apps.coaching.services.coach_change.transfer_student_coaching_work', side_effect=RuntimeError('transfer failed')):
            with self.assertRaises(RuntimeError):
                change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)
        self.assignment.refresh_from_db()
        homework.refresh_from_db()
        self.assertIsNone(self.assignment.end_date)
        self.assertEqual(homework.coach_id, self.old_user.pk)
        self.assertFalse(CoachStudentAssignment.objects.filter(coach=self.new_coach, student=self.ogrenci).exists())

    def test_reassignment_after_manual_removal_transfers_old_work(self):
        homework = ManualAssignment.objects.create(student=self.ogrenci, coach=self.old_user,
            title='History', due_date=timezone.now())
        self.assignment.end_date = timezone.localdate()
        self.assignment.save(update_fields=['end_date'])
        change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)
        homework.refresh_from_db()
        self.assertEqual(homework.coach_id, self.new_user.pk)


    def test_inactive_teacher_is_not_an_assignable_coach(self):
        self.new_personel.aktif_mi = False
        self.new_personel.save(update_fields=['aktif_mi'])
        with self.assertRaises(CoachChangeError) as error:
            change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)
        self.assertEqual(error.exception.code, 'coach_not_found')

    def test_transfer_date_cannot_precede_current_assignment(self):
        with self.assertRaises(CoachChangeError) as error:
            change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk,
                                 transfer_date=self.assignment.start_date - timedelta(days=1))
        self.assertEqual(error.exception.code, 'invalid_transfer_date')
        self.assignment.refresh_from_db()
        self.assertIsNone(self.assignment.end_date)

    def test_calendar_transfer_failure_rolls_back_earlier_homework_transfer(self):
        homework = ManualAssignment.objects.create(student=self.ogrenci, coach=self.old_user,
                                                  title='Rollback', due_date=timezone.now())
        with patch('apps.takvim.domain.models.Event.objects.filter', side_effect=RuntimeError('calendar failed')):
            with self.assertRaises(RuntimeError):
                change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=self.new_coach.pk)
        homework.refresh_from_db()
        self.assignment.refresh_from_db()
        self.assertEqual(homework.coach_id, self.old_user.pk)
        self.assertIsNone(self.assignment.end_date)

    def test_single_assignment_api_rejects_wrong_branch_coach(self):
        actor = get_user_model().objects.create_superuser(username='scope_admin', email='x@test.com', password='x')
        client = APIClient()
        client.force_authenticate(user=actor)
        branch = Sube.objects.create(kurum=self.kurum, ad='Other', kod='X')
        self.new_personel.sube = branch
        self.new_personel.save(update_fields=['sube'])
        response = client.post('/api/coaching/assignments/', {
            'student': self.ogrenci.pk, 'coach': self.new_coach.pk, 'is_primary': False,
        }, format='json', HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(CoachStudentAssignment.objects.filter(coach=self.new_coach, student=self.ogrenci).exists())

    def test_bulk_assignment_rejects_duplicate_student_ids(self):
        actor = get_user_model().objects.create_superuser(username='bulk_admin', email='x@test.com', password='x')
        client = APIClient()
        client.force_authenticate(user=actor)
        self.assignment.end_date = timezone.localdate()
        self.assignment.save(update_fields=['end_date'])
        response = client.post('/api/coaching/assignments/bulk-assign/', {
            'student_ids': [self.ogrenci.pk, self.ogrenci.pk], 'coach_id': self.new_coach.pk,
        }, format='json', HTTP_X_KURUM_ID=str(self.kurum.pk), HTTP_X_SUBE_ID=str(self.sube.pk))
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(CoachStudentAssignment.objects.filter(coach=self.new_coach, student=self.ogrenci).exists())


class ContractCoachingLifecycleTests(TestCase):
    setUp = contract_fixtures.SozlesmeErisimSyncTests.setUp

    def _assign(self):
        user = get_user_model().objects.create_user(username='contract_coach')
        person = Personel.objects.create(kurum=self.kurum, sube=self.sube, ad='Coach', soyad='Test',
                                        user=user, tc_kimlik_no='99999999999')
        coach = CoachProfile.objects.create(teacher=person, capacity=10, is_active=True, is_coach=True)
        assignment = CoachStudentAssignment.objects.create(student=self.ogrenci, coach=coach,
                            is_primary=True, start_date=timezone.localdate())
        return coach, assignment

    def _coaching_ids(self):
        return get_kocluk_ogrenci_ids(kurum_id=self.kurum.pk, sube_id=self.sube.pk, egitim_yili_id=self.ey.pk)

    def test_remove_last_service_closes_coach_and_readd_requires_explicit_assignment(self):
        coach, assignment = self._assign()
        sync_sozlesme_erisim(self.sozlesme)
        self.sozlesme.kalemler.filter(kalem_id=self.kocluk.pk).delete()
        sync_sozlesme_erisim(self.sozlesme)
        self.assertNotIn(self.ogrenci.pk, self._coaching_ids())
        assignment.refresh_from_db()
        self.assertIsNotNone(assignment.end_date)
        self.assertEqual(coach.current_student_count, 0)
        self.assertNotIn(self.ogrenci.pk, set(get_active_coach_student_ids(coach)))
        SozlesmeKalemi.objects.create(sozlesme=self.sozlesme, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=self.kocluk.pk, kalem_adi='Koçluk', brut_tutar=10, net_tutar=10, kdv_dahil_tutar=10)
        sync_sozlesme_erisim(self.sozlesme)
        assignment.refresh_from_db()
        self.assertIsNotNone(assignment.end_date)
        self.assertIn(self.ogrenci.pk, get_assignable_kocluk_ogrenci_queryset(
            kurum_id=self.kurum.pk, sube_id=self.sube.pk, egitim_yili_id=self.ey.pk).values_list('pk', flat=True))

    def test_other_contract_preserves_right_and_assignment(self):
        coach, assignment = self._assign()
        other = Sozlesme.objects.get(pk=self.sozlesme.pk)
        other.pk = None
        other.sozlesme_no = 'SECOND'
        other.save()
        SozlesmeKalemi.objects.create(sozlesme=other, kalem_turu=KalemTuru.EK_HIZMET,
            kalem_id=self.kocluk.pk, kalem_adi='Koçluk', brut_tutar=10, net_tutar=10, kdv_dahil_tutar=10)
        sync_sozlesme_erisim(other)
        self.sozlesme.kalemler.filter(kalem_id=self.kocluk.pk).delete()
        sync_sozlesme_erisim(self.sozlesme)
        assignment.refresh_from_db()
        self.assertIsNone(assignment.end_date)
        self.assertIn(self.ogrenci.pk, self._coaching_ids())
        self.assertEqual(coach.current_student_count, 1)

    def test_group_contract_uses_frozen_scope_without_unpack_error(self):
        group = GrupDersi.objects.create(kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ad='Group', kod='GR')
        self.sozlesme.kalemler.all().delete()
        SozlesmeKalemi.objects.create(sozlesme=self.sozlesme, kalem_turu=KalemTuru.GRUP_DERSI,
            kalem_id=group.pk, kalem_adi='Group', brut_tutar=10, net_tutar=10, kdv_dahil_tutar=10)
        sync_sozlesme_erisim(self.sozlesme)
        group.dahil_ek_hizmetler.add(self.kocluk)
        self.assertNotIn(self.ogrenci.pk, self._coaching_ids())
        sync_sozlesme_erisim(self.sozlesme, refresh_inclusions=True)
        self.assertIn(self.ogrenci.pk, self._coaching_ids())
        group.dahil_ek_hizmetler.remove(self.kocluk)
        self.assertIn(self.ogrenci.pk, self._coaching_ids())

    def test_dry_run_never_closes_assignment(self):
        _coach, assignment = self._assign()
        sync_sozlesme_erisim(self.sozlesme)
        self.sozlesme.kalemler.filter(kalem_id=self.kocluk.pk).delete()
        sync_sozlesme_erisim(self.sozlesme, dry_run=True)
        assignment.refresh_from_db()
        self.assertIsNone(assignment.end_date)
        self.assertTrue(OgrenciEkHizmet.objects.filter(ogrenci=self.ogrenci, ek_hizmet=self.kocluk, aktif_mi=True).exists())

    def test_adding_non_coaching_service_does_not_allow_coach_assignment(self):
        coach, assignment = self._assign()
        assignment.end_date = timezone.localdate()
        assignment.save(update_fields=['end_date'])
        self.sozlesme.kalemler.filter(kalem_id=self.kocluk.pk).delete()
        sync_sozlesme_erisim(self.sozlesme)
        with self.assertRaises(CoachChangeError) as error:
            change_primary_coach(student_id=self.ogrenci.pk, new_coach_id=coach.pk)
        self.assertEqual(error.exception.code, 'coaching_service_required')


class FirstContractCoachPreservationTests(TestCase):
    def setUp(self):
        coach_fixtures.CoachChangeServiceTest.setUp(self)
        from apps.egitim_yili.domain.models import EgitimYili
        self.year=EgitimYili.objects.create(baslangic_yil=2026,bitis_yil=2027,aktif_mi=True)
    def make_contract(self,coaching):
        from apps.finans.domain.financial_account import MaliHesap
        from apps.finans.domain.payment_method import OdemeYontemi
        from apps.finans.constants.payment_types import OdemeYontemiTipi
        account=MaliHesap.objects.create(sube=self.sube,ad='Test kasa',tip='kasa')
        method=OdemeYontemi.objects.create(kurum=self.kurum,mali_hesap=account,ad='Nakit',tip=OdemeYontemiTipi.NAKIT)
        service=EkHizmet.objects.create(kurum=self.kurum,sube=self.sube,egitim_yili=self.year,
            ad='Kocluk' if coaching else 'Kutuphane',kod='KOC' if coaching else 'KUT',
            hizmet_turu='kocluk' if coaching else 'kutuphane',brut_fiyat=1000)
        contract,error=SozlesmeService().create({
            'ogrenci_id':self.ogrenci.pk,'egitim_yili_id':self.year.pk,'kurum_id':self.kurum.pk,
            'sube_id':self.sube.pk,'baslangic_tarihi':timezone.localdate(),
            'bitis_tarihi':timezone.localdate()+timedelta(days=300),'brut_tutar':1000,
            'paket_turu':'ek_hizmet','odeme_turu':'pesin','odeme_yontemi_id':method.pk,'mali_hesap_id':account.pk,
            'kalemler':[{'kalem_turu':'ek_hizmet','kalem_id':service.pk,'kalem_adi':service.ad,'brut_tutar':1000,'kdv_orani':0}],
        })
        self.assertIsNone(error,error)
        return contract
    def test_first_draft_contract_preserves_coach(self):
        self.make_contract(False)
        self.assertIn(self.ogrenci.pk,set(get_active_coach_student_ids(self.old_coach)))
        self.assignment.refresh_from_db();self.assertIsNone(self.assignment.end_date)
    def test_first_active_coaching_contract_preserves_coach(self):
        contract=self.make_contract(True)
        _,error=SozlesmeService().change_status(contract.pk,SozlesmeDurum.AKTIF)
        self.assertIsNone(error,error)
        self.assertIn(self.ogrenci.pk,set(get_active_coach_student_ids(self.old_coach)))
        self.assignment.refresh_from_db();self.assertIsNone(self.assignment.end_date)
    def test_first_active_noncoaching_contract_preserves_existing_manual_coach(self):
        contract=self.make_contract(False)
        _,error=SozlesmeService().change_status(contract.pk,SozlesmeDurum.AKTIF)
        self.assertIsNone(error,error)
        self.assignment.refresh_from_db();self.assertIsNone(self.assignment.end_date)
        self.assertIn(self.ogrenci.pk,set(get_active_coach_student_ids(self.old_coach)))

    def test_first_activation_preserves_coach_even_with_registration_service_rows(self):
        service = EkHizmet.objects.create(kurum=self.kurum, sube=self.sube, egitim_yili=self.year,
            ad='Ön kayıt koçluk', kod='ONKOC', hizmet_turu='kocluk', brut_fiyat=1000)
        OgrenciEkHizmet.objects.create(ogrenci=self.ogrenci, ek_hizmet=service,
            egitim_yili=self.year, aktif_mi=True, kaynak_paket_turu='sozlesme')
        contract = self.make_contract(False)
        _, error = SozlesmeService().change_status(contract.pk, SozlesmeDurum.AKTIF)
        self.assertIsNone(error, error)
        self.assignment.refresh_from_db()
        self.assertIsNone(self.assignment.end_date)
        self.assertIn(self.ogrenci.pk, set(get_active_coach_student_ids(self.old_coach)))
