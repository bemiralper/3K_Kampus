"""Eski modül config'lerinden merkezi eşlemeye geçiş yolu."""
from __future__ import annotations

from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.models import AssignmentNotificationConfig
from apps.communication.application.legacy_notification_config import (
    legacy_binding_rows,
    legacy_templates_for_event,
)
from apps.communication.application.notification_template_resolver import (
    SOURCE_LEGACY_CONFIG,
    resolve_binding,
)
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    RecipientType,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import AttendanceNotificationConfig


class LegacyConfigBridgeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Legacy Kurum', kod='LGC')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-legacy',
            waba_id='waba-legacy',
            is_active=True,
            is_default=True,
        )
        self.meta_tpl = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='eski_odev_plani',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın velimiz, {{ogrenci_ad}} için plan ektedir.',
            header_json={'type': 'DOCUMENT'},
            approved_at=timezone.now(),
        )
        self.msg_tpl = MessageTemplate.objects.create(
            kurum=self.kurum,
            name='Eski yoklama metni',
            body='{{ogrenci_ad}} bugün gelmedi.',
        )

    def test_assignment_config_is_read_as_fallback(self):
        AssignmentNotificationConfig.objects.create(
            kurum_id=self.kurum.id,
            plan_veli_meta_template=self.meta_tpl,
        )
        resolved = resolve_binding(self.kurum.id, 'odev.plan', RecipientType.VELI)
        self.assertEqual(resolved.source, SOURCE_LEGACY_CONFIG)
        self.assertEqual(resolved.meta_template.id, self.meta_tpl.id)

    def test_attendance_config_is_read_as_fallback(self):
        AttendanceNotificationConfig.objects.create(
            kurum_id=self.kurum.id,
            absent_template=self.msg_tpl,
        )
        meta, message = legacy_templates_for_event(
            self.kurum.id, 'yoklama.gelmedi', RecipientType.VELI,
        )
        self.assertIsNone(meta)
        self.assertEqual(message.id, self.msg_tpl.id)

    def test_legacy_rows_collect_all_filled_fields(self):
        AssignmentNotificationConfig.objects.create(
            kurum_id=self.kurum.id,
            plan_veli_meta_template=self.meta_tpl,
        )
        AttendanceNotificationConfig.objects.create(
            kurum_id=self.kurum.id,
            absent_template=self.msg_tpl,
        )
        rows = legacy_binding_rows(self.kurum.id)
        slots = {(row['event_key'], row['recipient_type']) for row in rows}
        self.assertIn(('odev.plan', RecipientType.VELI), slots)
        self.assertIn(('yoklama.gelmedi', RecipientType.VELI), slots)

    def test_no_legacy_config_returns_nothing(self):
        self.assertEqual(legacy_binding_rows(self.kurum.id), [])
