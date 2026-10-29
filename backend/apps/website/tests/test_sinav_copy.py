"""Sınav takvimi — başka güne kopyalama ve görsel yeniden kullanma."""
import json
from datetime import date, time
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase
from PIL import Image

from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.kurum.domain.models import Kurum
from apps.website.models import SinavTakvim

User = get_user_model()


def _jpeg_bytes(color):
    buf = BytesIO()
    Image.new('RGB', (20, 12), color).save(buf, format='JPEG')
    return buf.getvalue()


class SinavCopyApiTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Site Kurum', kod='SITE', aktif_mi=True)
        self.user = User.objects.create_superuser(
            username='siteadmin', email='site@test.com', password='x',
        )
        self.client = Client()
        self.client.force_login(self.user)
        self.exam = SinavTakvim.objects.create(
            kurum=self.kurum,
            tur='TYT',
            tarih=date(2026, 6, 21),
            saat=time(10, 0),
            saat_bitis=time(13, 15),
            kapsam='turkiye_geneli',
            baslik='Çap Yayınları TYT Deneme',
            yayin_adi='Çap',
            aciklama='Genel deneme',
        )
        self.exam.gorsel.save('kapak.jpg', ContentFile(_jpeg_bytes('red')), save=True)

    def _post(self, path, payload):
        return self.client.post(
            path,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )

    def test_copy_to_another_day_keeps_image(self):
        res = self._post(
            f'/website-yonetimi/api/sinav-takvim/{self.exam.id}/kopyala/',
            {'tarih': '2026-07-04', 'saat': '11:00', 'saat_bitis': '14:00'},
        )
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertTrue(body['success'])
        self.assertEqual(body['data']['tarih'], '2026-07-04')
        self.assertEqual(body['data']['baslik'], self.exam.baslik)
        self.assertEqual(body['data']['saat'], '11:00')
        self.assertTrue(body['data']['gorsel_url'])

        clone = SinavTakvim.objects.get(pk=body['data']['id'])
        self.exam.refresh_from_db()
        self.assertNotEqual(clone.gorsel.name, self.exam.gorsel.name)
        self.assertTrue(clone.gorsel.storage.exists(clone.gorsel.name))
        self.assertTrue(self.exam.gorsel.storage.exists(self.exam.gorsel.name))
        self.assertEqual(SinavTakvim.objects.filter(kurum=self.kurum).count(), 2)

    def test_reuse_image_from_another_exam(self):
        target = SinavTakvim.objects.create(
            kurum=self.kurum,
            tur='TYT',
            tarih=date(2026, 8, 1),
            baslik='Çap Yayınları TYT Deneme',
            yayin_adi='Çap',
        )
        res = self._post(
            f'/website-yonetimi/api/sinav-takvim/{target.id}/gorsel-kopyala/',
            {'kaynak_id': self.exam.id},
        )
        self.assertEqual(res.status_code, 200, res.content)
        target.refresh_from_db()
        self.exam.refresh_from_db()
        self.assertTrue(target.gorsel)
        self.assertNotEqual(target.gorsel.name, self.exam.gorsel.name)
        self.assertTrue(target.gorsel.storage.exists(target.gorsel.name))


class SinavTakvimOlcmePermissionTests(TestCase):
    """Deneme takvimi Ölçme menüsünden düzenlenir; diğer site içerikleri açılmaz."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Ölçme Kurum', kod='OLC', aktif_mi=True)
        self.user = User.objects.create_user(username='olcmeuser', password='x')
        self.client = Client()
        self.client.force_login(self.user)

    def _post(self, path, payload):
        return self.client.post(
            path,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )

    def test_user_without_olcme_write_cannot_create(self):
        res = self._post('/website-yonetimi/api/sinav-takvim/', {
            'tur': 'LGS',
            'tarih': '2026-10-04',
            'baslik': 'LGS Deneme',
        })
        self.assertEqual(res.status_code, 403, res.content)
        self.assertEqual(SinavTakvim.objects.filter(kurum=self.kurum).count(), 0)

    def test_olcme_write_can_create_update_and_delete(self):
        grant_olcme_write(self.user, self.kurum)
        res = self._post('/website-yonetimi/api/sinav-takvim/', {
            'tur': 'TYT',
            'tarih': '2026-11-08',
            'baslik': 'TYT Deneme',
            'yayin_adi': '3K',
            'kapsam': 'yerel',
        })
        self.assertEqual(res.status_code, 201, res.content)
        exam_id = res.json()['data']['id']

        updated = self.client.put(
            f'/website-yonetimi/api/sinav-takvim/{exam_id}/',
            data=json.dumps({'baslik': 'TYT Deneme 2'}),
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(updated.status_code, 200, updated.content)
        self.assertEqual(updated.json()['data']['baslik'], 'TYT Deneme 2')

        deleted = self.client.delete(
            f'/website-yonetimi/api/sinav-takvim/{exam_id}/',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertFalse(SinavTakvim.objects.filter(pk=exam_id).exists())

    def test_olcme_write_cannot_edit_other_website_content(self):
        grant_olcme_write(self.user, self.kurum)
        res = self._post('/website-yonetimi/api/neden-kartlari/', {
            'baslik': 'Neden',
            'aciklama': 'Açıklama',
        })
        self.assertEqual(res.status_code, 403, res.content)


class SinavGunlerApiTests(TestCase):
    """Aynı sınav birden fazla günde uygulanır; kopya bağımsız kalır."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Gün Kurum', kod='GUN', aktif_mi=True)
        self.user = User.objects.create_superuser(
            username='gunadmin', email='gun@test.com', password='x',
        )
        self.client = Client()
        self.client.force_login(self.user)

    def _post(self, path, payload):
        return self.client.post(
            path,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )

    def _patch(self, path, payload):
        return self.client.patch(
            path,
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )

    def _payload(self, **overrides):
        data = {
            'tur': 'TYT',
            'kapsam': 'turkiye_geneli',
            'baslik': 'Bilgi Sarmal TYT',
            'yayin_adi': 'Bilgi Sarmal',
            'aciklama': 'Genel deneme',
            'gunler': [
                {'tarih': '2026-06-20', 'saat': '10:00', 'saat_bitis': '13:15'},
                {'tarih': '2026-06-21', 'saat': '10:00', 'saat_bitis': '13:15'},
            ],
        }
        data.update(overrides)
        return data

    def test_create_two_days_shares_group(self):
        res = self._post('/website-yonetimi/api/sinav-takvim/', self._payload())
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()['data']
        self.assertEqual(len(body['gunler']), 2)
        self.assertEqual(body['gunler'][0]['tarih'], '2026-06-20')
        self.assertEqual(body['gunler'][1]['tarih'], '2026-06-21')
        self.assertTrue(body['grup_id'])
        rows = list(SinavTakvim.objects.filter(kurum=self.kurum).order_by('tarih'))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].grup_id, rows[1].grup_id)
        self.assertEqual(rows[0].baslik, rows[1].baslik)

    def test_single_day_post_stays_ungrouped(self):
        res = self._post('/website-yonetimi/api/sinav-takvim/', {
            'tur': 'LGS',
            'tarih': '2026-10-04',
            'baslik': 'LGS Deneme',
        })
        self.assertEqual(res.status_code, 201, res.content)
        row = SinavTakvim.objects.get(kurum=self.kurum)
        self.assertIsNone(row.grup_id)

    def test_update_title_and_replace_days(self):
        created = self._post('/website-yonetimi/api/sinav-takvim/', self._payload()).json()['data']
        kept = created['gunler'][0]
        res = self._patch(f"/website-yonetimi/api/sinav-takvim/{created['id']}/", {
            'tur': 'TYT',
            'baslik': 'Bilgi Sarmal TYT 2',
            'yayin_adi': 'Bilgi Sarmal',
            'aciklama': 'Genel deneme',
            'kapsam': 'yerel',
            'gunler': [
                {'id': kept['id'], 'tarih': '2026-06-20', 'saat': '11:00', 'saat_bitis': '14:00'},
                {'tarih': '2026-06-27', 'saat': '11:00', 'saat_bitis': '14:00'},
            ],
        })
        self.assertEqual(res.status_code, 200, res.content)
        rows = list(SinavTakvim.objects.filter(kurum=self.kurum).order_by('tarih'))
        self.assertEqual([row.tarih.isoformat() for row in rows], ['2026-06-20', '2026-06-27'])
        self.assertTrue(all(row.baslik == 'Bilgi Sarmal TYT 2' for row in rows))
        self.assertTrue(all(row.kapsam == 'yerel' for row in rows))
        self.assertEqual(rows[0].grup_id, rows[1].grup_id)
        self.assertEqual(rows[0].saat.strftime('%H:%M'), '11:00')

    def test_delete_group_removes_every_day(self):
        created = self._post('/website-yonetimi/api/sinav-takvim/', self._payload()).json()['data']
        res = self.client.delete(
            f"/website-yonetimi/api/sinav-takvim/{created['id']}/?tum_gunler=1",
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(SinavTakvim.objects.filter(kurum=self.kurum).count(), 0)

    def test_duplicate_day_is_rejected(self):
        res = self._post('/website-yonetimi/api/sinav-takvim/', self._payload(gunler=[
            {'tarih': '2026-06-20', 'saat': '10:00', 'saat_bitis': '13:00'},
            {'tarih': '2026-06-20', 'saat': '10:00', 'saat_bitis': '13:00'},
        ]))
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(SinavTakvim.objects.filter(kurum=self.kurum).count(), 0)

    def test_copy_stays_outside_the_group(self):
        created = self._post('/website-yonetimi/api/sinav-takvim/', self._payload()).json()['data']
        res = self._post(
            f"/website-yonetimi/api/sinav-takvim/{created['id']}/kopyala/",
            {'tarih': '2026-07-04'},
        )
        self.assertEqual(res.status_code, 201, res.content)
        clone = SinavTakvim.objects.get(pk=res.json()['data']['id'])
        self.assertIsNone(clone.grup_id)
        self.assertEqual(
            SinavTakvim.objects.filter(kurum=self.kurum, grup_id=created['grup_id']).count(),
            2,
        )

    def test_uploaded_image_reaches_every_day(self):
        created = self._post('/website-yonetimi/api/sinav-takvim/', self._payload()).json()['data']
        upload = self.client.post(
            f"/website-yonetimi/api/sinav-takvim/{created['id']}/upload/",
            {'gorsel': SimpleUploadedFile('kapak.jpg', _jpeg_bytes('blue'), content_type='image/jpeg')},
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(upload.status_code, 200, upload.content)
        self.assertIn('?v=', upload.json()['data']['gorsel_url'])
        rows = list(SinavTakvim.objects.filter(kurum=self.kurum))
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row.gorsel for row in rows))
        self.assertNotEqual(rows[0].gorsel.name, rows[1].gorsel.name)

    def test_delete_image_clears_every_day(self):
        created = self._post('/website-yonetimi/api/sinav-takvim/', self._payload()).json()['data']
        upload = self.client.post(
            f"/website-yonetimi/api/sinav-takvim/{created['id']}/upload/",
            {'gorsel': SimpleUploadedFile('kapak.jpg', _jpeg_bytes('blue'), content_type='image/jpeg')},
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(upload.status_code, 200, upload.content)
        res = self.client.delete(
            f"/website-yonetimi/api/sinav-takvim/{created['id']}/gorsel/",
            HTTP_X_KURUM_ID=str(self.kurum.id),
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIsNone(res.json()['data']['gorsel_url'])
        rows = list(SinavTakvim.objects.filter(kurum=self.kurum))
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(not row.gorsel for row in rows))
