"""Meta ↔ uygulama şablon eşleme testleri."""
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from apps.communication.application.template_category_service import TemplateCategoryService
from apps.communication.application.template_pairing_service import (
    TemplatePairingService,
    humanize_meta_name,
    slugify_meta_name,
)
from apps.communication.application.meta_template_service import (
    MetaTemplateService,
    MetaTemplateServiceError,
)
from apps.communication.application.notification_binding_service import upsert_binding
from apps.communication.application.template_service import TemplateService
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    NotificationSendMode,
    RecipientType,
    TemplateAudienceScope,
    TemplateCategory,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_manage(user):
    role, _ = Role.objects.get_or_create(
        code='pair_admin',
        defaults={'name': 'Pair Admin', 'level': 100, 'is_system_role': True},
    )
    for code in ('communication.manage', 'communication.read', 'communication.bulk'):
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class TemplatePairingHelpersTest(TestCase):
    def test_slugify_turkish(self):
        self.assertEqual(slugify_meta_name('Ödev Planı Veli'), 'odev_plani_veli')

    def test_humanize(self):
        self.assertEqual(humanize_meta_name('odev_plani_veli'), 'odev plani veli')


class TemplatePairingServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Pair Kurum', kod='PAIR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PAIR-M')
        self.user = User.objects.create_user(username='pairadmin', password='x')
        _assign_manage(self.user)
        TemplateCategoryService().ensure_defaults(self.kurum.id, self.sube.id)
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn-pair',
            waba_id='waba-pair',
            is_active=True,
            is_default=True,
        )

    def test_create_app_from_meta(self):
        meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='hosgeldin_veli',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Sayın {{veli_ad}}, bilgilendirme metni burada.',
        )
        app = TemplatePairingService.create_app_from_meta(
            meta,
            sube_id=self.sube.id,
            user=self.user,
            category=TemplateCategory.OZEL,
            audience_scope=TemplateAudienceScope.ADMIN,
        )
        self.assertEqual(app.body, meta.body_named)
        self.assertEqual(app.meta_template_id, meta.id)
        self.assertEqual(app.name, 'hosgeldin veli')

    def test_create_meta_from_app(self):
        app = MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Ödeme Hatırlatma',
            body='Sayın {{veli_ad}}, taksit bilginiz hazırdır.',
            category=TemplateCategory.OZEL,
            audience_scope=TemplateAudienceScope.ADMIN,
            created_by=self.user,
        )
        meta = TemplatePairingService.create_meta_from_app(
            app,
            channel_config_id=self.account.id,
            user=self.user,
        )
        app.refresh_from_db()
        self.assertEqual(meta.body_named, app.body)
        self.assertEqual(meta.name, 'odeme_hatirlatma')
        self.assertEqual(app.meta_template_id, meta.id)

    def test_create_meta_from_app_copies_header_footer(self):
        app = MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Başlıklı Hatırlatma',
            body='Sayın {{veli_ad}}, taksit bilginiz hazırdır.',
            header_json={'type': 'TEXT', 'text': 'Odeme hatirlatmasi'},
            footer_text='3K Kampus',
            category=TemplateCategory.OZEL,
            audience_scope=TemplateAudienceScope.ADMIN,
            created_by=self.user,
        )
        meta = TemplatePairingService.create_meta_from_app(
            app,
            channel_config_id=self.account.id,
            user=self.user,
        )
        self.assertEqual(meta.header_json.get('type'), 'TEXT')
        self.assertEqual(meta.header_json.get('text'), 'Odeme hatirlatmasi')
        self.assertEqual(meta.footer_text, '3K Kampus')

    def test_rejects_body_violating_meta_rules(self):
        app = MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Kotu Sablon',
            body='{{veli_ad}}',
            category=TemplateCategory.OZEL,
            audience_scope=TemplateAudienceScope.ADMIN,
            created_by=self.user,
        )
        with self.assertRaises(ValidationError):
            TemplatePairingService.create_meta_from_app(
                app,
                channel_config_id=self.account.id,
                user=self.user,
            )

    def test_import_unpaired_bulk(self):
        WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='aktarilacak',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın {{veli_ad}}, bilgilendirme metni burada.',
        )
        paired = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='zaten_bagli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın {{veli_ad}}, bu zaten bağlıdır.',
        )
        MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Zaten bağlı',
            body=paired.body_named,
            category=TemplateCategory.OZEL,
            audience_scope=TemplateAudienceScope.ADMIN,
            meta_template=paired,
            created_by=self.user,
        )
        result = TemplatePairingService.import_unpaired_meta_templates(
            self.kurum.id,
            sube_id=self.sube.id,
            user=self.user,
            channel_config_id=self.account.id,
        )
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(result['created'][0]['name'], 'aktarilacak')
        self.assertEqual(
            MessageTemplate.objects.filter(meta_template=paired).count(), 1,
        )

    def test_delete_meta_removes_paired_app(self):
        meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='silinecek_esli',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Sayın {{veli_ad}}, bilgilendirme metni burada.',
        )
        app = TemplatePairingService.create_app_from_meta(
            meta, sube_id=self.sube.id, user=self.user,
        )
        result = MetaTemplateService.delete_local(meta)
        self.assertEqual(result['paired_app_deleted'], 1)
        self.assertFalse(MessageTemplate.objects.filter(id=app.id).exists())
        self.assertFalse(WhatsAppMetaTemplate.objects.filter(id=meta.id).exists())

    def test_delete_meta_blocked_when_used_in_notification(self):
        meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_bagli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın {{veli_ad}}, {{ogrenci_ad}} gelmedi.',
        )
        upsert_binding(
            self.kurum.id,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            meta_template_id=str(meta.id),
            send_mode=NotificationSendMode.META_ONLY,
        )
        with self.assertRaises(MetaTemplateServiceError) as ctx:
            MetaTemplateService.delete_local(meta)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertTrue(WhatsAppMetaTemplate.objects.filter(id=meta.id).exists())

    def test_edit_meta_syncs_paired_app(self):
        meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='senkron_meta',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Sayın {{veli_ad}}, eski metin burada durur.',
        )
        app = TemplatePairingService.create_app_from_meta(
            meta, sube_id=self.sube.id, user=self.user,
        )
        MetaTemplateService.update_draft(
            meta,
            body_named='Sayın {{veli_ad}}, yeni duyuru metni burada.',
        )
        app.refresh_from_db()
        self.assertEqual(app.body, 'Sayın {{veli_ad}}, yeni duyuru metni burada.')

    def test_edit_app_syncs_paired_meta_draft(self):
        meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='senkron_app',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Sayın {{veli_ad}}, eski metin burada durur.',
        )
        app = TemplatePairingService.create_app_from_meta(
            meta, sube_id=self.sube.id, user=self.user,
        )
        TemplateService().update(
            app,
            user=self.user,
            body='Sayın {{veli_ad}}, uygulama tarafı güncellendi.',
        )
        meta.refresh_from_db()
        self.assertEqual(meta.body_named, 'Sayın {{veli_ad}}, uygulama tarafı güncellendi.')

    def test_bulk_delete_skips_notification_templates(self):
        free = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='serbest_sablon',
            language='tr',
            status=MetaTemplateStatus.DRAFT,
            body_named='Sayın {{veli_ad}}, serbest metin burada.',
        )
        used = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='kullanilan_sablon',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın {{veli_ad}}, {{ogrenci_ad}} gelmedi.',
        )
        upsert_binding(
            self.kurum.id,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            meta_template_id=str(used.id),
            send_mode=NotificationSendMode.META_ONLY,
        )
        result = MetaTemplateService.bulk_delete(
            self.kurum.id,
            [str(free.id), str(used.id)],
        )
        self.assertEqual(result['deleted_count'], 1)
        self.assertEqual(result['blocked_count'], 1)
        self.assertEqual(result['blocked'][0]['name'], 'kullanilan_sablon')
        self.assertFalse(WhatsAppMetaTemplate.objects.filter(id=free.id).exists())
        self.assertTrue(WhatsAppMetaTemplate.objects.filter(id=used.id).exists())
