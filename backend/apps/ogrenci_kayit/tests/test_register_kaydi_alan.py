"""Doğrudan kayıt kaydi_alan alanını doldurur."""
import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_paketleri.models import EkHizmet
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import OgrenciKayit
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()


class DirectRegistrationKaydiAlanTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Kayıt Alan Kurum', kod='KAL')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KAL-M')
        self.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='8. Sınıf', kod='8',
        )
        self.hizmet = EkHizmet.objects.create(
            ad='Kütüphane',
            kod='KUT',
            hizmet_turu='kutuphane',
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            brut_fiyat=1000,
            kdv_orani=10,
        )
        self.user = User.objects.create_user(
            username='kayit_memur', password='x', first_name='Can', last_name='Memur',
        )
        UserRole.objects.create(
            user=self.user,
            role=Role.objects.get(code='kurum_yoneticisi'),
            kurum=self.kurum,
            must_change_password=False,
        )
        self.client = Client()
        self.client.force_login(self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.ey.id),
        }

    def test_register_sets_kaydi_alan(self):
        res = self.client.post(
            '/api/ogrenci-kayit/register/',
            data=json.dumps({
                'student': {
                    'tc_kimlik_no': '12345678901',
                    'ad': 'Zeynep',
                    'soyad': 'Demir',
                    'dogum_tarihi': '2012-03-01',
                },
                'enrollment': {
                    'egitim_yili': self.ey.id,
                    'sinif_seviyesi': self.seviye.id,
                },
                'address': {},
                'guardians': [],
                'package': {'ek_hizmet_ids': [self.hizmet.id]},
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content)
        kayit = OgrenciKayit.objects.get(ogrenci__tc_kimlik_no='12345678901')
        self.assertEqual(kayit.kaydi_alan_id, self.user.id)
