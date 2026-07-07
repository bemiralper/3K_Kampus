"""
Kimlik birleştirme testleri.
"""
from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from apps.kimlik.application.kisi_service import KisiService
from apps.kimlik.application.resolver import KimlikResolver
from apps.kimlik.domain.models import Kisi
from apps.kimlik.domain.phone import normalize_phone
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube


class PhoneUtilsTests(TestCase):
    def test_normalize_phone(self):
        self.assertEqual(normalize_phone('532 123 45 67'), '05321234567')
        self.assertEqual(normalize_phone(''), '')


class KimlikResolverTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TST', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK', aktif_mi=True)
        self.personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='12345678901',
            ad='Ali',
            soyad='Yilmaz',
            cep_telefon='05321234567',
            aktif_mi=True,
        )
        KisiService.link_personel(self.personel)

    def test_resolve_personel_by_tc(self):
        resolver = KimlikResolver(kurum_id=self.kurum.id)
        result = resolver.resolve(tc='12345678901', context='personel')
        self.assertTrue(result['found'])
        self.assertEqual(len(result['roller']), 1)
        self.assertEqual(result['roller'][0]['tip'], 'personel')

    def test_resolve_personel_by_phone(self):
        resolver = KimlikResolver(kurum_id=self.kurum.id)
        result = resolver.resolve(telefon='5321234567', context='personel')
        self.assertTrue(result['found'])

    def test_cross_role_personel_and_veli(self):
        ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='98765432109',
            ad='Ayse',
            soyad='Demir',
            aktif_mi=True,
        )
        KisiService.link_ogrenci(ogrenci)
        veli = OgrenciVeli.objects.create(
            ogrenci=ogrenci,
            veli_turu='anne',
            tc_kimlik_no='12345678901',
            ad='Ali',
            soyad='Yilmaz',
            telefon='05321234567',
        )
        KisiService.link_veli(veli, self.personel.kisi)

        resolver = KimlikResolver(kurum_id=self.kurum.id)
        result = resolver.resolve(tc='12345678901', context='veli')
        self.assertTrue(result['found'])
        tips = {r['tip'] for r in result['roller']}
        self.assertIn('personel', tips)
        self.assertIn('veli', tips)


class KimlikApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username='admin@test.com', password='pass')
        self.kurum = Kurum.objects.create(ad='API Kurum', kod='API', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Sube', kod='SB', aktif_mi=True)
        self.client.force_authenticate(user=self.user)

    def test_resolve_endpoint_without_match(self):
        response = self.client.get('/api/kimlik/resolve/?tc=12345678901')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['found'])

    def test_resolve_endpoint_with_header(self):
        Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='11111111111',
            ad='Test',
            soyad='User',
            aktif_mi=True,
        )
        response = self.client.get(
            '/api/kimlik/resolve/?tc=11111111111&context=personel',
            HTTP_X_KURUM_ID=str(self.kurum.id),
            HTTP_X_SUBE_ID=str(self.sube.id),
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['found'])


class KimlikPhase5Tests(TestCase):
    """Phase 5 — tekillik zorunluluğu ve 409 çakışmaları."""

    def setUp(self):
        self.kurum = Kurum.objects.create(ad='P5 Kurum', kod='P5', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Sube', kod='P5S', aktif_mi=True)
        self.kisi = KisiService.create_from_profile(
            self.kurum.id,
            {'tc_kimlik_no': '22222222222', 'ad': 'Mevcut', 'soyad': 'Kisi', 'telefon': '05321111111'},
        )

    def test_assert_unique_duplicate_tc(self):
        from apps.kimlik.exceptions import KimlikConflictError

        with self.assertRaises(KimlikConflictError) as ctx:
            KisiService.assert_unique(self.kurum.id, '22222222222', None)
        self.assertEqual(ctx.exception.code, 'duplicate_tc')

    def test_assert_unique_duplicate_telefon(self):
        from apps.kimlik.exceptions import KimlikConflictError

        with self.assertRaises(KimlikConflictError) as ctx:
            KisiService.assert_unique(self.kurum.id, None, '5321111111')
        self.assertEqual(ctx.exception.code, 'duplicate_telefon')

    def test_assert_unique_phone_tc_mismatch(self):
        from apps.kimlik.exceptions import KimlikConflictError

        with self.assertRaises(KimlikConflictError) as ctx:
            KisiService.assert_unique(self.kurum.id, '33333333333', '5321111111')
        self.assertEqual(ctx.exception.code, 'phone_tc_mismatch')

    def test_assert_no_duplicate_personel(self):
        from apps.kimlik.application.enforcement import assert_no_duplicate_personel
        from apps.kimlik.exceptions import KimlikConflictError

        Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='44444444444',
            ad='Dup',
            soyad='Personel',
            aktif_mi=True,
        )
        with self.assertRaises(KimlikConflictError) as ctx:
            assert_no_duplicate_personel(self.kurum.id, '44444444444')
        self.assertEqual(ctx.exception.code, 'duplicate_personel_tc')

    def test_resolve_engellenen_phone_tc_mismatch(self):
        from apps.kimlik.application.resolver import KimlikResolver

        personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='55555555555',
            ad='Tel',
            soyad='Sahibi',
            cep_telefon='05329998877',
            aktif_mi=True,
        )
        KisiService.link_personel(personel)

        resolver = KimlikResolver(kurum_id=self.kurum.id)
        result = resolver.resolve(tc='66666666666', telefon='5329998877', context='personel')
        self.assertTrue(result['found'])
        self.assertTrue(result['engellenen'])
        self.assertIn('telefon', result['engellenen_mesaj'].lower())

    def test_kimlik_conflict_error_as_dict(self):
        from apps.kimlik.exceptions import KimlikConflictError

        err = KimlikConflictError('mesaj', code='duplicate_tc', details={'kisi_id': 1})
        payload = err.as_dict()
        self.assertFalse(payload['success'])
        self.assertEqual(payload['error'], 'mesaj')
        self.assertEqual(payload['code'], 'duplicate_tc')
        self.assertEqual(payload['details']['kisi_id'], 1)


class BackfillKisiTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Backfill Kurum', kod='BF', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK', aktif_mi=True)

    def test_backfill_skips_phone_conflict_veli(self):
        from io import StringIO

        from django.core.management import call_command

        from apps.kimlik.management.commands.backfill_kisi import build_conflict_skip_sets, collect_conflicts

        ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='11111111111',
            ad='Temiz',
            soyad='Ogrenci',
            telefon='05329998877',
            aktif_mi=True,
        )
        ogrenci_cakisma = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='33333333333',
            ad='Gamze',
            soyad='Sarigol',
            telefon='05321112233',
            aktif_mi=True,
        )
        Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            tc_kimlik_no='44444444444',
            ad='Personel',
            soyad='Tel',
            cep_telefon='05321112233',
            aktif_mi=True,
        )
        OgrenciVeli.objects.create(
            ogrenci=ogrenci_cakisma,
            veli_turu='baba',
            tc_kimlik_no='22222222222',
            ad='Baba',
            soyad='Veli',
            telefon='05321112233',
        )

        conflicts = collect_conflicts(kurum_id=self.kurum.id)
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]['tip'], 'telefon_farkli_tc')

        conflict_tcs, conflict_phones, conflict_entities = build_conflict_skip_sets(conflicts)
        self.assertIn('05321112233', conflict_phones)

        out = StringIO()
        call_command('backfill_kisi', kurum_id=self.kurum.id, stdout=out)
        output = out.getvalue()

        ogrenci.refresh_from_db()
        ogrenci_cakisma.refresh_from_db()
        veli = ogrenci_cakisma.veliler.first()
        personel = Personel.objects.get(tc_kimlik_no='44444444444')

        self.assertIsNotNone(ogrenci.kisi_id)
        self.assertIsNone(ogrenci_cakisma.kisi_id)
        self.assertIsNone(personel.kisi_id)
        self.assertIsNone(veli.kisi_id)
        self.assertIn('Backfill tamamlandı', output)
