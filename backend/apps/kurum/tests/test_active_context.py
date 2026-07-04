"""
Aktif bağlam seçimi aktif_mi alanını değiştirmemeli;
askıya alınmış şubeler my-subeler ve context set'ten dışlanmalı.
"""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube

User = get_user_model()


class ActiveContextApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Ctx Kurum', kod='CTX', aktif_mi=True)
        self.sube_a = Sube.objects.create(
            kurum=self.kurum, ad='Şube A', kod='CTX-A', aktif_mi=True,
        )
        self.sube_b = Sube.objects.create(
            kurum=self.kurum, ad='Şube B', kod='CTX-B', aktif_mi=True,
        )
        self.yil = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.user = User.objects.create_superuser(
            username='ctxadmin', email='ctx@test.com', password='test',
        )
        self.client.force_login(self.user)
        self.set_context_url = '/kurum-yonetimi/api/context/set/'

    def _post_context(self, **payload):
        return self.client.post(
            self.set_context_url,
            data=json.dumps(payload),
            content_type='application/json',
        )

    def test_set_active_context_does_not_change_other_subeler_aktif_mi(self):
        res = self._post_context(
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
            egitim_yili_id=self.yil.id,
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()['success'])

        self.sube_a.refresh_from_db()
        self.sube_b.refresh_from_db()
        self.assertTrue(self.sube_a.aktif_mi)
        self.assertTrue(self.sube_b.aktif_mi)

        res = self._post_context(
            kurum_id=self.kurum.id,
            sube_id=self.sube_b.id,
            egitim_yili_id=self.yil.id,
        )
        self.assertEqual(res.status_code, 200)

        self.sube_a.refresh_from_db()
        self.sube_b.refresh_from_db()
        self.assertTrue(self.sube_a.aktif_mi)
        self.assertTrue(self.sube_b.aktif_mi)

    def test_set_active_context_does_not_change_kurum_aktif_mi(self):
        other_kurum = Kurum.objects.create(ad='Diğer', kod='OTH', aktif_mi=True)

        res = self._post_context(
            kurum_id=self.kurum.id,
            sube_id=self.sube_a.id,
        )
        self.assertEqual(res.status_code, 200)

        self.kurum.refresh_from_db()
        other_kurum.refresh_from_db()
        self.assertTrue(self.kurum.aktif_mi)
        self.assertTrue(other_kurum.aktif_mi)

    def test_set_active_context_rejects_suspended_sube(self):
        self.sube_b.aktif_mi = False
        self.sube_b.save(update_fields=['aktif_mi'])

        res = self._post_context(kurum_id=self.kurum.id, sube_id=self.sube_b.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn('askıya', res.json()['error'].lower())

    def test_my_subeler_excludes_suspended_sube(self):
        self.sube_b.aktif_mi = False
        self.sube_b.save(update_fields=['aktif_mi'])

        res = self.client.get(
            f'/personel/api/my-subeler/?kurum_id={self.kurum.id}',
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertTrue(body['success'])
        ids = {s['id'] for s in body['subeler']}
        self.assertIn(self.sube_a.id, ids)
        self.assertNotIn(self.sube_b.id, ids)
