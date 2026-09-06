"""
Ders programı şablonları — kullanıcı ekrandaki haftalık programı bir adla kaydeder,
sonra istediği şubede yükler.

Şablonlar kurum bazlıdır; `SubeDersProgrami`'nin "şube başına tek aktif program"
kısıtından etkilenmezler.
"""
import json

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import DersProgramiSablonu
from apps.sube.domain.models import Sube

User = get_user_model()

LIST_URL = '/kutuphane/api/ders-programi/sablonlar/'


def _day(morning=(), afternoon=(), evening=()):
    def block(times):
        return {
            'ders_sayisi': len(times),
            'ders_suresi_dk': 40,
            'dersler': [
                {'ders_no': i + 1, 'baslangic': b, 'bitis': e}
                for i, (b, e) in enumerate(times)
            ],
            'molalar': [],
        }
    return {'MORNING': block(morning), 'AFTERNOON': block(afternoon), 'EVENING': block(evening)}


def _hafta_ici_program():
    bos = _day()
    dolu = _day(
        morning=[('09:00', '10:30'), ('10:45', '12:00')],
        afternoon=[('13:00', '14:30')],
    )
    return {str(i): (dolu if i < 5 else bos) for i in range(7)}


class DersProgramiSablonApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Şablon Kurum', kod='SAB')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='SABM')
        self.admin = User.objects.create_superuser(
            username='sablon_admin', email='sablon@test.local', password='test',
        )
        self.client.force_login(self.admin)
        self.headers = {'HTTP_X_KURUM_ID': str(self.kurum.id), 'HTTP_X_SUBE_ID': str(self.sube.id)}

    def _create(self, ad='Yaz Dönemi', **extra):
        payload = {'ad': ad, 'ders_saatleri': _hafta_ici_program(), **extra}
        return self.client.post(
            LIST_URL, data=json.dumps(payload), content_type='application/json', **self.headers,
        )

    def test_create_named_template(self):
        response = self._create('Yaz Dönemi', aciklama='Sabah + kısa öğle')
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()['data']
        self.assertEqual(data['ad'], 'Yaz Dönemi')
        self.assertEqual(data['aciklama'], 'Sabah + kısa öğle')
        # gun_bazli_aktiflik program JSON'undan türetilir.
        self.assertTrue(data['gun_bazli_aktiflik']['0']['aktif'])
        self.assertFalse(data['gun_bazli_aktiflik']['6']['aktif'])
        self.assertEqual(
            data['gun_bazli_aktiflik']['0']['periyotlar'], ['MORNING', 'AFTERNOON'],
        )

    def test_list_returns_only_own_kurum(self):
        self._create('Kış Dönemi')
        other = Kurum.objects.create(ad='Diğer Kurum', kod='DGR')
        DersProgramiSablonu.objects.create(
            kurum_id=other.id, ad='Yabancı', ders_saatleri=_hafta_ici_program(),
        )

        response = self.client.get(LIST_URL, **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        adlar = [row['ad'] for row in response.json()['data']]
        self.assertEqual(adlar, ['Kış Dönemi'])

    def test_duplicate_name_rejected(self):
        self.assertEqual(self._create('Yaz Dönemi').status_code, 201)
        response = self._create('yaz dönemi')
        self.assertEqual(response.status_code, 400)
        self.assertIn('zaten var', response.json()['error'])

    def test_blank_name_rejected(self):
        response = self._create('   ')
        self.assertEqual(response.status_code, 400)
        self.assertIn('zorunlu', response.json()['error'])

    def test_rename_and_overwrite(self):
        created = self._create('Yaz Dönemi').json()['data']
        detail_url = f"{LIST_URL}{created['id']}/"

        response = self.client.put(
            detail_url,
            data=json.dumps({'ad': 'Yaz Dönemi v2', 'ders_saatleri': _day(morning=[('08:00', '09:00')])}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()['data']
        self.assertEqual(data['ad'], 'Yaz Dönemi v2')
        # Tekil gün sözlüğü v1 kabul edilip 7 güne normalize edilmemeli değil —
        # normalize sonrası her gün anahtarı bulunmalı.
        self.assertEqual(sorted(data['ders_saatleri'].keys()), [str(i) for i in range(7)])

    def test_delete(self):
        created = self._create('Silinecek').json()['data']
        response = self.client.delete(f"{LIST_URL}{created['id']}/", **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(DersProgramiSablonu.objects.filter(id=created['id']).exists())

    def test_detail_of_other_kurum_is_404(self):
        other = Kurum.objects.create(ad='Diğer Kurum', kod='DGR2')
        yabanci = DersProgramiSablonu.objects.create(
            kurum_id=other.id, ad='Yabancı', ders_saatleri=_hafta_ici_program(),
        )
        response = self.client.get(f'{LIST_URL}{yabanci.id}/', **self.headers)
        self.assertEqual(response.status_code, 404)

    def test_non_admin_cannot_write(self):
        user = User.objects.create_user(username='duz_kullanici', password='test')
        self.client.force_login(user)
        response = self._create('İzinsiz')
        self.assertEqual(response.status_code, 403)
