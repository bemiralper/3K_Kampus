"""Kazanım kataloğu indir / yükle senaryoları."""
import json

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Outcome, Subject, SubOutcome, Topic
from apps.coaching.olcme_degerlendirme.services.curriculum_catalog import (
    CATALOG_FORMAT,
    export_catalog,
    import_catalog,
)
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()
BASE = '/api/coaching/olcme-degerlendirme/curriculum'


class CurriculumCatalogTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kat Kurum', kod='KATK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KATK-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='katuser', password='test')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }
        self._seed('MATEMATIK', 'Matematik', '9.1', 'Sayılar', '9.1.1', 'Doğal sayılar', '9.1.1.1', 'Okur')

    def _seed(self, scode, sname, tcode, tname, ocode, otext, subcode, subtext):
        subject = Subject.objects.create(code=scode, name=sname, order=1)
        topic = Topic.objects.create(subject=subject, code=tcode, name=tname, order=0)
        outcome = Outcome.objects.create(topic=topic, code=ocode, text=otext, order=0)
        SubOutcome.objects.create(outcome=outcome, code=subcode, text=subtext, order=0)
        return subject

    def test_export_has_no_numeric_ids(self):
        payload = export_catalog()
        self.assertEqual(payload['format'], CATALOG_FORMAT)
        blob = json.dumps(payload)
        self.assertNotIn('"id":', blob)
        self.assertEqual(payload['counts']['subjects'], 1)
        self.assertEqual(payload['subjects'][0]['code'], 'MATEMATIK')
        self.assertEqual(payload['subjects'][0]['topics'][0]['outcomes'][0]['sub_outcomes'][0]['text'], 'Okur')

    def test_export_endpoint_downloads_json(self):
        res = self.client.get(f'{BASE}/catalog/export/', **self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('attachment', res['Content-Disposition'])
        payload = json.loads(res.content.decode())
        self.assertEqual(payload['format'], CATALOG_FORMAT)
        self.assertEqual(payload['counts']['outcomes'], 1)

    def test_empty_target_import_creates_tree(self):
        payload = export_catalog()
        Subject.objects.all().delete()
        result = import_catalog(payload, mode='replace')
        self.assertEqual(Subject.objects.count(), 1)
        self.assertEqual(Topic.objects.count(), 1)
        self.assertEqual(Outcome.objects.count(), 1)
        self.assertEqual(SubOutcome.objects.count(), 1)
        self.assertEqual(result['imported']['subjects'], 1)

    def test_replace_rewrites_same_code_without_duplicating(self):
        payload = export_catalog()
        payload['subjects'][0]['topics'][0]['name'] = 'Sayılar (yeni)'
        import_catalog(payload, mode='replace')
        self.assertEqual(Subject.objects.count(), 1)
        self.assertEqual(Topic.objects.count(), 1)
        self.assertEqual(Topic.objects.get().name, 'Sayılar (yeni)')

    def test_replace_does_not_delete_other_subjects(self):
        other = self._seed('TURKCE', 'Türkçe', '9.1', 'Sözcük', '9.1.1', 'Anlam', '9.1.1.1', 'Kök')
        payload = export_catalog(subject_codes=['MATEMATIK'])
        import_catalog(payload, mode='replace')
        self.assertTrue(Subject.objects.filter(pk=other.pk).exists())
        self.assertEqual(Topic.objects.filter(subject=other).count(), 1)

    def test_merge_adds_only_missing_nodes(self):
        payload = export_catalog()
        payload['subjects'][0]['topics'].append({
            'code': '9.2', 'name': 'Cebir', 'order': 1,
            'outcomes': [{
                'code': '9.2.1', 'text': 'Denklem', 'order': 0, 'is_active': True,
                'sub_outcomes': [],
            }],
        })
        import_catalog(payload, mode='merge')
        self.assertEqual(Topic.objects.filter(subject__code='MATEMATIK').count(), 2)
        self.assertTrue(Topic.objects.filter(code='9.1', name='Sayılar').exists())

    def test_invalid_format_rejected(self):
        with self.assertRaises(ValueError):
            import_catalog({'format': 'diger', 'version': 1, 'subjects': []})

    def test_duplicate_subject_codes_rejected(self):
        payload = export_catalog()
        payload['subjects'].append(payload['subjects'][0].copy())
        with self.assertRaises(ValueError):
            import_catalog(payload)

    def test_dry_run_does_not_write(self):
        payload = export_catalog()
        Subject.objects.all().delete()
        result = import_catalog(payload, dry_run=True)
        self.assertTrue(result['dry_run'])
        self.assertEqual(Subject.objects.count(), 0)

    def test_import_endpoint_empty_db(self):
        payload = export_catalog()
        Subject.objects.all().delete()
        upload = SimpleUploadedFile(
            'katalog.json',
            json.dumps(payload).encode('utf-8'),
            content_type='application/json',
        )
        res = self.client.post(
            f'{BASE}/catalog/import/',
            {'file': upload, 'mode': 'replace'},
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        self.assertTrue(res.json()['ok'])
        self.assertEqual(Subject.objects.filter(code='MATEMATIK').count(), 1)

    def test_import_endpoint_rejects_garbage(self):
        upload = SimpleUploadedFile('x.json', b'not-json', content_type='application/json')
        res = self.client.post(
            f'{BASE}/catalog/import/',
            {'file': upload, 'mode': 'replace'},
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_export_filter_codes(self):
        self._seed('TURKCE', 'Türkçe', '9.1', 'Sözcük', '9.1.1', 'Anlam', '9.1.1.1', 'Kök')
        res = self.client.get(f'{BASE}/catalog/export/?codes=TURKCE', **self.headers)
        payload = json.loads(res.content.decode())
        self.assertEqual([s['code'] for s in payload['subjects']], ['TURKCE'])
