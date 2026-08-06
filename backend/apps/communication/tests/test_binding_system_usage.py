from django.test import TestCase

from apps.communication.application.notification_binding_service import (
    list_message_template_binding_usages,
    list_meta_template_binding_usages,
    upsert_binding,
)
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    NotificationSendMode,
    RecipientType,
    TemplateAudienceScope,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    WhatsAppMetaTemplate,
)
from apps.communication.interfaces.serializers.template import MessageTemplateSerializer
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class BindingSystemUsageTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Bind Usage', kod='BUSG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Ana',
            phone_number_id='pn-usage',
            waba_id='waba-usage',
            is_active=True,
            is_default=True,
        )
        self.lms = MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Yoklama gelmedi serbest',
            body='Sayın {{veli_ad}}, {{ogrenci_ad}} gelmedi.',
            category='yoklama_gelmedi',
            audience_scope=TemplateAudienceScope.COACH,
            is_active=True,
        )
        self.meta = WhatsAppMetaTemplate.objects.create(
            kurum=self.kurum,
            channel_config=self.account,
            name='yoklama_gelmedi_veli',
            language='tr',
            status=MetaTemplateStatus.APPROVED,
            body_named='Sayın {{veli_ad}}, {{ogrenci_ad}} gelmedi.',
        )

    def test_lms_binding_shows_as_system_usage(self):
        upsert_binding(
            self.kurum.id,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            message_template_id=str(self.lms.id),
            send_mode=NotificationSendMode.AUTO,
        )
        usages = list_message_template_binding_usages(self.lms)
        self.assertEqual(len(usages), 1)
        self.assertEqual(usages[0]['module'], 'communication')
        self.assertIn('Yoklama', usages[0]['label'])

        data = MessageTemplateSerializer(self.lms).data
        self.assertTrue(data['is_system_active'])
        labels = [u['label'] for u in data['system_usages']]
        self.assertTrue(any('Yoklama' in label for label in labels))

    def test_meta_binding_shows_as_system_usage(self):
        upsert_binding(
            self.kurum.id,
            event_key='yoklama.gelmedi',
            recipient_type=RecipientType.VELI,
            meta_template_id=str(self.meta.id),
            send_mode=NotificationSendMode.META_ONLY,
        )
        usages = list_meta_template_binding_usages(self.meta)
        self.assertEqual(len(usages), 1)
        self.assertEqual(usages[0]['event_key'], 'yoklama.gelmedi')
