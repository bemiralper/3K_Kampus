"""Veli telefon çözümleme testleri."""
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.sube.domain.models import Sube
from apps.ogrenci.application.veli_contact import default_veli_contact, list_outbound_veliler
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli


class VeliContactTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TKV')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='TKV')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Öğrenci',
            aktif_mi=True,
            veli_telefon='0532 999 88 77',
            veli_ad_soyad='Ayşe Veli',
        )

    def test_legacy_phone_used_when_veli_record_empty(self):
        veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Veli',
            telefon='',
            varsayilan=True,
        )
        pairs = list_outbound_veliler(self.ogrenci)
        self.assertEqual(len(pairs), 1)
        self.assertEqual(pairs[0][0].id, veli.id)
        self.assertIn('532', pairs[0][1].replace(' ', ''))

    def test_default_veli_contact_from_legacy(self):
        OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Veli',
            telefon='',
            varsayilan=True,
        )
        contact = default_veli_contact(self.ogrenci.id)
        self.assertIsNotNone(contact)
        self.assertTrue(contact['telefon'])

    def test_creates_veli_from_legacy_when_missing(self):
        pairs = list_outbound_veliler(self.ogrenci)
        self.assertEqual(len(pairs), 1)
        self.assertTrue(OgrenciVeli.objects.filter(ogrenci=self.ogrenci).exists())
