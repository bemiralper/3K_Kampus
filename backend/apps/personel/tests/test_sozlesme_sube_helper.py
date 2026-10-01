"""Sözleşme helper — şube görevlendirme izolasyonu."""
from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.personel.domain.models import Personel, PersonelGorevlendirme
from apps.personel.domain.sozlesme_models import (
    AylikHakedis,
    PersonelSozlesme,
    SozlesmeDurumu,
    SozlesmeTuru,
)
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

    def test_bordro_list_follows_active_sube(self):
        soz_a = PersonelSozlesme.objects.get(personel=self.p_both, sube=self.sube_a)
        soz_b = PersonelSozlesme.objects.create(
            kurum=self.kurum,
            personel=self.p_only_b,
            egitim_yili=self.ey,
            sube=self.sube_b,
            sozlesme_turu=SozlesmeTuru.TAM_ZAMANLI,
            durum=SozlesmeDurumu.AKTIF,
            baslangic_tarihi='2026-09-01',
            bitis_tarihi='2027-08-31',
        )
        AylikHakedis.objects.create(sozlesme=soz_a, yil=2026, ay=9, sabit_maas=1000)
        AylikHakedis.objects.create(sozlesme=soz_b, yil=2026, ay=9, sabit_maas=2000)

        res = self.client.get(
            '/personel/api/sozlesmeler/hakedis/?yil=2026&ay=9',
            **self._headers(self.sube_b),
        )
        self.assertEqual(res.status_code, 200)
        ids = {row['personel_id'] for row in res.json()['data']}
        self.assertEqual(ids, {self.p_only_b.id})

        stats = self.client.get(
            '/personel/api/sozlesmeler/hakedis/stats/?yil=2026&ay=9',
            **self._headers(self.sube_b),
        )
        self.assertEqual(stats.json()['data']['kayit_sayisi'], 1)

        created = self.client.post(
            '/personel/api/sozlesmeler/hakedis/toplu-olustur/',
            data='{"yil": 2026, "ay": 10}',
            content_type='application/json',
            **self._headers(self.sube_b),
        )
        self.assertEqual(created.status_code, 200)
        self.assertFalse(
            AylikHakedis.objects.filter(sozlesme=soz_a, yil=2026, ay=10).exists()
        )
        self.assertTrue(
            AylikHakedis.objects.filter(sozlesme=soz_b, yil=2026, ay=10).exists()
        )

    def test_avans_split_and_future_lump_hit_the_target_month(self):
        soz = PersonelSozlesme.objects.create(
            kurum=self.kurum,
            personel=self.p_only_b,
            egitim_yili=self.ey,
            sube=self.sube_b,
            sozlesme_turu=SozlesmeTuru.TAM_ZAMANLI,
            durum=SozlesmeDurumu.AKTIF,
            baslangic_tarihi='2026-09-01',
            bitis_tarihi='2027-08-31',
            net_maas=40000,
        )
        ekim = AylikHakedis.objects.create(
            sozlesme=soz, yil=2026, ay=10, sabit_maas=40000,
        )
        ekim.hesapla()
        ekim.save()

        split = self.client.post(
            '/personel/api/sozlesmeler/avans/',
            data='{"sozlesme_id": %d, "tarih": "2026-10-01", "tutar": "20000", "aciklama": "Avans", "mahsup_yil": 2026, "mahsup_ay": 10, "taksit_sayisi": 4}' % soz.id,
            content_type='application/json',
            **self._headers(self.sube_b),
        )
        self.assertEqual(split.status_code, 201, split.content)
        ekim.refresh_from_db()
        self.assertEqual(ekim.avans, 5000)
        self.assertEqual(ekim.net_hakedis, 35000)
        self.assertFalse(AylikHakedis.objects.filter(sozlesme=soz, yil=2027, ay=1).exists())

        created = self.client.post(
            '/personel/api/sozlesmeler/hakedis/toplu-olustur/',
            data='{"yil": 2027, "ay": 1}',
            content_type='application/json',
            **self._headers(self.sube_b),
        )
        self.assertEqual(created.status_code, 200, created.content)
        ocak = AylikHakedis.objects.get(sozlesme=soz, yil=2027, ay=1)
        self.assertEqual(ocak.avans, 5000)

        lump = self.client.post(
            '/personel/api/sozlesmeler/avans/',
            data='{"sozlesme_id": %d, "tarih": "2026-10-01", "tutar": "8000", "aciklama": "3 ay sonra", "mahsup_yil": 2027, "mahsup_ay": 4, "taksit_sayisi": 1}' % soz.id,
            content_type='application/json',
            **self._headers(self.sube_b),
        )
        self.assertEqual(lump.status_code, 201, lump.content)
        ekim.refresh_from_db()
        self.assertEqual(ekim.avans, 5000)

        self.client.post(
            '/personel/api/sozlesmeler/hakedis/toplu-olustur/',
            data='{"yil": 2027, "ay": 4}',
            content_type='application/json',
            **self._headers(self.sube_b),
        )
        nisan = AylikHakedis.objects.get(sozlesme=soz, yil=2027, ay=4)
        self.assertEqual(nisan.avans, 8000)

    def test_rapor_uses_education_year_period_and_months(self):
        soz = PersonelSozlesme.objects.get(personel=self.p_both, sube=self.sube_a)

        def bordro(yil, ay, tutar):
            row = AylikHakedis.objects.create(sozlesme=soz, yil=yil, ay=ay, sabit_maas=tutar)
            row.hesapla()
            row.save()

        bordro(2026, 9, 1000)
        bordro(2027, 1, 2000)
        bordro(2027, 2, 8000)
        bordro(2025, 9, 99999)

        base = f'/personel/api/sozlesmeler/rapor/yillik/?egitim_yili_id={self.ey.id}'
        yillik = self.client.get(f'{base}&kapsam=yillik', **self._headers(self.sube_a))
        self.assertEqual(yillik.status_code, 200, yillik.content)
        data = yillik.json()['data']
        self.assertEqual(data['genel_brut'], 11000.0)
        self.assertEqual(data['ay_sayisi'], 12)
        self.assertEqual(data['aylik'][0]['yil'], 2026)
        self.assertEqual(data['aylik'][0]['ay'], 9)
        self.assertEqual(data['aylik'][-1]['ay'], 8)

        donem = self.client.get(f'{base}&kapsam=donem&donem=1', **self._headers(self.sube_a))
        self.assertEqual(donem.json()['data']['genel_brut'], 3000.0)
        self.assertEqual(donem.json()['data']['ay_sayisi'], 5)

        aylar = self.client.get(f'{base}&kapsam=aylar&aylar=2027-02', **self._headers(self.sube_a))
        self.assertEqual(aylar.json()['data']['genel_brut'], 8000.0)

        disari = self.client.get(f'{base}&kapsam=aylar&aylar=2025-09', **self._headers(self.sube_a))
        self.assertEqual(disari.status_code, 400)

    def test_same_sube_contract_excludes_from_helper(self):
        res = self.client.get('/personel/api/sozlesmeler/helper-data/', **self._headers(self.sube_a))
        ids = {p['id'] for p in res.json()['data']['personeller']}
        self.assertNotIn(self.p_both.id, ids)
