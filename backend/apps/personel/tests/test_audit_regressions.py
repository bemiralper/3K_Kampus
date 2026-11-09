"""Personel denetiminin kalıcı regresyon senaryoları."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.personel.tests import test_sube_isolation as fixtures
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.personel.domain.sozlesme_models import PersonelSozlesme, AylikHakedis, AvansKaydi
from apps.personel.application.services import PersonelService
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.finans.domain.gider_kaydi import GiderKaydi
from apps.finans.domain.gider_kategorisi import GiderKategorisi


class PersonnelAudit(TestCase):
    def setUp(self):
        fixtures.PersonelSubeIsolationAPITest.setUp(self)
        fixtures._assign_personel_manage(self.user,self.kurum)
        finance,_=Permission.objects.get_or_create(code='finans.write',defaults=dict(name='Finance write',module='finans',permission_type='write'))
        RolePermission.objects.get_or_create(role=UserRole.objects.get(user=self.user).role,permission=finance)
        self.headers={'HTTP_X_KURUM_ID':str(self.kurum.pk),'HTTP_X_SUBE_ID':str(self.sube_a.pk),
                      'HTTP_X_EGITIMYILI_ID':str(self.yil.pk)}
        self.client.raise_request_exception=False

    def contract(self,**kwargs):
        data=dict(kurum=self.kurum,sube=self.sube_a,personel=self.personel_home_a,egitim_yili=self.yil,
                  durum='AKTIF',baslangic_tarihi=date(2025,9,1),bitis_tarihi=date(2026,8,31))
        data.update(kwargs)
        return PersonelSozlesme.objects.create(**data)

    def payroll(self,**kwargs):
        data=dict(sozlesme=self.contract(),yil=2025,ay=9,sabit_maas=Decimal('1000'),
                  durum='ODENDI',odeme_tarihi=date(2025,9,30))
        data.update(kwargs)
        p=AylikHakedis(**data)
        p.hesapla();p.save()
        return p

    def assignment_post(self,**kwargs):
        data=dict(personel_id=self.personel_home_a.pk,egitim_yili_id=self.yil.pk,
                  gorev_sube_id=self.sube_a.pk,rol_id=None)
        data.update(kwargs)
        return self.client.post('/personel/api/gorevlendirme/create/',data=data,
            content_type='application/json',**self.headers)

    def test_manager_cannot_grant_self_system_admin(self):
        self.personel_home_a.user=self.user;self.personel_home_a.save()
        admin=Role.objects.create(code='audit_admin',name='Audit Admin',level=999)
        perm,_=Permission.objects.get_or_create(code='sistem.admin',defaults=dict(name='System Admin',module='sistem',permission_type='manage'))
        RolePermission.objects.create(role=admin,permission=perm)
        r=self.client.post(f'/personel/api/{self.personel_home_a.pk}/sync-user-role/',
            data={'role_code':admin.code},content_type='application/json',**self.headers)
        self.assertNotEqual(UserRole.objects.get(user=self.user).role_id,admin.pk)
        self.assertEqual(r.status_code,403)

    def test_manager_cannot_reset_superuser_password(self):
        admin=get_user_model().objects.create_superuser(username='protected-admin',password='strong-synthetic')
        self.personel_home_a.user=admin;self.personel_home_a.save()
        response=self.client.post(f'/personel/api/{self.personel_home_a.pk}/reset-password/',data={},content_type='application/json',**self.headers)
        self.assertEqual(response.status_code,403)
        admin.refresh_from_db()
        self.assertTrue(admin.check_password('strong-synthetic'))

    def test_role_sync_preserves_forced_password_change(self):
        self.personel_home_a.user=self.user;self.personel_home_a.save()
        link=UserRole.objects.get(user=self.user)
        link.must_change_password=True;link.save()
        response=self.client.post(f'/personel/api/{self.personel_home_a.pk}/sync-user-role/',
            data={'role_code':link.role.code},content_type='application/json',**self.headers)
        self.assertEqual(response.status_code,200)
        link.refresh_from_db()
        self.assertTrue(link.must_change_password)

    def test_finance_categories_use_branch_scope(self):
        GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_b,ad='Other')
        own=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Own')
        response=self.client.get('/personel/api/sozlesmeler/finans/gider-kategorileri/',**self.headers)
        self.assertEqual(response.status_code,200)
        self.assertEqual([r['id'] for r in response.json()['data']],[own.pk])

    def test_export_rejects_mismatched_payment_account(self):
        from apps.finans.domain.financial_account import MaliHesap
        from apps.finans.domain.payment_method import OdemeYontemi
        self.payroll()
        category=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Salary')
        other=MaliHesap.objects.create(sube=self.sube_b,ad='Other')
        method=OdemeYontemi.objects.create(kurum=self.kurum,mali_hesap=other,ad='Other')
        response=self.client.post('/personel/api/sozlesmeler/finans/gider-kaydet/',data={
            'yil':2025,'ay':9,'gider_kategorisi_id':category.pk,'odeme_yontemi_id':method.pk,
        },content_type='application/json',**self.headers)
        self.assertEqual(response.status_code,400)
        self.assertFalse(GiderKaydi.objects.exists())

    def test_create_with_login_assigns_role(self):
        person=PersonelService().create(dict(kurum_id=self.kurum.pk,sube_id=self.sube_a.pk,
            ad='Synthetic',soyad='New User',email='newuser@example.test',tc_kimlik_no='10000000146'),create_user_account=True)
        self.assertTrue(UserRole.objects.filter(user=person.user).exists())

    def test_create_login_does_not_use_identity_number_as_password(self):
        person=PersonelService().create(dict(kurum_id=self.kurum.pk,sube_id=self.sube_a.pk,
            ad='Synthetic',soyad='New User',email='newuser@example.test',tc_kimlik_no='10000000146'),create_user_account=True)
        self.assertFalse(person.user.check_password(person.tc_kimlik_no))

    def test_profile_write_requires_csrf(self):
        c=Client(enforce_csrf_checks=True);c.force_login(self.user)
        r=c.put(f'/personel/api/{self.personel_home_a.pk}/update/',data={'ad':'Changed'},
                content_type='application/json',**self.headers)
        self.assertEqual(r.status_code,403)

    def test_assignment_update_rejects_foreign_institution_person(self):
        foreign=Kurum.objects.create(ad='Foreign',kod='FOREIGN')
        branch=Sube.objects.create(kurum=foreign,ad='Foreign',kod='FOREIGN')
        person=Personel.objects.create(kurum=foreign,sube=branch,ad='Synthetic',soyad='Foreign')
        assignment=PersonelGorevlendirme.objects.filter(personel=self.personel_home_a).first()
        r=self.client.put(f'/personel/api/gorevlendirme/{assignment.pk}/',
            data={'personel_id':person.pk},content_type='application/json',**self.headers)
        self.assertIn(r.status_code,[400,403,404])

    def test_assignment_create_rejects_inverted_dates(self):
        r=self.assignment_post(gorev_baslangic='2026-06-01',gorev_bitis='2025-09-01')
        self.assertEqual(r.status_code,400)

    def test_assignment_create_invalid_date_is_client_error(self):
        r=self.assignment_post(gorev_baslangic='not-a-date')
        self.assertEqual(r.status_code,400)

    def test_invalid_assignment_role_is_client_error(self):
        r=self.assignment_post(rol_id='not-a-role-id')
        self.assertEqual(r.status_code,400)

    def test_shared_email_does_not_merge_different_people_accounts(self):
        from apps.personel.domain.user_account import resolve_personel_user
        u=get_user_model().objects.create_user(username='owner',password='synthetic')
        self.personel_home_a.email='shared@example.test'
        self.personel_home_a.user=u;self.personel_home_a.save()
        other=Personel.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Different',soyad='Person',email='shared@example.test')
        self.assertIsNone(resolve_personel_user(other))

    def test_payroll_rejects_month_thirteen(self):
        s=self.contract()
        r=self.client.post('/personel/api/sozlesmeler/hakedis/',
            data={'sozlesme_id':s.pk,'yil':2025,'ay':13},content_type='application/json',**self.headers)
        self.assertEqual(r.status_code,400)

    def test_payroll_half_cent_uses_money_rounding(self):
        row=AylikHakedis(ders_basi_ucret=Decimal('10.05'),toplam_ders_saati=Decimal('0.1'))
        row.hesapla()
        self.assertEqual(row.ders_ucreti_toplam,Decimal('1.01'))
        self.assertEqual(row.net_hakedis,Decimal('1.01'))

    def test_paid_payroll_advance_cannot_be_deleted(self):
        p=self.payroll(avans=Decimal('100'))
        a=AvansKaydi.objects.create(sozlesme=p.sozlesme,tutar=Decimal('100'),tarih=date(2025,9,1),mahsup_yil=2025,mahsup_ay=9)
        r=self.client.delete(f'/personel/api/sozlesmeler/avans/{a.pk}/',**self.headers)
        self.assertEqual(r.status_code,400)

    def test_paid_payroll_advance_cannot_be_changed(self):
        p=self.payroll(avans=Decimal('100'))
        a=AvansKaydi.objects.create(sozlesme=p.sozlesme,tutar=Decimal('100'),tarih=date(2025,9,1),mahsup_yil=2025,mahsup_ay=9)
        r=self.client.put(f'/personel/api/sozlesmeler/avans/{a.pk}/',data={'tutar':'200'},content_type='application/json',**self.headers)
        self.assertEqual(r.status_code,400)

    def test_contract_delete_preserves_paid_payroll(self):
        p=self.payroll()
        r=self.client.delete(f'/personel/api/sozlesmeler/{p.sozlesme_id}/',**self.headers)
        self.assertEqual(r.status_code,400)

    def test_payment_history_scoped_to_selected_branch(self):
        self.payroll(sozlesme=self.contract(sube=self.sube_b))
        r=self.client.get(f'/personel/api/sozlesmeler/personel/{self.personel_home_a.pk}/odeme-gecmisi/',**self.headers)
        self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['data']['hakedisler'],[])

    def test_saving_active_profile_does_not_reenable_admin_disabled_user(self):
        u=get_user_model().objects.create_user(username='disabled',password='synthetic')
        self.personel_home_a.user=u;self.personel_home_a.save()
        get_user_model().objects.filter(pk=u.pk).update(is_active=False)
        PersonelService().update(self.personel_home_a.pk,{'adres':'Updated address'})
        u.refresh_from_db()
        self.assertFalse(u.is_active)

    def test_active_contract_autosave_preserves_status(self):
        s=self.contract()
        r=self.client.put(f'/personel/api/sozlesmeler/{s.pk}/taslak/',
                         data={'notlar':'Autosaved edit'},content_type='application/json',**self.headers)
        self.assertEqual(r.status_code,200)
        s.refresh_from_db()
        self.assertEqual(s.durum,'AKTIF')

    def finance_export(self,category):
        return self.client.post('/personel/api/sozlesmeler/finans/gider-kaydet/',
            data={'yil':2025,'ay':9,'gider_kategorisi_id':category.pk},content_type='application/json',**self.headers)

    def test_salary_export_endpoint_is_available(self):
        self.payroll()
        category=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Salary')
        response=self.client.post('/personel/api/sozlesmeler/finans/gider-kaydet/',
            data={'yil':2025,'ay':9,'gider_kategorisi_id':category.pk},content_type='application/json',**self.headers)
        self.assertEqual(response.status_code,200,response.content.decode())
        self.assertIsInstance(response.json()['data']['toplam'],(int,float))

    def test_salary_expense_rejects_other_branch_category(self):
        self.payroll()
        category=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_b,ad='Other category')
        r=self.finance_export(category)
        self.assertIn(r.status_code,[400,403,404])

    def test_salary_expense_is_idempotent(self):
        self.payroll()
        category=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Salary')
        response=self.finance_export(category)
        self.assertEqual(response.status_code,200,response.content.decode()[:1500])
        self.finance_export(category)
        self.assertEqual(GiderKaydi.objects.count(),1)

    def test_salary_expense_keeps_branch_and_year(self):
        self.payroll()
        category=GiderKategorisi.objects.create(kurum=self.kurum,sube=self.sube_a,ad='Salary')
        response=self.finance_export(category)
        self.assertEqual(response.status_code,200,response.content.decode()[:1500])
        expense=GiderKaydi.objects.get()
        self.assertEqual((expense.sube_id,expense.egitim_yili_id),(self.sube_a.pk,self.yil.pk))

    def test_profile_patch_rejects_blank_name(self):
        r=self.client.patch(f'/personel/api/{self.personel_home_a.pk}/update/',
            data={'ad':''},content_type='application/json',**self.headers)
        self.assertEqual(r.status_code,400)

    def test_selective_personnel_backup_includes_contracts(self):
        from apps.personel.backup_resources import RESOURCES
        from apps.yedekleme.engine.handlers.database_table import _resolve_tables
        resource=next(r for r in RESOURCES if r.code=='personel.kayitlar')
        self.assertIn(PersonelSozlesme._meta.db_table,_resolve_tables(resource.config))
