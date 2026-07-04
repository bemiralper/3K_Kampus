"""
MessageTemplate CRUD ve koç erişim testleri.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.template_service import TemplateService
from apps.communication.application.variable_resolver import build_recipient_context, resolve_variables
from apps.communication.domain.enums import TemplateCategory
from apps.communication.domain.models import MessageTemplate
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_role(user, role_code: str, perm_codes: list[str]):
    role, _ = Role.objects.get_or_create(
        code=role_code,
        defaults={'name': role_code, 'level': 10, 'is_system_role': True},
    )
    for code in perm_codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class TemplateServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Tpl Kurum', kod='TPL')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TPL-M')
        self.admin = User.objects.create_user(username='tpl_admin', password='x')
        _assign_role(self.admin, 'tpl_admin', ['communication.bulk', 'communication.read'])

    def test_create_and_list(self):
        service = TemplateService()
        tpl = service.create(
            self.kurum.id,
            sube_id=self.sube.id,
            user=self.admin,
            name='Duyuru',
            body='Merhaba {{veli_ad}}',
            category=TemplateCategory.DUYURU,
        )
        self.assertEqual(tpl.name, 'Duyuru')
        listed = service.list_templates(
            self.kurum.id, sube_id=self.sube.id, category=TemplateCategory.DUYURU,
        )
        self.assertEqual(listed.count(), 1)

    def test_coach_can_create_coach_scope_template(self):
        from apps.coaching.models import CoachProfile
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube
        from apps.communication.domain.enums import TemplateAudienceScope

        coach = User.objects.create_user(username='tpl_coach', password='x')
        sube = Sube.objects.create(kurum=self.kurum, ad='S', kod='TS')
        personel = Personel.objects.create(
            kurum=self.kurum, sube=sube, ad='K', soyad='C',
            tc_kimlik_no='33333333333', user=coach,
        )
        CoachProfile.objects.create(teacher=personel, capacity=10, is_active=True, is_coach=True)
        _assign_role(coach, 'tpl_coach', ['communication.bulk', 'communication.read'])
        service = TemplateService()
        tpl = service.create(
            self.kurum.id,
            sube_id=sube.id,
            user=coach,
            name='Koç Karşılama',
            body='Merhaba {{veli_ad}}',
            audience_scope=TemplateAudienceScope.COACH,
        )
        self.assertEqual(tpl.audience_scope, TemplateAudienceScope.COACH)

    def test_coach_cannot_create_admin_scope(self):
        from apps.coaching.models import CoachProfile
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube
        from apps.communication.domain.enums import TemplateAudienceScope

        coach = User.objects.create_user(username='tpl_coach2', password='x')
        sube = Sube.objects.create(kurum=self.kurum, ad='S2', kod='TS2')
        personel = Personel.objects.create(
            kurum=self.kurum, sube=sube, ad='K', soyad='C',
            tc_kimlik_no='33333333334', user=coach,
        )
        CoachProfile.objects.create(teacher=personel, capacity=10, is_active=True, is_coach=True)
        _assign_role(coach, 'tpl_coach2', ['communication.bulk', 'communication.read'])
        service = TemplateService()
        from django.core.exceptions import PermissionDenied

        with self.assertRaises(PermissionDenied):
            service.create(
                self.kurum.id,
                sube_id=sube.id,
                user=coach,
                name='Admin Şablon',
                body='test',
                audience_scope=TemplateAudienceScope.ADMIN,
            )


class TemplateAPITest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Tpl API', kod='TAPI')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TAPI-M')
        self.admin = User.objects.create_user(username='tpl_api_admin', password='x')
        _assign_role(self.admin, 'tpl_api_admin', ['communication.bulk', 'communication.read'])
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_template_crud_api(self):
        res = self.client.post(
            '/api/communication/templates/',
            {'kurum_id': self.kurum.id, 'name': 'Test', 'body': 'Hello', 'category': 'duyuru'},
            format='json',
        )
        self.assertEqual(res.status_code, 201)
        tpl_id = res.data['id']

        res = self.client.get(f'/api/communication/templates/?kurum_id={self.kurum.id}')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['total'], 1)

        res = self.client.get(f'/api/communication/templates/{tpl_id}/stats/?kurum_id={self.kurum.id}')
        self.assertEqual(res.status_code, 200)
        self.assertIn('stats_sent', res.data)

    def test_coach_create_coach_scope_api(self):
        from apps.coaching.models import CoachProfile
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube

        coach = User.objects.create_user(username='tpl_api_coach', password='x')
        sube = Sube.objects.create(kurum=self.kurum, ad='S', kod='TAS')
        personel = Personel.objects.create(
            kurum=self.kurum, sube=sube, ad='K', soyad='C',
            tc_kimlik_no='44444444444', user=coach,
        )
        CoachProfile.objects.create(teacher=personel, capacity=10, is_active=True, is_coach=True)
        _assign_role(coach, 'tpl_api_coach', ['communication.bulk', 'communication.read'])
        self.client.force_authenticate(user=coach)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(sube.id)
        res = self.client.post(
            '/api/communication/templates/',
            {
                'kurum_id': self.kurum.id,
                'name': 'Koç Yanıt',
                'body': 'Merhaba',
                'audience_scope': 'coach',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['audience_scope'], 'coach')

    def test_coach_create_admin_scope_forbidden(self):
        from apps.coaching.models import CoachProfile
        from apps.personel.domain.models import Personel
        from apps.sube.domain.models import Sube

        coach = User.objects.create_user(username='tpl_api_coach2', password='x')
        sube = Sube.objects.create(kurum=self.kurum, ad='S', kod='TAS2')
        personel = Personel.objects.create(
            kurum=self.kurum, sube=sube, ad='K', soyad='C',
            tc_kimlik_no='44444444445', user=coach,
        )
        CoachProfile.objects.create(teacher=personel, capacity=10, is_active=True, is_coach=True)
        _assign_role(coach, 'tpl_api_coach2', ['communication.bulk', 'communication.read'])
        self.client.force_authenticate(user=coach)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(sube.id)
        res = self.client.post(
            '/api/communication/templates/',
            {'kurum_id': self.kurum.id, 'name': 'X', 'body': 'Y', 'audience_scope': 'admin'},
            format='json',
        )
        self.assertEqual(res.status_code, 403)


class VariableResolverTest(TestCase):
    def test_resolve_variables(self):
        ctx = build_recipient_context(display_name='Ayşe Hanım', recipient_type='VELI')
        ctx['veli_ad'] = 'Ayşe Hanım'
        result = resolve_variables('Sayın {{veli_ad}}, duyuru.', ctx)
        self.assertEqual(result, 'Sayın Ayşe Hanım, duyuru.')

    def test_veli_and_ogrenci_names_are_distinct(self):
        class _Veli:
            tam_ad = 'Ayşe Hanım'

        class _Ogrenci:
            ad = 'Mehmet'
            soyad = 'Yılmaz'

        ctx = build_recipient_context(
            display_name='Ayşe Hanım',
            recipient_type='VELI',
            veli=_Veli(),
            ogrenci=_Ogrenci(),
        )
        result = resolve_variables('Veli: {{veli_ad}}, Öğrenci: {{ogrenci_ad}}', ctx)
        self.assertEqual(result, 'Veli: Ayşe Hanım, Öğrenci: Mehmet Yılmaz')

    def test_unknown_variable_preserved(self):
        result = resolve_variables('{{bilinmeyen}}', {})
        self.assertEqual(result, '{{bilinmeyen}}')
