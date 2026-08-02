"""Haftalık ödev — Meta DOCUMENT şablon keşfi."""
from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.assignment_template_roles import (
    ROLE_PLAN_VELI,
    get_meta_template_for_notify,
    set_config_meta_template,
)
from apps.coaching.assignment_manual.models import AssignmentNotificationConfig
from apps.communication.domain.enums import Channel, MetaTemplateStatus
from apps.communication.domain.models import CommunicationChannelConfig, WhatsAppMetaTemplate
from apps.kurum.domain.models import Kurum


class MetaDocumentNotifyResolveTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Odev Meta', kod='OMETA')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='WA',
            phone_number_id='pn',
            waba_id='waba',
            is_active=True,
            is_default=True,
        )

    def _tpl(self, name, *, header='DOCUMENT', status=MetaTemplateStatus.APPROVED):
        return WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name=name,
            language='tr',
            status=status,
            body_named='{{ogrenci_ad}} ödev planı ektedir.',
            header_json={'type': header, 'example_handle': 'h'},
            variable_map_json={'1': 'ogrenci_ad'},
            approved_at=timezone.now() if status == MetaTemplateStatus.APPROVED else None,
        )

    def test_resolves_by_convention_name(self):
        tpl = self._tpl('odev_plani_veli')
        found = get_meta_template_for_notify(self.kurum.id, 'plan', 'veli')
        self.assertEqual(found.id, tpl.id)

    def test_ignores_non_document_header(self):
        self._tpl('odev_plani_veli', header='IMAGE')
        self.assertIsNone(get_meta_template_for_notify(self.kurum.id, 'plan', 'veli'))

    def test_config_fk_wins(self):
        by_name = self._tpl('odev_plani_veli')
        preferred = self._tpl('custom_plan_veli')
        AssignmentNotificationConfig.objects.create(kurum_id=self.kurum.id)
        set_config_meta_template(self.kurum.id, ROLE_PLAN_VELI, preferred)
        found = get_meta_template_for_notify(self.kurum.id, 'plan', 'veli')
        self.assertEqual(found.id, preferred.id)
        self.assertNotEqual(found.id, by_name.id)
