from django.test import SimpleTestCase

from apps.communication.application.campaign_template_catalog import (
    audience_matches,
    classify_campaign_template,
    infer_campaign_audience,
    infer_campaign_media,
    needed_campaign_audience,
)


class CampaignTemplateCatalogTest(SimpleTestCase):
    def test_live_examples_are_independent_audiences(self):
        self.assertEqual(infer_campaign_audience('veli_toplu_duyuru'), 'veli')
        self.assertEqual(infer_campaign_audience('toplu_duyuru'), 'veli')
        self.assertEqual(infer_campaign_audience('ogrenci_toplu_duyuru'), 'ogrenci')
        self.assertEqual(infer_campaign_audience('ogretmen_toplu_duyuru'), 'personel')

    def test_legacy_seed_suffixes(self):
        self.assertEqual(infer_campaign_audience('duyuru_metin'), 'veli')
        self.assertEqual(infer_campaign_audience('duyuru_gorsel_ogrenci'), 'ogrenci')
        self.assertEqual(infer_campaign_audience('hatirlatma_pdf_personel'), 'personel')

    def test_unmatched_name_is_genel(self):
        self.assertEqual(infer_campaign_audience('kampus_video_v3'), 'genel')

    def test_media_from_header(self):
        self.assertEqual(infer_campaign_media({'type': 'IMAGE'}), 'gorsel')
        self.assertEqual(infer_campaign_media({'type': 'DOCUMENT'}), 'pdf')
        self.assertEqual(infer_campaign_media({'type': 'VIDEO'}), 'video')
        self.assertEqual(infer_campaign_media({'type': 'TEXT'}), 'metin')

    def test_needed_audience_mixed_is_genel(self):
        self.assertEqual(needed_campaign_audience(['veli']), 'veli')
        self.assertEqual(needed_campaign_audience(['ogrenci']), 'ogrenci')
        self.assertEqual(needed_campaign_audience(['personel']), 'personel')
        self.assertEqual(needed_campaign_audience(['veli', 'ogrenci']), 'genel')
        self.assertEqual(needed_campaign_audience(['veli', 'ogrenci', 'personel']), 'genel')
        self.assertEqual(needed_campaign_audience([]), '')

    def test_genel_matches_every_audience(self):
        self.assertTrue(audience_matches('genel', 'veli'))
        self.assertTrue(audience_matches('genel', 'ogrenci'))
        self.assertTrue(audience_matches('genel', 'personel'))
        self.assertTrue(audience_matches('genel', 'genel'))
        self.assertTrue(audience_matches('veli', 'veli'))
        self.assertFalse(audience_matches('veli', 'ogrenci'))
        self.assertFalse(audience_matches('veli', 'genel'))

    def test_future_named_templates_without_hardcoded_list(self):
        classified = classify_campaign_template(
            name='duyuru_video_ogrenci',
            usage_scope='CAMPAIGN',
            header_json={'type': 'VIDEO'},
            campaign_audience='ogrenci',
        )
        self.assertTrue(classified.eligible)
        self.assertEqual(classified.audience, 'ogrenci')
        self.assertEqual(classified.media, 'video')

    def test_system_templates_are_not_campaign_eligible(self):
        classified = classify_campaign_template(
            name='ozel_ders_islendi_veli',
            usage_scope='SYSTEM',
            campaign_audience='veli',
        )
        self.assertFalse(classified.eligible)

    def test_all_usage_is_not_campaign_eligible(self):
        classified = classify_campaign_template(
            name='kampus_duyuru_v3',
            usage_scope='ALL',
            campaign_audience='personel',
            header_json={'type': 'IMAGE'},
        )
        self.assertFalse(classified.eligible)

    def test_explicit_audience_wins_over_name(self):
        classified = classify_campaign_template(
            name='veli_toplu_duyuru',
            usage_scope='CAMPAIGN',
            campaign_audience='genel',
        )
        self.assertTrue(classified.eligible)
        self.assertEqual(classified.audience, 'genel')
