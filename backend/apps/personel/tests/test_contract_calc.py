"""Personel sözleşme hesaplama unit testleri."""
import importlib.util
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.test import SimpleTestCase

_calc_path = Path(__file__).resolve().parents[1] / 'application' / 'contract_calc_service.py'
_spec = importlib.util.spec_from_file_location('contract_calc_service', _calc_path)
_calc = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_calc)

calc_calisilan_gun = _calc.calc_calisilan_gun
calc_toplam_maas = _calc.calc_toplam_maas
calc_toplam_calisma_suresi = _calc.calc_toplam_calisma_suresi
format_calisma_suresi_ay = _calc.format_calisma_suresi_ay
sozlesme_belge_basligi = _calc.sozlesme_belge_basligi
derive_month_dates = _calc.derive_month_dates
chain_fill_from_index = _calc.chain_fill_from_index
calc_haftalik_saat = _calc.calc_haftalik_saat


class ContractCalcTests(SimpleTestCase):
    def test_calisilan_gun(self):
        self.assertEqual(calc_calisilan_gun('2026-09-01', '2026-09-30'), 30)

    def test_chain_fill_maas(self):
        rows = [
            {'sira_no': 1, 'baslangic_tarihi': '2026-09-01', 'bitis_tarihi': '2026-09-30', 'maas': 50000},
            {'sira_no': 2, 'baslangic_tarihi': '2026-10-01', 'bitis_tarihi': '2026-10-31', 'maas': 0},
            {'sira_no': 3, 'baslangic_tarihi': '2026-11-01', 'bitis_tarihi': '2026-11-30', 'maas': 0},
        ]
        out = chain_fill_from_index(rows, 0, ['maas'])
        self.assertEqual(out[1]['maas'], 50000)
        self.assertEqual(out[2]['maas'], 50000)

        out2 = chain_fill_from_index(out, 1, ['maas'])
        out2[1]['maas'] = 55000
        out2 = chain_fill_from_index(out2, 1, ['maas'])
        self.assertEqual(out2[0]['maas'], 50000)
        self.assertEqual(out2[1]['maas'], 55000)
        self.assertEqual(out2[2]['maas'], 55000)

    def test_toplam_calisma_suresi_one_month(self):
        rows = [{'baslangic_tarihi': '2026-09-01', 'bitis_tarihi': '2026-09-30'}]
        self.assertEqual(calc_toplam_calisma_suresi(rows, '2026-09-01', '2026-09-30'), Decimal('1'))

    def test_toplam_calisma_suresi_twelve_months(self):
        self.assertEqual(
            calc_toplam_calisma_suresi([], '2026-09-01', '2027-08-31'),
            Decimal('12'),
        )

    def test_toplam_calisma_suresi_prefers_maas_plani_rows_over_short_contract_dates(self):
        rows = [{'baslangic_tarihi': f'2026-{m:02d}-01', 'bitis_tarihi': f'2026-{m:02d}-28', 'maas': 1} for m in range(9, 13)]
        rows += [{'baslangic_tarihi': f'2027-{m:02d}-01', 'bitis_tarihi': f'2027-{m:02d}-28', 'maas': 1} for m in range(1, 9)]
        self.assertEqual(len(rows), 12)
        self.assertEqual(
            calc_toplam_calisma_suresi(rows, '2026-09-01', '2026-09-30'),
            Decimal('12'),
        )

    def test_toplam_maas(self):
        rows = [{'maas': 50000}, {'maas': 55000}]
        self.assertEqual(calc_toplam_maas(rows), Decimal('105000'))

    def test_format_calisma_suresi_ay(self):
        self.assertEqual(format_calisma_suresi_ay(Decimal('12')), '12 ay')
        self.assertEqual(format_calisma_suresi_ay(Decimal('12.5')), '12,5 ay')
        self.assertEqual(format_calisma_suresi_ay(Decimal('1')), '1 ay')

    def test_sozlesme_belge_basligi(self):
        self.assertEqual(
            sozlesme_belge_basligi(gorev_snapshot='Matematik Öğretmeni'),
            'Öğretmen İş Sözleşmesi',
        )
        self.assertEqual(
            sozlesme_belge_basligi(gorev_snapshot='İdari Personel'),
            'Personel İş Sözleşmesi',
        )

    def test_haftalik_saat(self):
        mesai = [
            {'gun': 1, 'baslangic': '09:00', 'bitis': '18:00', 'mola_dakika': 60, 'aktif': True},
            {'gun': 2, 'baslangic': '09:00', 'bitis': '18:00', 'mola_dakika': 60, 'aktif': True},
        ]
        self.assertEqual(calc_haftalik_saat(mesai), Decimal('16.00'))

    def test_derive_month_dates(self):
        rows = [{'sira_no': 1, 'baslangic_tarihi': '2026-09-01', 'maas': 50000}]
        out = derive_month_dates(rows, '2026-09-01')
        self.assertEqual(out[0]['bitis_tarihi'], '2026-09-30')

    def test_derive_month_dates_sequential_after_chain_fill(self):
        rows = [
            {'sira_no': 1, 'baslangic_tarihi': '2026-09-01', 'bitis_tarihi': '2026-09-30', 'maas': 50000},
            {'sira_no': 2, 'baslangic_tarihi': '2026-09-01', 'bitis_tarihi': '2026-09-30', 'maas': 50000},
            {'sira_no': 3, 'baslangic_tarihi': '2026-09-01', 'bitis_tarihi': '2026-09-30', 'maas': 50000},
        ]
        out = chain_fill_from_index(rows, 0, ['baslangic_tarihi', 'bitis_tarihi', 'maas'])
        self.assertEqual(out[0]['bitis_tarihi'], '2026-09-30')
        self.assertEqual(out[1]['baslangic_tarihi'], '2026-10-01')
        self.assertEqual(out[1]['bitis_tarihi'], '2026-10-31')
        self.assertEqual(out[2]['baslangic_tarihi'], '2026-11-01')
        self.assertEqual(out[2]['bitis_tarihi'], '2026-11-30')
