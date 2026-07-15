"""Sözleşme helper — şube görevlendirme izolasyonu."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.personel.domain.sozlesme_models import PersonelSozlesme, SozlesmeDurumu, SozlesmeTuru
from apps.roller.models import Permission, Role, RolePermission, UserRole
from apps.sube.domain.models import Sube

User = get_user_model()


def _assign_personel_manage(user, kurum):
    role, _ = Role.objects.get_or_create(
        code='personel_soz_manage_test',
        defaults={'name': 'Personel Soz Manage Test', 'level': 100, 'is_system_role': True},
    )
    perm, _ = Permission.objects.get_or_create(
        code='personel.manage',
        defaults={'name': 'personel.manage', 'module': 'personel', 'permission_type': 'manage'},
    )
    RolePermission.objects.get_or_create(role=role, permission=perm)
    UserRole.objects.update_or_create(user=user, defaults={'role': role, 'kurum': kurum})


class SozlesmeSubeHelperTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('soz_admin', 'soz@test.com', 'pass')
        self.kurum = Kurum.objects.create(ad='Test', kod='TST')
        _assign_personel_manage(self.user, self.kurum)
        self.client.force_login(self.user)

        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Keşif', kod='KSF')
        self.ey = EgitimYili.objects.create(
            baslangic_yil=2026, bitis_yil=2027, aktif_mi=True,
        )
        self.rol, _ = Role.objects.get_or_create(
            code='ogretmen_soz',
            defaults={'name': 'Öğretmen', 'level': 50, 'is_system_role': True},
        )

        self.p_only_a = Personel.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Ali', soyad='A', aktif_mi=True,
        )
        self.p_both = Personel.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Beste', soyad='B', aktif_mi=True,
        )
        self.p_only_b = Personel.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='Cem', soyad='C', aktif_mi=True,
        )

        for p, sube in (
            (self.p_only_a, self.sube_a),
            (self.p_both, self.sube_a),
            (self.p_both, self.sube_b),
            (self.p_only_b, self.sube_b),
        ):
            PersonelGorevlendirme.objects.create(
                personel=p,
                kurum=self.kurum,
                egitim_yili=self.ey,
                gorev_sube=sube,
                rol=self.rol,
                aktif_mi=True,
            )

        PersonelSozlesme.objects.create(
            kurum=self.kurum,
            personel=self.p_both,
            egitim_yili=self.ey,
            sube=self.sube_a,
            sozlesme_turu=SozlesmeTuru.TAM_ZAMANLI,
            durum=SozlesmeDurumu.AKTIF,
            baslangic_tarihi='2026-09-01',
            bitis_tarihi='2027-08-31',
        )

    def _headers(self, sube):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.ey.id),
        }

    def test_helper_lists_only_gorev_sube_personel(self):
        res = self.client.get('/personel/api/sozlesmeler/helper-data/', **self._headers(self.sube_a))
        self.assertEqual(res.status_code, 200)
        ids = {p['id'] for p in res.json()['data']['personeller']}
        self.assertIn(self.p_only_a.id, ids)
        # p_both has contract in A → excluded from A helper
        self.assertNotIn(self.p_both.id, ids)
        self.assertNotIn(self.p_only_b.id, ids)

        res_b = self.client.get('/personel/api/sozlesmeler/helper-data/', **self._headers(self.sube_b))
        ids_b = {p['id'] for p in res_b.json()['data']['personeller']}
        self.assertNotIn(self.p_only_a.id, ids_b)
        self.assertIn(self.p_both.id, ids_b)
        self.assertIn(self.p_only_b.id, ids_b)

    def test_helper_warns_other_sube_contract(self):
        res = self.client.get('/personel/api/sozlesmeler/helper-data/', **self._headers(self.sube_b))
        self.assertEqual(res.status_code, 200)
        both = next(p for p in res.json()['data']['personeller'] if p['id'] == self.p_both.id)
        self.assertIsNotNone(both.get('uyari'))
        self.assertEqual(both['diger_sube_sozlesme']['sube_id'], self.sube_a.id)

    def test_same_sube_contract_excludes_from_helper(self):
        res = self.client.get('/personel/api/sozlesmeler/helper-data/', **self._headers(self.sube_a))
        ids = {p['id'] for p in res.json()['data']['personeller']}
        self.assertNotIn(self.p_both.id, ids)
