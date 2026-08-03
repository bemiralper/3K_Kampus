"""Merkezi bildirim şablon eşlemesi — çözümleme, önizleme ve personel gönderimi."""
from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.communication.application.notification_binding_service import (
    NotificationBindingError,
    list_event_catalog,
    preview_binding,
    upsert_binding,
)
from apps.communication.application.notification_dispatcher import (
    NotificationAttachment,
    NotificationRecipient,
    dispatch_event,
)
from apps.communication.application.notification_events import (
    NOTIFICATION_EVENTS,
    build_meta_example_body,
    get_event,
)
from apps.communication.application.notification_template_resolver import (
    SOURCE_BINDING_KURUM,
    SOURCE_BINDING_SUBE,
    SOURCE_BINDING_SUBE_ACCOUNT,
    SOURCE_EVENT_DEFAULT,
    SOURCE_META_NAME,
    resolve_binding,
)
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    NotificationSendMode,
    RecipientType,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    NotificationTemplateBinding,
    WhatsAppMetaTemplate,
)
from apps.communication.tests.session_helpers import open_session_window
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class NotificationEventCatalogTest(TestCase):
    def test_event_keys_are_unique(self):
        keys = [event.key for event in NOTIFICATION_EVENTS]
        self.assertEqual(len(keys), len(set(keys)))

    def test_every_event_has_body_for_each_recipient(self):
        for event in NOTIFICATION_EVENTS:
            for recipient in event.recipients:
                self.assertTrue(
                    event.default_body(recipient),
                    f'{event.key}/{recipient} varsayılan metni boş',
                )

    def test_meta_example_body_complies_with_meta_rules(self):
        for event in NOTIFICATION_EVENTS:
            for recipient in event.recipients:
                body = build_meta_example_body(event, recipient)
                self.assertFalse(
                    body.startswith('{{'),
                    f'{event.key}/{recipient} değişkenle başlıyor',
                )
                self.assertFalse(
                    body.endswith('}}'),
                    f'{event.key}/{recipient} değişkenle bitiyor',
                )

    def test_meta_name_candidates_include_legacy_names(self):
        event = get_event('odev.plan')
        names = event.meta_name_candidates(RecipientType.VELI)
        self.assertEqual(names[0], 'odev_plani_veli')
        self.assertIn('haftalik_odev_plani_veli', names)


class ResolverScopeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Bind Kurum', kod='BIND')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-bind',
            waba_id='waba-bind',
            is_active=True,
            is_default=True,
        )

    def _meta(self, name: str, header_type: str = 'DOCUMENT') -> WhatsAppMetaTemplate:
        return WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name=name,
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, {{ogrenci_ad}} için plan ektedir.',
            header_json={'type': header_type} if header_type != 'NONE' else {},
            approved_at=timezone.now(),
        )

    def _binding(self, *, meta, sube=None, channel_config=None):
        return NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            sube=sube,
            channel_config=channel_config,
            event_key='odev.plan',
            recipient_type=RecipientType.VELI,
            channel=Channel.WHATSAPP,
            meta_template=meta,
        )

    def test_falls_back_to_event_default_without_any_config(self):
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertEqual(resolved.source, SOURCE_EVENT_DEFAULT)
        self.assertIsNone(resolved.meta_template)
        self.assertTrue(resolved.body)

    def test_discovers_meta_template_by_suggested_name(self):
        tpl = self._meta('odev_plani_veli')
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertEqual(resolved.source, SOURCE_META_NAME)
        self.assertEqual(resolved.meta_template.id, tpl.id)

    def test_ignores_meta_template_without_document_header_for_pdf_event(self):
        self._meta('odev_plani_veli', header_type='NONE')
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertIsNone(resolved.meta_template)

    def test_specificity_order_prefers_sube_and_account(self):
        kurum_tpl = self._meta('kurum_tpl')
        sube_tpl = self._meta('sube_tpl')
        full_tpl = self._meta('full_tpl')
        self._binding(meta=kurum_tpl)
        self._binding(meta=sube_tpl, sube=self.sube)
        self._binding(meta=full_tpl, sube=self.sube, channel_config=self.account)

        resolved = resolve_binding(
            self.kurum.id, 'odev.plan', RecipientType.VELI,
            sube_id=self.sube.id, channel_config_id=str(self.account.id),
        )
        self.assertEqual(resolved.source, SOURCE_BINDING_SUBE_ACCOUNT)
        self.assertEqual(resolved.meta_template.id, full_tpl.id)

        resolved = resolve_binding(
            self.kurum.id, 'odev.plan', RecipientType.VELI, sube_id=self.sube.id,
        )
        self.assertEqual(resolved.source, SOURCE_BINDING_SUBE)
        self.assertEqual(resolved.meta_template.id, sube_tpl.id)

        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertEqual(resolved.source, SOURCE_BINDING_KURUM)
        self.assertEqual(resolved.meta_template.id, kurum_tpl.id)

    def test_disabled_mode_blocks_send(self):
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            event_key='odev.plan',
            recipient_type=RecipientType.VELI,
            send_mode=NotificationSendMode.DISABLED,
        )
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertTrue(resolved.is_disabled)

        result = dispatch_event(
            self.kurum.id,
            'odev.plan',
            recipient=NotificationRecipient.veli(1),
        )
        self.assertFalse(result.success)

    def test_freeform_only_ignores_meta_template(self):
        self._meta('odev_plani_veli')
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            event_key='odev.plan',
            recipient_type=RecipientType.VELI,
            send_mode=NotificationSendMode.FREEFORM_ONLY,
        )
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertFalse(resolved.use_meta(needs_document=True))

    def test_message_template_body_wins_over_event_default(self):
        tpl = MessageTemplate.objects.create(
            kurum=self.kurum,
            name='Özel ödev metni',
            body='Merhaba {{veli_ad}}, plan ektedir.',
        )
        NotificationTemplateBinding.objects.create(
            kurum=self.kurum,
            event_key='odev.plan',
            recipient_type=RecipientType.VELI,
            message_template=tpl,
        )
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertTrue(resolved.body_from_template)
        self.assertEqual(resolved.body, tpl.body)


class BindingServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Svc Kurum', kod='SVC')

    def test_upsert_rejects_unknown_event(self):
        with self.assertRaises(NotificationBindingError):
            upsert_binding(
                self.kurum.id,
                event_key='bilinmeyen.olay',
                recipient_type=RecipientType.VELI,
            )

    def test_upsert_rejects_unsupported_recipient(self):
        with self.assertRaises(NotificationBindingError):
            upsert_binding(
                self.kurum.id,
                event_key='yoklama.gelmedi',
                recipient_type=RecipientType.PERSONEL,
            )

    def test_upsert_is_idempotent_for_same_scope(self):
        upsert_binding(
            self.kurum.id,
            event_key='odev.plan',
            recipient_type=RecipientType.VELI,
            send_mode=NotificationSendMode.FREEFORM_ONLY,
        )
        upsert_binding(
            self.kurum.id,
            event_key='odev.plan',
            recipient_type=RecipientType.VELI,
            send_mode=NotificationSendMode.META_ONLY,
        )
        rows = NotificationTemplateBinding.objects.filter(
            kurum=self.kurum, event_key='odev.plan', recipient_type=RecipientType.VELI,
        )
        self.assertEqual(rows.count(), 1)
        self.assertEqual(rows.first().send_mode, NotificationSendMode.META_ONLY)

    def test_catalog_lists_every_event_with_slots(self):
        catalog = list_event_catalog(self.kurum.id)
        self.assertEqual(len(catalog['events']), len(NOTIFICATION_EVENTS))
        for event in catalog['events']:
            self.assertTrue(event['slots'])

    def test_preview_fills_sample_variables(self):
        payload = preview_binding(
            self.kurum.id,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            context={'ogrenci_ad': 'Ali Yılmaz', 'tarih': '03.08.2026'},
        )
        self.assertIn('Ali Yılmaz', payload['body'])
        self.assertIn('03.08.2026', payload['body'])
        self.assertTrue(payload['would_send'])

    def test_dry_run_dispatch_returns_preview(self):
        preview = dispatch_event(
            self.kurum.id,
            'yoklama.gelmedi',
            recipient=NotificationRecipient.veli(1),
            context={'ogrenci_ad': 'Ayşe', 'tarih': '01.01.2026'},
            dry_run=True,
        )
        self.assertFalse(preview.uses_meta)
        self.assertIn('Ayşe', preview.body)

    def test_unknown_event_dispatch_fails_safely(self):
        result = dispatch_event(
            self.kurum.id,
            'yok.boyle.olay',
            recipient=NotificationRecipient.veli(1),
        )
        self.assertFalse(result.success)


class PersonelDispatchTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Personel Kurum', kod='PERS')
        open_session_window(self.kurum.id, '05551112233')

    @patch('apps.communication.application.integration_hooks.send_document_to_personel')
    def test_gun_sonu_event_routes_to_personel_hook(self, mock_send):
        mock_send.return_value = None
        dispatch_event(
            self.kurum.id,
            'finans.gun_sonu',
            recipient=NotificationRecipient.personel(None, phone='05551112233'),
            context={'tarih': '03.08.2026'},
            attachment=NotificationAttachment(filename='rapor.pdf', file_bytes=b'%PDF-1.4'),
        )
        self.assertTrue(mock_send.called)
        _args, kwargs = mock_send.call_args
        self.assertEqual(kwargs['phone'], '05551112233')

    @patch('apps.communication.application.integration_hooks.send_text_to_personel')
    def test_text_event_routes_to_personel_hook(self, mock_send):
        mock_send.return_value = None
        dispatch_event(
            self.kurum.id,
            'duyuru.genel',
            recipient=NotificationRecipient.personel(None, phone='05551112233'),
            context={'mesaj': 'Yarın toplantı var.'},
        )
        self.assertTrue(mock_send.called)
        args, _kwargs = mock_send.call_args
        self.assertIn('Yarın toplantı var.', args[2])
