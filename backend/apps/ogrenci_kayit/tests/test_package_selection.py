"""Paket seçim kuralları testleri."""
from django.test import SimpleTestCase

from apps.ogrenci_kayit.application.package_selection import (
    legacy_package_payload_to_selection,
    validate_student_selection,
)


class PackageSelectionRulesTest(SimpleTestCase):
    def test_premium_blocks_ozel_ders(self):
        selection = {
            'parent': {'tur': 'premium', 'id': 1},
            'ozel_ders_ids': [5],
            'deneme_paketi_id': None,
            'yayin_paketi_ids': [],
            'ek_hizmet_ids': [],
        }
        errors = validate_student_selection(selection)
        self.assertTrue(any('özel ders' in e.lower() for e in errors))

    def test_requires_at_least_one_item(self):
        selection = {
            'parent': None,
            'ozel_ders_ids': [],
            'deneme_paketi_id': None,
            'yayin_paketi_ids': [],
            'ek_hizmet_ids': [],
        }
        errors = validate_student_selection(selection)
        self.assertIn('En az bir paket veya hizmet seçiniz', errors)

    def test_legacy_deneme_array_converted(self):
        payload = {
            'paketler': ['grup_dersleri_3'],
            'ek_hizmet_ids': [],
            'deneme_paketi_ids': [7],
            'yayin_paketi_ids': [],
        }
        sel = legacy_package_payload_to_selection(payload)
        self.assertEqual(sel['parent'], {'tur': 'grup_dersi', 'id': 3})
        self.assertEqual(sel['deneme_paketi_id'], 7)

    def test_legacy_deneme_single_id(self):
        payload = {
            'paketler': [],
            'ek_hizmet_ids': [2],
            'deneme_paketi_id': 4,
            'yayin_paketi_ids': [],
        }
        sel = legacy_package_payload_to_selection(payload)
        self.assertEqual(sel['deneme_paketi_id'], 4)
        self.assertEqual(sel['ek_hizmet_ids'], [2])
