"""CMS v2 — blok doğrulama, sayfa servisi, SEO skoru, migrasyon."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.kurum.domain.models import Kurum
from apps.website.application.migrate_service import migrate_kurum_to_pages
from apps.website.application.page_service import PageService
from apps.website.application.seo_service import score_page
from apps.website.blocks.registry import new_block, validate_blocks, ALLOWED_BLOCK_TYPES
from apps.website.cms_models import WebPage, WebPageVersion
from apps.website.models import Duyuru, HeroSlide, SiteSettings


User = get_user_model()


class BlockRegistryTests(TestCase):
    def test_core_block_types_present(self):
        for t in ('hero', 'richText', 'image', 'cta', 'form', 'html', 'duyurularList'):
            self.assertIn(t, ALLOWED_BLOCK_TYPES)

    def test_validate_blocks_ok(self):
        blocks = [new_block('hero', {'title': 'Merhaba'}), new_block('spacer', {'height': 24})]
        normalized, errors = validate_blocks(blocks)
        self.assertEqual(errors, [])
        self.assertEqual(len(normalized), 2)
        self.assertEqual(normalized[0]['type'], 'hero')
        self.assertIn('visibility', normalized[0]['style'])

    def test_validate_blocks_rejects_unknown(self):
        _, errors = validate_blocks([{'id': 'x', 'type': 'unknown_block', 'props': {}}])
        self.assertTrue(errors)


class PageServiceTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TST')
        self.user = User.objects.create_user(username='cmsadmin', password='test-pass-123')

    def test_create_and_publish_page(self):
        svc = PageService()
        page, err = svc.create_page(self.kurum.id, {
            'title': 'Hakkımızda',
            'slug': 'hakkimizda',
            'blocks': [new_block('heading', {'text': 'Hakkımızda', 'level': 1})],
        }, user=self.user)
        self.assertIsNone(err)
        self.assertEqual(page.slug, 'hakkimizda')
        self.assertEqual(page.versions.count(), 1)

        page = svc.publish(page, user=self.user)
        self.assertEqual(page.status, WebPage.STATUS_PUBLISHED)
        self.assertEqual(page.published_version, 1)

    def test_slug_history_on_rename(self):
        svc = PageService()
        page, _ = svc.create_page(self.kurum.id, {
            'title': 'Eski',
            'slug': 'eski',
            'blocks': [],
        })
        page, err = svc.update_page(page, {'slug': 'yeni'}, user=self.user)
        self.assertIsNone(err)
        self.assertEqual(page.slug, 'yeni')
        self.assertTrue(page.slug_history.filter(old_slug='eski').exists())

    def test_seo_score_penalties(self):
        page = WebPage.objects.create(
            kurum=self.kurum,
            title='X',
            slug='x',
            meta_title='',
            meta_description='',
        )
        result = score_page(page, [new_block('richText', {'html': '<p>kısa</p>'})])
        self.assertLess(result['score'], 100)
        codes = {c['code'] for c in result['checks']}
        self.assertIn('missing_description', codes)
        self.assertTrue({'title_short', 'missing_title'} & codes)


class MigrateServiceTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='3K', kod='3K')
        SiteSettings.objects.create(
            kurum=self.kurum,
            hero_baslik='3K Kampüs',
            seo_baslik='SEO Başlık',
            seo_aciklama='SEO açıklama metni buradadır ve yeterince uzundur.',
        )
        HeroSlide.objects.create(kurum=self.kurum, sira=0, aktif=True)
        Duyuru.objects.create(kurum=self.kurum, baslik='Test Duyuru', ozet='Özet', aktif=True)

    def test_migrate_creates_homepage(self):
        result = migrate_kurum_to_pages(self.kurum.id)
        self.assertFalse(result['skipped'])
        home = WebPage.objects.get(kurum=self.kurum, is_homepage=True)
        self.assertEqual(home.slug, 'home')
        self.assertEqual(home.status, WebPage.STATUS_PUBLISHED)
        ver = home.versions.get(version=home.published_version)
        types = [b['type'] for b in ver.blocks]
        self.assertIn('hero', types)
        self.assertIn('duyurularList', types)

    def test_migrate_idempotent_without_force(self):
        migrate_kurum_to_pages(self.kurum.id)
        second = migrate_kurum_to_pages(self.kurum.id)
        self.assertTrue(second['skipped'])
        self.assertEqual(WebPage.objects.filter(kurum=self.kurum, is_homepage=True).count(), 1)


class CmsV2ApiTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='API Kurum', kod='API')
        self.user = User.objects.create_user(username='apiuser', password='test-pass-123')
        self.user.is_staff = True
        self.user.is_superuser = True
        self.user.save()
        self.client = Client()
        self.client.force_login(self.user)
        # session kurum
        session = self.client.session
        session['active_kurum_id'] = self.kurum.id
        session.save()

    def test_block_types_endpoint(self):
        res = self.client.get('/website-yonetimi/api/v2/block-types/')
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertGreater(len(body['data']), 10)

    def test_pages_crud_and_public(self):
        res = self.client.post(
            '/website-yonetimi/api/v2/pages/',
            data='{"title":"Anasayfa","slug":"home","is_homepage":true,"blocks":[{"id":"1","type":"hero","props":{"title":"Merhaba"},"style":{}}]}',
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 201)
        page_id = res.json()['data']['id']

        pub = self.client.post(f'/website-yonetimi/api/v2/pages/{page_id}/publish/', '{}', content_type='application/json')
        self.assertEqual(pub.status_code, 200)

        public = self.client.get('/website/api/public/API/v2/page/')
        self.assertEqual(public.status_code, 200)
        pdata = public.json()
        self.assertTrue(pdata['success'])
        self.assertEqual(pdata['data']['page']['slug'], 'home')
        self.assertEqual(pdata['data']['page']['blocks'][0]['type'], 'hero')

    def test_dashboard(self):
        res = self.client.get('/website-yonetimi/api/v2/dashboard/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('totals', res.json()['data'])

    def test_backup_resources_registered(self):
        from apps.website.backup_resources import RESOURCES
        codes = {r.code for r in RESOURCES}
        self.assertIn('website.content', codes)
        self.assertIn('website.cms_v2', codes)
        self.assertIn('website.media_files', codes)
        cms = next(r for r in RESOURCES if r.code == 'website.cms_v2')
        self.assertIn('website.WebPage', cms.config['models'])
        self.assertIn('website.FormSubmission', cms.config['models'])
