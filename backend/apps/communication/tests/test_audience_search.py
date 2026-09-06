"""
Toplu gönderim — "Kişi ekle" araması (`/campaigns/audience/search/`).

Öğrenci arandığında velisi de sonuca girmeli ve satırlar aile bazında
gruplanmalı; kullanıcı grup içinden birden çok kişiyi birlikte seçebilsin diye
grup anahtarı (`group_key`) her satırda taşınır.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit, OgrenciVeli
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube

User = get_user_model()

URL = '/api/communication/campaigns/audience/search/'


def _assign_perms(user, *codes):
    role, _ = Role.objects.get_or_create(
        code='comm_audience_search_test',
        defaults={'name': 'Comm Audience Search Test', 'level': 100, 'is_system_role': True},
    )
    for code in codes:
        perm, _ = Permission.objects.get_or_create(
            code=code,
            defaults={'name': code, 'module': 'communication', 'permission_type': 'write'},
        )
        RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role})


class AudienceSearchGroupingTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.kurum = Kurum.objects.create(ad='Kitle Kurum', kod='KIT')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='KITM')
        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='12-A',
            kod='12A',
            egitim_yili=self.egitim_yili,
            aktif_mi=True,
        )
        self.user = User.objects.create_user(username='kitleci', password='test')
        _assign_perms(self.user, 'communication.read', 'communication.bulk')
        self.client.force_authenticate(user=self.user)
        self.headers = {'HTTP_X_SUBE_ID': str(self.sube.id)}

        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Kaya',
            telefon='05321112233',
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=self.ogrenci,
            sinif=self.sinif,
            egitim_yili=self.egitim_yili,
            kurum=self.kurum,
            sube=self.sube,
            okul_no='1234',
            aktif_mi=True,
        )
        self.anne = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Hatice',
            soyad='Kaya',
            telefon='05324445566',
            varsayilan=True,
        )
        self.baba = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='baba',
            ad='Mustafa',
            soyad='Kaya',
            telefon='05327778899',
        )

    def _search(self, q, **params):
        return self.client.get(
            URL, {'q': q, 'kurum_id': self.kurum.id, **params}, **self.headers,
        )

    def test_student_search_returns_parents_in_same_group(self):
        response = self._search('Zeynep')
        self.assertEqual(response.status_code, 200, response.data)

        keys = {(r['kind'], r['id']) for r in response.data['results']}
        self.assertIn(('ogrenci', self.ogrenci.id), keys)
        self.assertIn(('veli', self.anne.id), keys)
        self.assertIn(('veli', self.baba.id), keys)

        groups = response.data['groups']
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['key'], f'ogrenci:{self.ogrenci.id}')
        self.assertEqual(groups[0]['label'], 'Zeynep Kaya')
        self.assertEqual(groups[0]['meta'], '12-A')
        self.assertEqual(len(groups[0]['items']), 3)

    def test_parent_search_returns_student_and_siblings_of_same_family(self):
        response = self._search('Hatice')
        self.assertEqual(response.status_code, 200, response.data)

        groups = response.data['groups']
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['key'], f'ogrenci:{self.ogrenci.id}')
        keys = {(r['kind'], r['id']) for r in groups[0]['items']}
        self.assertIn(('ogrenci', self.ogrenci.id), keys)
        self.assertIn(('veli', self.anne.id), keys)
        # Aynı ailenin diğer velisi de gruba girer.
        self.assertIn(('veli', self.baba.id), keys)

    def test_rows_carry_group_key_and_match_flag(self):
        response = self._search('Zeynep')
        rows = {(r['kind'], r['id']): r for r in response.data['results']}

        ogrenci_row = rows[('ogrenci', self.ogrenci.id)]
        self.assertEqual(ogrenci_row['group_key'], f'ogrenci:{self.ogrenci.id}')
        self.assertTrue(ogrenci_row['matched'])
        self.assertEqual(ogrenci_row['role'], 'Öğrenci')

        anne_row = rows[('veli', self.anne.id)]
        self.assertEqual(anne_row['group_key'], f'ogrenci:{self.ogrenci.id}')
        self.assertFalse(anne_row['matched'])
        self.assertEqual(anne_row['role'], 'Anne')
        self.assertEqual(anne_row['ogrenci_name'], 'Zeynep Kaya')

    def test_group_ordering_puts_family_rows_adjacent(self):
        Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Zeynep',
            soyad='Demir',
            telefon='05330001122',
            aktif_mi=True,
        )
        response = self._search('Zeynep')
        results = response.data['results']
        group_order = []
        for row in results:
            if not group_order or group_order[-1] != row['group_key']:
                group_order.append(row['group_key'])
        # Her grup anahtarı listede yalnızca bir kez blok hâlinde geçmeli.
        self.assertEqual(len(group_order), len(set(group_order)))
        self.assertEqual(len(response.data['groups']), 2)

    def test_veli_kind_excluded_when_not_requested(self):
        response = self._search('Zeynep', kind='ogrenci')
        self.assertEqual(response.status_code, 200, response.data)
        kinds = {r['kind'] for r in response.data['results']}
        self.assertEqual(kinds, {'ogrenci'})

    def test_short_query_returns_empty_groups(self):
        response = self._search('Z')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['results'], [])
        self.assertEqual(response.data['groups'], [])
