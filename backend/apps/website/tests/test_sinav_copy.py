"""Sınav takvimi — başka güne kopyalama ve görsel yeniden kullanma."""
import json
from datetime import date, time
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import Client, TestCase
from PIL import Image

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
