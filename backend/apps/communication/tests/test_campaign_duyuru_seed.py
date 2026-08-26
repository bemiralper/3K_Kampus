"""Kampanya Meta taslak seed (duyuru/hatırlatma/bilgilendirme) + ek/header uyumu."""
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.communication.application.campaign_duyuru_template_seed import (
    CampaignDuyuruTemplateSeedService,
    list_campaign_duyuru_drafts,
)
from apps.communication.application.campaign_service import CampaignService
from apps.communication.domain.enums import Channel, MetaTemplateStatus, MetaTemplateUsage
from apps.communication.domain.models import CommunicationChannelConfig, WhatsAppMetaTemplate
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()

EXPECTED_NAMES = {
    f'{family}_{media}{suffix}'
    for family in ('duyuru', 'hatirlatma', 'bilgilendirme')
    for media in ('metin', 'gorsel', 'pdf')
    for suffix in ('', '_ogrenci', '_personel')
}


class CampaignDuyuruSeedTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Duyuru Kurum', kod='DYR')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.user = User.objects.create_superuser(
            username='duyuru_admin', email='duyuru@test.com', password='testpass123',
        )
        self.account = CommunicationChannelConfig.objects.create(
            kurum=self.kurum,
            channel=Channel.WHATSAPP,
            name='Koçluk WA',
            phone_number_id='pn_duyuru_1',
            waba_id='waba_1',
            is_default=True,
            is_active=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_draft_definitions_valid(self):
        drafts = list_campaign_duyuru_drafts()
        self.assertEqual(len(drafts), 27)
        names = {d.meta_name for d in drafts}
        self.assertEqual(names, EXPECTED_NAMES)
        ogrenci = next(d for d in drafts if d.meta_name == 'hatirlatma_metin_ogrenci')
        self.assertIn('{{ogrenci_ad}}', ogrenci.body_named)
        self.assertIn('hatırlatması', ogrenci.body_named)
        bilgi = next(d for d in drafts if d.meta_name == 'bilgilendirme_pdf')
        self.assertEqual((bilgi.header_json or {}).get('type'), 'DOCUMENT')
        self.assertIn('{{veli_ad}}', bilgi.body_named)
        personel = next(d for d in drafts if d.meta_name == 'duyuru_metin_personel')
        self.assertIn('{{personel_ad}}', personel.body_named)
        self.assertEqual((personel.header_json or {}).get('type'), 'TEXT')
        personel_pdf = next(d for d in drafts if d.meta_name == 'bilgilendirme_pdf_personel')
        self.assertEqual((personel_pdf.header_json or {}).get('type'), 'DOCUMENT')
        for d in drafts:
            self.assertIn('{{sube}}', d.body_named)
            self.assertNotIn('{{kurum_ad}}', d.body_named)
            self.assertTrue((d.example_values or {}).get('mesaj'))
        self.assertNotEqual(
            next(d for d in drafts if d.family == 'duyuru').example_values['mesaj'],
            next(d for d in drafts if d.family == 'hatirlatma').example_values['mesaj'],
        )

    def test_seed_creates_three_campaign_drafts(self):
        result = CampaignDuyuruTemplateSeedService.seed(
            self.kurum.id,
            channel_config_id=self.account.id,
            user=self.user,
        )
        self.assertEqual(len(result['created_meta']), 27)
        self.assertEqual(len(result['errors']), 0)
        qs = WhatsAppMetaTemplate.objects.filter(channel_config=self.account)
        self.assertEqual(qs.count(), 27)
        metin = qs.get(name='duyuru_metin')
        self.assertEqual(metin.usage_scope, MetaTemplateUsage.CAMPAIGN)
        self.assertEqual(metin.status, MetaTemplateStatus.DRAFT)
        self.assertEqual((metin.header_json or {}).get('type'), 'TEXT')
        self.assertIn('{{mesaj}}', metin.body_named)
        self.assertIn('deneme sınavı sonuçları', (metin.example_values_json or {}).get('mesaj', ''))
        hat_metin = qs.get(name='hatirlatma_metin')
        self.assertIn('15 dakika', (hat_metin.example_values_json or {}).get('mesaj', ''))
        bilgi_metin = qs.get(name='bilgilendirme_metin')
        self.assertIn('grup dersi', (bilgi_metin.example_values_json or {}).get('mesaj', ''))
        self.assertIn('{{sube}}', metin.body_named)
        self.assertNotIn('{{kurum_ad}}', metin.body_named)
        hat = qs.get(name='hatirlatma_gorsel_ogrenci')
        self.assertEqual((hat.header_json or {}).get('type'), 'IMAGE')
        self.assertIn('{{ogrenci_ad}}', hat.body_named)
        personel = qs.get(name='hatirlatma_gorsel_personel')
        self.assertEqual((personel.header_json or {}).get('type'), 'IMAGE')
        self.assertIn('{{personel_ad}}', personel.body_named)

    def test_seed_updates_stale_draft_body_kurum_to_sube(self):
        CampaignDuyuruTemplateSeedService.seed(
            self.kurum.id,
            channel_config_id=self.account.id,
            user=self.user,
        )
        tpl = WhatsAppMetaTemplate.objects.get(
            channel_config=self.account, name='duyuru_metin',
        )
        tpl.body_named = tpl.body_named.replace('{{sube}}', '{{kurum_ad}}')
        tpl.save(update_fields=['body_named'])
        result = CampaignDuyuruTemplateSeedService.seed(
            self.kurum.id,
            channel_config_id=self.account.id,
            user=self.user,
        )
        self.assertIn('duyuru_metin', result['updated_meta'])
        tpl.refresh_from_db()
        self.assertIn('{{sube}}', tpl.body_named)
        self.assertNotIn('{{kurum_ad}}', tpl.body_named)

    def test_seed_api_endpoint(self):
        payload = {
            'kurum_id': self.kurum.id,
            'channel_config_id': str(self.account.id),
        }
        res = self.client.post(
            '/api/communication/meta-templates/seed-duyuru/',
            payload,
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['created_count'], 27)
        res2 = self.client.post(
            '/api/communication/meta-templates/seed-duyuru/',
            payload,
            format='json',
        )
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data['skipped_count'], 27)

    def test_attachment_header_mismatch_helper(self):
        class _Att:
            def __init__(self, mime):
                self.mime_type = mime

        with self.assertRaises(ValidationError) as ctx:
            CampaignService._validate_attachment_header_match(
                [_Att('image/png')], 'TEXT',
            )
        self.assertIn('IMAGE', str(ctx.exception))

        with self.assertRaises(ValidationError):
            CampaignService._validate_attachment_header_match([], 'IMAGE')

        CampaignService._validate_attachment_header_match(
            [_Att('application/pdf')], 'DOCUMENT',
        )
        CampaignService._validate_attachment_header_match([], 'TEXT')
