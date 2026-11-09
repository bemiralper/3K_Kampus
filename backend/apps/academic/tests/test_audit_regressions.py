"""Regression cases for the academic operations audit of November 2026."""
from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, SimpleTestCase
from django.utils import timezone

from apps.academic.tests import test_lesson_operations as fixtures
from apps.academic.domain.lesson_session import LessonSession
from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.academic.services import lesson_session_service as ops
from apps.personel.domain.sozlesme_models import PersonelSozlesme, AylikHakedis, MaasPlaniSatiri, AvansKaydi, DersUcretTanim
from apps.personel.infrastructure.sozlesme_repository import HakedisRepository
from apps.personel.tests.test_sube_isolation import _assign_personel_manage
from apps.sube.domain.models import Sube
from apps.ozel_ders.domain.models import BirebirDersOturumu, BirebirHakedis
from apps.ozel_ders.services.bordro_bridge import apply_approved_to_bordro
from apps.ozel_ders.tests.test_ucret_engine import _fake_oturum, _fake_sozlesme
from apps.ozel_ders.services.ucret_engine import evaluate


class AcademicAuditRegressionTests(TestCase):
    setUp = fixtures.LessonOperationsApiTest.setUp

    def contract(self, **overrides):
        data = dict(kurum=self.kurum, sube=self.sube, personel=self.teacher,
                    egitim_yili=self.year, durum='AKTIF',
                    baslangic_tarihi=date(2025,9,1), bitis_tarihi=date(2026,8,31),
                    brut_maas=Decimal('1000'), ders_birim_ucret=Decimal('300'))
        data.update(overrides)
        return PersonelSozlesme.objects.create(**data)

    def session(self, **overrides):
        data = dict(egitim_yili=self.year, term=self.term, timeslot=self.slot,
                    sinif=self.sinif, ders=self.ders, ogretmen=self.teacher,
                    session_date=self.monday, start_time=time(8), end_time=time(8,40),
                    status='COMPLETED', teacher_attendance='PRESENT')
        data.update(overrides)
        return LessonSession.objects.create(**data)

    def approved_individual(self):
        s = BirebirDersOturumu.objects.create(kurum=self.kurum, sube=self.sube,
            egitim_yili=self.year, ogrenci=self.ogrenci, ders=self.ders,
            ogretmen=self.teacher, session_date=self.monday,
            start_time=time(18), end_time=time(19), durum='ISLENDI')
        return BirebirHakedis.objects.create(oturum=s, ogretmen=self.teacher,
            ders=self.ders, tarih=self.monday, sure_dk=60,
            birim_ucret=Decimal('300'), tutar=Decimal('300'), durum='ONAYLANDI')

    def bridge(self):
        return apply_approved_to_bordro(kurum_id=self.kurum.pk, sube_id=self.sube.pk, yil=2025, ay=9)

    def test_bulk_creation_preserves_paid_payroll(self):
        s = self.contract()
        p = AylikHakedis.objects.create(sozlesme=s, yil=2025, ay=9,
            sabit_maas=Decimal('700'), net_hakedis=Decimal('700'),
            brut_toplam=Decimal('700'), durum='ODENDI', odeme_tarihi=date(2025,9,30))
        HakedisRepository().bulk_create_for_month(self.kurum.pk,self.year.pk,2025,9,sube_id=self.sube.pk)
        p.refresh_from_db()
        self.assertEqual(p.net_hakedis, Decimal('700'))

    def test_bulk_creation_rejects_month_outside_contract(self):
        self.contract()
        HakedisRepository().bulk_create_for_month(self.kurum.pk,self.year.pk,2024,1,sube_id=self.sube.pk)
        self.assertFalse(AylikHakedis.objects.exists())

    def test_bridge_rejects_other_branch_contract(self):
        other = Sube.objects.create(kurum=self.kurum, ad='Other', kod='OTHER')
        self.contract(sube=other)
        self.approved_individual()
        from apps.ozel_ders.services.errors import OzelDersError
        with self.assertRaises(OzelDersError):
            self.bridge()

    def test_bridge_rejects_expired_contract(self):
        self.contract(baslangic_tarihi=date(2024,1,1), bitis_tarihi=date(2024,12,31))
        self.approved_individual()
        from apps.ozel_ders.services.errors import OzelDersError
        with self.assertRaises(OzelDersError):
            self.bridge()

    def test_bridge_uses_salary_plan(self):
        s = self.contract()
        MaasPlaniSatiri.objects.create(sozlesme=s,sira_no=1,
            baslangic_tarihi=date(2025,9,1),bitis_tarihi=date(2025,9,30),maas=Decimal('700'))
        self.approved_individual()
        self.bridge()
        self.assertEqual(AylikHakedis.objects.get().sabit_maas, Decimal('700'))

    def test_bridge_deducts_recorded_advance(self):
        s = self.contract()
        AvansKaydi.objects.create(sozlesme=s,tutar=Decimal('100'),
            tarih=date(2025,9,1),mahsup_yil=2025,mahsup_ay=9)
        self.approved_individual()
        self.bridge()
        self.assertEqual(AylikHakedis.objects.get().avans, Decimal('100'))

    def test_payroll_create_denies_foreign_branch_contract(self):
        other = Sube.objects.create(kurum=self.kurum, ad='Other', kod='OTHER')
        s = self.contract(sube=other)
        u = get_user_model().objects.create_user(username='auditmanager', password='test')
        _assign_personel_manage(u,self.kurum)
        self.client.force_login(u)
        response = self.client.post('/personel/api/sozlesmeler/hakedis/',
            data={'sozlesme_id':s.pk,'yil':2025,'ay':9,'sabit_maas':'700'},
            content_type='application/json', **self.headers)
        self.assertIn(response.status_code, [403,404])

    def test_contract_detail_denies_other_branch(self):
        other=Sube.objects.create(kurum=self.kurum,ad='Other',kod='OTHER')
        s=self.contract(sube=other)
        u=get_user_model().objects.create_user(username='auditmanager',password='test')
        _assign_personel_manage(u,self.kurum)
        self.client.force_login(u)
        response=self.client.get(f'/personel/api/sozlesmeler/{s.pk}/',**self.headers)
        self.assertIn(response.status_code,[403,404])

    def test_contract_write_and_print_deny_other_branch(self):
        other=Sube.objects.create(kurum=self.kurum,ad='Other',kod='OTHER')
        s=self.contract(sube=other)
        for method, suffix, body in [('put','',{'brut_maas':'1'}),
                                     ('delete','',{}), ('post','durum/',{'durum':'PASIF'}),
                                     ('put','taslak/',{}), ('post','print-token/',{})]:
            response=getattr(self.client,method)(f'/personel/api/sozlesmeler/{s.pk}/{suffix}',
                data=body,content_type='application/json',**self.headers)
            self.assertEqual(response.status_code,403)
        s.refresh_from_db()
        self.assertEqual(s.brut_maas,Decimal('1000'))

    def test_contract_cannot_move_to_other_branch(self):
        s=self.contract()
        other=Sube.objects.create(kurum=self.kurum,ad='Other',kod='OTHER')
        response=self.client.put(f'/personel/api/sozlesmeler/{s.pk}/',
            data={'sube_id':other.pk},content_type='application/json',**self.headers)
        self.assertEqual(response.status_code,403)
        s.refresh_from_db()
        self.assertEqual(s.sube_id,self.sube.pk)

    def test_payroll_create_accepts_valid_csrf(self):
        from django.conf import settings
        from django.middleware.csrf import _get_new_csrf_string
        from django.test import Client
        s=self.contract()
        client=Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        token=_get_new_csrf_string()
        client.cookies[settings.CSRF_COOKIE_NAME]=token
        response=client.post('/personel/api/sozlesmeler/hakedis/',
            data={'sozlesme_id':s.pk,'yil':2025,'ay':9},content_type='application/json',
            HTTP_X_CSRFTOKEN=token,**self.headers)
        self.assertEqual(response.status_code,201,response.content.decode())

    def test_payroll_create_requires_csrf(self):
        from django.test import Client
        s=self.contract()
        client=Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        response=client.post('/personel/api/sozlesmeler/hakedis/',
            data={'sozlesme_id':s.pk,'yil':2025,'ay':9},content_type='application/json',
            **self.headers)
        self.assertEqual(response.status_code,403)

    def test_completed_absent_teacher_is_not_paid(self):
        self.session(teacher_attendance='ABSENT')
        result=ops.pay_summary(term_id=self.term.pk,date_from=self.monday,date_to=self.monday,sube_id=self.sube.pk)
        self.assertEqual(result['totals']['session_count'],0)

    def test_per_lesson_rate_is_not_prorated_as_hourly(self):
        s=self.contract(ders_birim_ucret=Decimal('0'), ders_ucret_tipi='DERS_BASI')
        DersUcretTanim.objects.create(sozlesme=s,birim_ucret=Decimal('300'),ucret_tipi='DERS_BASI')
        self.session()
        result=ops.pay_summary(term_id=self.term.pk,date_from=self.monday,date_to=self.monday,sube_id=self.sube.pk)
        self.assertEqual(Decimal(str(result['teachers'][0]['estimated_amount'])),Decimal('300'))

    def test_future_class_cannot_be_completed(self):
        s=self.session(status='SCHEDULED',teacher_attendance='PENDING',session_date=timezone.localdate()+timedelta(days=10))
        with self.assertRaises(ops.LessonSessionError):
            ops.transition_session(session_id=s.pk,action='complete')

    def test_roster_respects_placement_start_date(self):
        StudentClassPlacement.objects.filter(student=self.ogrenci).update(start_date=self.monday+timedelta(days=7))
        s=self.session()
        self.assertEqual(ops._session_roster_student_ids(s),set())

    def test_completed_attendance_absent_removes_from_pay(self):
        s=self.session()
        ops.set_teacher_attendance(session_id=s.pk,status='ABSENT')
        result=ops.pay_summary(term_id=self.term.pk,date_from=self.monday,date_to=self.monday,sube_id=self.sube.pk)
        self.assertEqual(result['totals']['session_count'],0)

    def test_summary_reads_main_contract_rate(self):
        self.contract(ders_birim_ucret=Decimal('300'))
        self.session()
        result=ops.pay_summary(term_id=self.term.pk,date_from=self.monday,date_to=self.monday,sube_id=self.sube.pk)
        self.assertEqual(result['teachers'][0]['unit_rate'],300)

    def test_summary_uses_valid_contract_not_latest_inactive(self):
        s=self.contract(ders_birim_ucret=Decimal('0'))
        DersUcretTanim.objects.create(sozlesme=s,birim_ucret=Decimal('300'))
        other=Sube.objects.create(kurum=self.kurum,ad='Other',kod='OTHER')
        inactive=self.contract(sube=other,durum='PASIF',ders_birim_ucret=Decimal('0'))
        DersUcretTanim.objects.create(sozlesme=inactive,birim_ucret=Decimal('900'))
        self.session()
        result=ops.pay_summary(term_id=self.term.pk,date_from=self.monday,date_to=self.monday,sube_id=self.sube.pk)
        self.assertEqual(result['teachers'][0]['unit_rate'],300)

    def test_hourly_summary_rounds_money_after_minutes(self):
        s=self.contract(ders_birim_ucret=Decimal('0'))
        DersUcretTanim.objects.create(sozlesme=s,birim_ucret=Decimal('300'),ucret_tipi='SAAT_BASI')
        self.session()
        result=ops.pay_summary(term_id=self.term.pk,date_from=self.monday,date_to=self.monday,sube_id=self.sube.pk)
        self.assertEqual(result['teachers'][0]['estimated_amount'],200)

    def test_materialize_rejects_date_outside_term(self):
        with self.assertRaises(ops.LessonSessionError):
            ops.materialize_sessions_for_date(term_id=self.term.pk,
                session_date=date(2026,3,2),version_id=self.version.pk,sube_id=self.sube.pk)

    def test_manual_teacher_conflict_across_calendars(self):
        from apps.academic.domain.timeslot import TimeSlot
        from apps.academic.domain.program_grid_cell import ProgramGridCell
        from apps.academic.domain.schedule_template import ScheduleTemplate
        from apps.academic.domain.schedule_version import ScheduleVersion
        from apps.academic.domain.weekly_cycle import WeeklyCycle
        from apps.academic.domain.weekly_day import WeeklyDay
        from apps.academic.services.manual_placement_service import _check_teacher_conflict,ManualPlacementError
        template=ScheduleTemplate.objects.create(kurum=self.kurum,sube=self.sube,name='Second')
        cycle=WeeklyCycle.objects.create(kurum=self.kurum,sube=self.sube,schedule_template=template,name='Second')
        day=WeeklyDay.objects.create(weekly_cycle=cycle,day_of_week=0,name='Monday',order=1)
        version=ScheduleVersion.objects.create(egitim_yili=self.year,term=self.term,
            schedule_template=template,weekly_cycle=cycle,name='Second',is_active=True)
        slot=TimeSlot.objects.create(schedule_template=template,name='Overlap',
            start_time=time(8,20),end_time=time(9),order=2)
        target=ProgramGridCell.objects.create(schedule_template=template,
            weekly_cycle=cycle,schedule_version=version,
            weekly_day=day,timeslot=slot,sinif=self.sinif,is_active=True)
        with self.assertRaises(ManualPlacementError):
            _check_teacher_conflict(target,self.teacher)


class WageAuditTests(SimpleTestCase):
    @patch('apps.ozel_ders.services.ucret_engine._resolve_rule',return_value=None)
    @patch('apps.ozel_ders.services.ucret_engine._get_active_contract')
    def test_lesson_before_work_start_is_outside_work(self, contract, _rule):
        contract.return_value=_fake_sozlesme(turu='TAM_ZAMANLI',mesai_bitis=time(18))
        result=evaluate(_fake_oturum(start_time=time(7),end_time=time(8)))
        self.assertTrue(result.payable)
