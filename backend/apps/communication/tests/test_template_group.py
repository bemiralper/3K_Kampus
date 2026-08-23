"""Yerel şablon grubu — olaydan türetme, kayıt ve liste filtresi."""
from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.communication.application.meta_template_service import MetaTemplateService
from apps.communication.application.notification_events import (
    get_event,
    list_template_groups,
    template_group_for_event,
    template_group_for_event_key,
    template_group_label,
)
from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.application.template_pairing_service import TemplatePairingService
from apps.communication.application.template_service import TemplateService
from apps.communication.domain.enums import Channel, RecipientType, TemplateAudienceScope
from apps.communication.domain.models import CommunicationChannelConfig, WhatsAppMetaTemplate
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_manage(user):
    role, _ = Role.objects.get_or_create(
        code='group_admin',
        defaults={'name': 'Group Admin', 'level': 100, 'is_system_role': True},
    )
    for code in ('communication.manage', 'communication.read', 'communication.bulk'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class TemplateGroupHelperTest(TestCase):
    def test_yoklama_uses_module_and_subgroup(self):
        event = get_event('yoklama.gelmedi')
        self.assertEqual(template_group_for_event(event), 'yoklama:kutuphane')
        self.assertEqual(template_group_label('yoklama:kutuphane'), 'Yoklama — Kütüphane')
        self.assertEqual(template_group_for_event_key('sinif.yoklama.gelmedi'), 'yoklama:sinif')

    def test_ozel_ders_events_share_one_group(self):
        self.assertEqual(template_group_for_event_key('ozel_ders.iptal'), 'ozel_ders')
        self.assertEqual(template_group_for_event_key('ozel_ders.islendi'), 'ozel_ders')
        self.assertEqual(template_group_label('ozel_ders'), 'Özel Ders')

    def test_empty_is_genel(self):
        self.assertEqual(template_group_for_event(None), '')
        self.assertEqual(template_group_label(''), 'Genel')

    def test_list_excludes_hidden_legacy(self):
        keys = [item['key'] for item in list_template_groups()]
        self.assertNotIn('devamsizlik', keys)
        self.assertIn('odev', keys)


class TemplateGroupPersistenceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Grup Kurum', kod='GRPK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_user(username='groupadmin', password='x')
        _assign_manage(self.user)
        TemplateCategoryService().ensure_defaults(self.kurum.id, self.sube.id)
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-group',
            waba_id='waba-group',
            is_active=True,
            is_default=True,
        )

    def test_create_draft_stores_group_and_list_filters(self):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='yoklama_gelmedi_veli',
            body_named='Sayın velimiz, {{ogrenci_ad}} bugün gelmedi.',
            template_group='yoklama:kutuphane',
        )
        self.assertEqual(tpl.template_group, 'yoklama:kutuphane')
        listed = MetaTemplateService.list_templates(
            self.kurum.id, template_group='yoklama:kutuphane',
        )
        self.assertEqual(listed.count(), 1)
        other = MetaTemplateService.list_templates(self.kurum.id, template_group='odev')
        self.assertEqual(other.count(), 0)

    def test_pairing_copies_group_to_app_template(self):
        meta = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='odev_plani_veli',
            body_named='Sayın velimiz, {{ogrenci_ad}} ödev planı hazır.',
            template_group='odev',
        )
        app = TemplatePairingService.create_app_from_meta(
            meta,
            sube_id=self.sube.id,
            user=self.user,
            display_name='Haftalık ödev — Veli',
        )
        self.assertEqual(app.template_group, 'odev')

    def test_app_create_and_meta_from_app_copy_group(self):
        app = TemplateService().create(
            self.kurum.id,
            sube_id=self.sube.id,
            user=self.user,
            name='Kayıt sözleşmesi — Personel',
            body='Yeni sözleşme aktif: {{ogrenci_ad}}.',
            audience_scope=TemplateAudienceScope.ADMIN,
            template_group='ogrenci',
        )
        self.assertEqual(app.template_group, 'ogrenci')
        meta = TemplatePairingService.create_meta_from_app(
            app,
            channel_config_id=self.account.id,
            user=self.user,
            meta_name='ogrenci_kayit_sozlesme_personel',
        )
        self.assertEqual(meta.template_group, 'ogrenci')

    def test_approved_template_group_can_change(self):
        tpl = MetaTemplateService.create_draft(
            self.kurum.id,
            channel_config_id=self.account.id,
            name='sinif_programi_veli',
            body_named='Sayın velimiz, ders programı ektedir.',
            template_group='akademik',
        )
        tpl.status = 'APPROVED'
        tpl.save(update_fields=['status'])
        MetaTemplateService.set_template_group(tpl, 'odev')
        tpl.refresh_from_db()
        self.assertEqual(tpl.template_group, 'odev')
        self.assertEqual(WhatsAppMetaTemplate.objects.get(pk=tpl.pk).template_group, 'odev')

    def test_recipient_does_not_change_group(self):
        self.assertEqual(
            template_group_for_event_key('yoklama.gelmedi'),
            template_group_for_event(get_event('yoklama.gelmedi')),
        )
        veli_name = get_event('yoklama.gelmedi').suggested_meta_name(RecipientType.VELI)
        self.assertEqual(veli_name, 'yoklama_gelmedi_veli')
