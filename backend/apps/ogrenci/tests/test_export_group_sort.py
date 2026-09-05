"""Öğrenci listesi dışa aktarma — gruplama ve sıralama yardımcıları."""
from django.test import SimpleTestCase

from apps.ogrenci.interfaces.list_helpers import (
    EXPORT_GROUP_BY_VALUES,
    SORT_MAP,
    _normalize_export_keys,
    _prepare_export_rows,
    group_export_rows,
)


class ExportGroupSortHelpersTest(SimpleTestCase):
    def test_sort_map_includes_export_keys(self):
        self.assertIn('name_asc', SORT_MAP)
        self.assertIn('okul_no_asc', SORT_MAP)
        self.assertIn('sinif_asc', SORT_MAP)
        # "Şube" sıralaması sınıf adına gider (kurum şubesi değil)
        self.assertEqual(SORT_MAP['sinif_asc'][0], 'sinif__ad')
        self.assertEqual(EXPORT_GROUP_BY_VALUES, frozenset({'none', 'sinif', 'sinif_seviyesi'}))

    def test_group_by_sinif_uses_classroom_name(self):
        rows = [
            {'sinif_ad': '12/Loca 4', 'sinif_seviyesi': '12. Sınıf', 'tam_ad': 'Z'},
            {'sinif_ad': '11/A', 'sinif_seviyesi': '11. Sınıf', 'tam_ad': 'Y'},
            {'sinif_ad': '12/Loca 4', 'sinif_seviyesi': '12. Sınıf', 'tam_ad': 'X'},
        ]
        groups = group_export_rows(rows, 'sinif')
        self.assertEqual([g['title'] for g in groups], ['12/Loca 4', '11/A'])
        self.assertEqual(len(groups[0]['rows']), 2)

    def test_group_by_seviye_uses_level_name(self):
        rows = [
            {'sinif_ad': '12/A', 'sinif_seviyesi': '12. Sınıf', 'tam_ad': 'Z'},
            {'sinif_ad': '11/B', 'sinif_seviyesi': '11. Sınıf', 'tam_ad': 'X'},
            {'sinif_ad': '12/B', 'sinif_seviyesi': '12. Sınıf', 'tam_ad': 'Y'},
        ]
        groups = group_export_rows(rows, 'sinif_seviyesi')
        self.assertEqual([g['title'] for g in groups], ['12. Sınıf', '11. Sınıf'])
        self.assertEqual(len(groups[0]['rows']), 2)

    def test_group_none_keeps_single_block(self):
        rows = [{'sinif_ad': '12/A', 'sinif_seviyesi': '12. Sınıf'}]
        groups = group_export_rows(rows, 'none')
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['title'], 'Tüm Liste')

    def test_export_keys_always_start_with_sira(self):
        keys = _normalize_export_keys(['tam_ad', 'sira', 'koc_adi'])
        self.assertEqual(keys[0], 'sira')
        self.assertEqual(keys[1:], ['tam_ad', 'koc_adi'])

    def test_prepare_export_rows_numbers_each_row(self):
        rows = [
            {'tam_ad': 'Ayşe Yılmaz', 'aktif_mi': True},
            {'tam_ad': 'Mehmet Demir', 'aktif_mi': False},
        ]
        prepared = _prepare_export_rows(rows, ['tam_ad', 'aktif_mi'])
        self.assertEqual([row['sira'] for row in prepared], [1, 2])
        self.assertEqual(prepared[0]['tam_ad'], 'Ayşe Yılmaz')
        self.assertEqual(prepared[1]['aktif_mi'], 'Pasif')
