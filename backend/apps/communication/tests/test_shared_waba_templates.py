"""Aynı WABA altındaki Meta şablonlarının birleşik listesi / sync / create guard."""
from unittest.mock import patch

from django.test import TestCase, override_settings

from apps.communication.application.meta_template_service import (
    MetaTemplateService,
    MetaTemplateServiceError,
)
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateCategory,
    MetaTemplateStatus,
    MetaTemplateUsage,
)
from apps.communication.domain.models import CommunicationChannelConfig, WhatsAppMetaTemplate
from apps.kurum.domain.models import Kurum


@override_settings(
    WHATSAPP_ACCESS_TOKEN='',
    WHATSAPP_PHONE_NUMBER_ID='',
    WHATSAPP_WABA_ID='',
)
class SharedWabaTemplateTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='WABA Kurum', kod='WABAK')
        self.acc_a = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk',
            phone_number_id='pn_coach',
            waba_id='waba-shared-1',
            is_active=True,
            is_default=True,
        )
        self.acc_b = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Muhasebe',
            phone_number_id='pn_acc',
            waba_id='waba-shared-1',
            is_active=True,
            is_default=False,
        )
        self.acc_other = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Başka WABA',
            phone_number_id='pn_other',
            waba_id='waba-other',
            is_active=True,
            is_default=False,
        )

    def _make_tpl(self, account, name='duyuru_metin', **kwargs):
        defaults = {
            'kurum': self.kurum,
            'channel_config': account,
            'name': name,
            'language': 'tr',
            'meta_category': MetaTemplateCategory.UTILITY,
            'status': MetaTemplateStatus.APPROVED,
            'usage_scope': MetaTemplateUsage.CAMPAIGN,
            'body_named': 'Merhaba {{mesaj}}',
        }
        defaults.update(kwargs)
        return WhatsAppMetaTemplate.objects.create(**defaults)

    def test_list_includes_sibling_and_dedupes(self):
        on_a = self._make_tpl(self.acc_a, name='ortak_sablon', body_named='A {{mesaj}}')
        on_b = self._make_tpl(
            self.acc_b,
            name='ortak_sablon',
            body_named='B {{mesaj}}',
            variable_map_json={'1': 'mesaj'},
        )
        only_b = self._make_tpl(self.acc_b, name='sadece_muhasebe')
        self._make_tpl(self.acc_other, name='baska_waba')

        listed = list(
            MetaTemplateService.list_templates(
                self.kurum.id,
                channel_config_id=self.acc_a.id,
            )
        )
        names = {t.name for t in listed}
        self.assertIn('ortak_sablon', names)
        self.assertIn('sadece_muhasebe', names)
        self.assertNotIn('baska_waba', names)
        # Aynı ad+dil tek satır
        self.assertEqual(sum(1 for t in listed if t.name == 'ortak_sablon'), 1)
        # Tercih: seçili hesap (A) kopyası
        winner = next(t for t in listed if t.name == 'ortak_sablon')
        self.assertEqual(winner.id, on_a.id)
        self.assertNotEqual(winner.id, on_b.id)

    def test_list_without_shared_flag_is_exact(self):
        self._make_tpl(self.acc_b, name='sadece_b')
        listed = list(
            MetaTemplateService.list_templates(
                self.kurum.id,
                channel_config_id=self.acc_a.id,
                include_shared_waba=False,
                dedupe=False,
            )
        )
        self.assertEqual(listed, [])

    def test_create_draft_blocks_sibling_duplicate(self):
        self._make_tpl(self.acc_a, name='mevcut_sablon', status=MetaTemplateStatus.DRAFT)
        with self.assertRaises(MetaTemplateServiceError) as ctx:
            MetaTemplateService.create_draft(
                self.kurum.id,
                channel_config_id=self.acc_b.id,
                name='mevcut_sablon',
                body_named='Yeni gövde {{mesaj}}',
            )
        self.assertIn('WABA', ctx.exception.message)

    def test_find_on_shared_waba(self):
        self._make_tpl(self.acc_a, name='odeme_hatirlatma')
        found = MetaTemplateService.find_on_shared_waba(
            self.kurum.id,
            channel_config_id=self.acc_b.id,
            name='odeme_hatirlatma',
        )
        self.assertIsNotNone(found)
        self.assertEqual(found.name, 'odeme_hatirlatma')

    def test_sync_writes_all_siblings(self):
        payloads = {
            'success': True,
            'templates': [
                {
                    'id': 'meta-1',
                    'name': 'sync_shared',
                    'language': 'tr',
                    'status': 'APPROVED',
                    'category': 'UTILITY',
                    'components': [
                        {'type': 'BODY', 'text': 'Merhaba {{1}}'},
                    ],
                },
            ],
        }
        # A hesabında zaten named map var — kardeşe kopyalanmalı
        donor = self._make_tpl(
            self.acc_a,
            name='sync_shared',
            status=MetaTemplateStatus.DRAFT,
            body_named='Merhaba {{ogrenci_ad}}',
            variable_map_json={'1': 'ogrenci_ad'},
            usage_scope=MetaTemplateUsage.SYSTEM,
            template_group='odev',
        )

        with patch(
            'apps.communication.application.meta_template_service.WhatsAppCloudClient'
            '.list_message_templates',
            return_value=payloads,
        ):
            result = MetaTemplateService.sync_account(self.acc_b)

        self.assertTrue(result['success'])
        self.assertGreaterEqual(result['accounts_synced'], 2)
        on_b = WhatsAppMetaTemplate.objects.filter(
            channel_config=self.acc_b, name='sync_shared', language='tr',
        ).first()
        self.assertIsNotNone(on_b)
        self.assertEqual(on_b.usage_scope, MetaTemplateUsage.SYSTEM)
        self.assertEqual(on_b.template_group, 'odev')
        self.assertEqual(on_b.variable_map_json.get('1'), 'ogrenci_ad')
        self.assertIn('ogrenci_ad', on_b.body_named)

        listed = list(
            MetaTemplateService.list_templates(
                self.kurum.id, channel_config_id=self.acc_b.id,
            )
        )
        self.assertEqual(sum(1 for t in listed if t.name == 'sync_shared'), 1)
        donor.refresh_from_db()
        self.assertEqual(donor.status, MetaTemplateStatus.APPROVED)

    def test_api_list_returns_shared_metadata(self):
        from django.contrib.auth import get_user_model
        from rest_framework.test import APIClient

        from apps.roller.models import Permission, Role, RolePermission, UserRole
        from apps.sube.domain.models import Sube

        User = get_user_model()
        sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MZ')
        role, _ = Role.objects.get_or_create(
            code='wa_meta_admin',
            defaults={'name': 'WA Meta Admin', 'level': 1, 'is_active': True},
        )
        for code in ('communication.read', 'communication.write', 'communication.manage'):
            perm, _ = Permission.objects.get_or_create(
                code=code, defaults={'name': code, 'category': 'test'},
            )
            RolePermission.objects.get_or_create(role=role, permission=perm)
        user = User.objects.create_user(username='wa_meta_u', password='x')
        UserRole.objects.create(user=user, role=role)

        self._make_tpl(self.acc_b, name='api_shared')

        client = APIClient()
        client.force_authenticate(user=user)
        client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        client.defaults['HTTP_X_SUBE_ID'] = str(sube.id)

        res = client.get(
            f'/api/communication/meta-templates/?account_id={self.acc_a.id}',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertGreaterEqual(res.data.get('shared_waba_account_count'), 2)
        names = {t['name'] for t in res.data['templates']}
        self.assertIn('api_shared', names)
        # waba_id serializer alanı
        row = next(t for t in res.data['templates'] if t['name'] == 'api_shared')
        self.assertEqual(row.get('waba_id'), 'waba-shared-1')
