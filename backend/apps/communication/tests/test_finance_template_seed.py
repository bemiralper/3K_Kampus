from django.test import TestCase

from apps.communication.application.finance_template_seed import (
    FINANCE_EVENT_KEYS,
    FinanceTemplateSeedService,
    list_finance_template_drafts,
)
from apps.communication.application.meta_template_validation import validate_template_content
from apps.communication.domain.enums import (
    Channel,
    MetaTemplateStatus,
    TemplateAudienceScope,
)
from apps.communication.domain.models import (
    CommunicationChannelConfig,
    MessageTemplate,
    WhatsAppMetaTemplate,
)
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube


class FinanceTemplateSeedTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Finans Seed Kurum', kod='FSK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Muhasebe WA',
            phone_number_id='pnid-finance-seed',
            waba_id='waba-finance-seed',
            is_active=True,
            is_default=True,
        )

    def test_catalog_covers_all_finance_slots(self):
        drafts = list_finance_template_drafts()
        keys = {d.event_key for d in drafts}
        self.assertEqual(keys, set(FINANCE_EVENT_KEYS))
        # hatırlatma+gecikme + plan/makbuz/sözleşme×2 + gün sonu = 9
        self.assertEqual(len(drafts), 9)
        meta_names = {d.meta_name for d in drafts}
        self.assertIn('odeme_makbuzu_veli', meta_names)
        self.assertIn('odeme_plani_veli', meta_names)
        self.assertIn('odeme_sozlesmesi_veli', meta_names)
        for draft in drafts:
            self.assertEqual(draft.audience_scope, TemplateAudienceScope.MUHASEBE)
            issues = validate_template_content(
                body_named=draft.body_named,
                header_json=draft.header_json,
                footer_text=draft.footer_text,
            )
            self.assertEqual(issues, [], msg=f'{draft.meta_name}: {issues}')

    def test_seed_app_templates_only(self):
        result = FinanceTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertEqual(len(result['created_app']), 9)
        self.assertEqual(result['created_meta'], [])
        qs = MessageTemplate.objects.filter(
            kurum=self.kurum,
            audience_scope=TemplateAudienceScope.MUHASEBE,
        )
        self.assertEqual(qs.count(), 9)
        self.assertTrue(qs.filter(name='Tahsilat makbuzu — Veli').exists())
        self.assertFalse(qs.filter(name__startswith='Ödeme belgesi').exists())

        # idempotent
        again = FinanceTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertEqual(again['created_app'], [])
        self.assertEqual(len(again['skipped_app']), 9)
        self.assertEqual(qs.count(), 9)

    def test_seed_replaces_legacy_shared_belge_templates(self):
        MessageTemplate.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            name='Ödeme belgesi — Veli',
            body='eski',
            category='odeme',
            audience_scope=TemplateAudienceScope.MUHASEBE,
            is_active=True,
        )
        result = FinanceTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertIn('Ödeme belgesi — Veli', result['removed_legacy'])
        self.assertFalse(
            MessageTemplate.objects.filter(
                kurum=self.kurum, name='Ödeme belgesi — Veli',
            ).exists(),
        )
        self.assertTrue(
            MessageTemplate.objects.filter(
                kurum=self.kurum, name='Tahsilat makbuzu — Veli',
            ).exists(),
        )

    def test_seed_with_meta_drafts(self):
        result = FinanceTemplateSeedService.seed(
            self.kurum.id,
            sube_id=self.sube.id,
            channel_config_id=self.account.id,
        )
        self.assertEqual(len(result['created_app']), 9)
        self.assertEqual(len(result['created_meta']), 9)
        self.assertEqual(result['errors'], [])

        meta_qs = WhatsAppMetaTemplate.objects.filter(channel_config=self.account)
        self.assertEqual(meta_qs.count(), 9)
        self.assertTrue(all(m.status == MetaTemplateStatus.DRAFT for m in meta_qs))

        paired = MessageTemplate.objects.filter(
            kurum=self.kurum,
            meta_template__isnull=False,
        ).count()
        self.assertEqual(paired, 9)

        doc_names = {
            'odeme_plani_veli', 'odeme_plani_ogrenci',
            'odeme_makbuzu_veli', 'odeme_makbuzu_ogrenci',
            'odeme_sozlesmesi_veli', 'odeme_sozlesmesi_ogrenci',
            'gun_sonu_raporu_personel',
        }
        for m in meta_qs:
            if m.name in doc_names:
                self.assertEqual((m.header_json or {}).get('type'), 'DOCUMENT')
