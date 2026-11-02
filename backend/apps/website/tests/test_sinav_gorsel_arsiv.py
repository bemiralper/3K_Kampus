"""Sınav görseli arşivi — tek dosya, isim, etiket ve sınava bağlama."""
import json
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from PIL import Image
from tempfile import TemporaryDirectory

from apps.kurum.domain.models import Kurum
from apps.website.models import SinavGorselArsiv, SinavTakvim

User = get_user_model()


def _jpeg_bytes(color):
    buf = BytesIO()
    Image.new('RGB', (12, 8), color).save(buf, format='JPEG')
    return buf.getvalue()


class SinavGorselArsivTests(TestCase):
    def setUp(self):
        media_root = self.enterContext(TemporaryDirectory(prefix='arsiv-test-'))
        self.enterContext(override_settings(MEDIA_ROOT=media_root))
        self.kurum = Kurum.objects.create(ad='Arşiv Kurum', kod='ARS', aktif_mi=True)
        self.user = User.objects.create_superuser(username='arsivadmin', email='a@test.com', password='x')
        self.client = Client()
        self.client.force_login(self.user)

    def _headers(self):
        return {'HTTP_X_KURUM_ID': str(self.kurum.id)}

    def _upload(self, name='ÜçDörtBeş', tags='TYT, deneme', color='red'):
        return self.client.post(
            '/website-yonetimi/api/sinav-gorsel-arsiv/',
            {'ad': name, 'etiketler': tags, 'gorsel': SimpleUploadedFile('logo.jpg', _jpeg_bytes(color), content_type='image/jpeg')},
            **self._headers(),
        )

    def test_archive_requires_name_and_lists_by_search(self):
        missing = self._upload(name='  ')
        self.assertEqual(missing.status_code, 400)
        created = self._upload()
        self.assertEqual(created.status_code, 201, created.content)
        body = created.json()['data']
        self.assertEqual(body['ad'], 'ÜçDörtBeş')
        self.assertEqual(body['etiketler'], 'TYT, deneme')
        self.assertEqual(body['kullanim'], 0)
        self.assertTrue(body['gorsel_url'])

        found = self.client.get('/website-yonetimi/api/sinav-gorsel-arsiv/?q=deneme', **self._headers())
        self.assertEqual(len(found.json()['data']), 1)
        missed = self.client.get('/website-yonetimi/api/sinav-gorsel-arsiv/?q=olmayan', **self._headers())
        self.assertEqual(missed.json()['data'], [])

    def test_exam_links_archive_without_copying_file(self):
        arsiv_id = self._upload().json()['data']['id']
        archive = SinavGorselArsiv.objects.get(pk=arsiv_id)
        stored = archive.gorsel.name
        res = self.client.post(
            '/website-yonetimi/api/sinav-takvim/',
            data=json.dumps({
                'tur': 'TYT',
                'baslik': 'TYT Deneme',
                'yayin_adi': 'ÜçDörtBeş',
                'gorsel_arsiv_id': arsiv_id,
                'gunler': [
                    {'tarih': '2026-11-05', 'saat': '10:15', 'saat_bitis': '13:15'},
                    {'tarih': '2026-11-06', 'saat': '10:15', 'saat_bitis': '13:15'},
                ],
            }),
            content_type='application/json',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 201, res.content)
        rows = list(SinavTakvim.objects.filter(kurum=self.kurum))
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row.gorsel_arsiv_id == arsiv_id for row in rows))
        self.assertTrue(all(not row.gorsel for row in rows))
        archive.refresh_from_db()
        self.assertEqual(archive.gorsel.name, stored)
        urls = {gun['gorsel_url'].split('?')[0] for gun in res.json()['data']['gunler']}
        self.assertEqual(len(urls), 1)

        second = self.client.post(
            '/website-yonetimi/api/sinav-takvim/',
            data=json.dumps({
                'tur': 'AYT',
                'baslik': 'AYT Deneme',
                'gorsel_arsiv_id': arsiv_id,
                'gunler': [{'tarih': '2026-11-07'}],
            }),
            content_type='application/json',
            **self._headers(),
        )
        self.assertEqual(second.status_code, 201, second.content)
        self.assertEqual(SinavGorselArsiv.objects.filter(kurum=self.kurum).count(), 1)
        self.assertEqual(archive.sinavlar.count(), 3)

    def test_delete_archive_detaches_exams_but_keeps_one_file_until_then(self):
        arsiv_id = self._upload(name='Çap', tags='AYT', color='blue').json()['data']['id']
        self.client.post(
            '/website-yonetimi/api/sinav-takvim/',
            data=json.dumps({
                'tur': 'AYT',
                'baslik': 'Çap Deneme',
                'gorsel_arsiv_id': arsiv_id,
                'gunler': [{'tarih': '2026-11-08'}],
            }),
            content_type='application/json',
            **self._headers(),
        )
        listed = self.client.get('/website-yonetimi/api/sinav-gorsel-arsiv/?q=AYT', **self._headers())
        self.assertEqual(listed.json()['data'][0]['kullanim'], 1)
        removed = self.client.delete(f'/website-yonetimi/api/sinav-gorsel-arsiv/{arsiv_id}/', **self._headers())
        self.assertEqual(removed.status_code, 200, removed.content)
        exam = SinavTakvim.objects.get(kurum=self.kurum)
        self.assertIsNone(exam.gorsel_arsiv_id)
        self.assertFalse(SinavGorselArsiv.objects.filter(pk=arsiv_id).exists())
