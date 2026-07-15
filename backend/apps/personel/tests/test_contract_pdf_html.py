"""Personel sözleşme PDF HTML şablonu testleri."""
import importlib.util
from pathlib import Path

from django.test import SimpleTestCase


def _load_html_module():
    path = Path(__file__).resolve().parents[1] / 'application' / 'contract_pdf_html.py'
    spec = importlib.util.spec_from_file_location('contract_pdf_html', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class ContractPdfHtmlTests(SimpleTestCase):
    def test_build_html_contains_key_fields(self):
        mod = _load_html_module()
        sample = {
            'sozlesme_no': 'PS-2026-0001',
            'dogrulama_kodu': 'ABC123',
            'personel_ad': 'Ayşe Yılmaz',
            'sozlesme_turu': 'TAM_ZAMANLI',
            'sozlesme_turu_display': 'Tam Zamanlı',
            'durum_display': 'Aktif',
            'baslangic_tarihi': '2026-09-01',
            'bitis_tarihi': '2027-06-30',
            'duzenlenme_tarihi': '2026-07-10',
            'egitim_yili_display': '2026-2027',
            'toplam_calisma_suresi_ay': 10,
            'belge_basligi': 'Öğretmen İş Sözleşmesi',
            'is_ogretmen': True,
            'kurum_id': 1,
            'sube_id': 2,
            'toplam_sozlesme_bedeli': 500000,
            'haftalik_calisma_gun_sayisi': 5,
            'sgk_gun': 30,
            'maas_plani': [
                {
                    'sira_no': 1,
                    'baslangic_tarihi': '2026-09-01',
                    'bitis_tarihi': '2026-09-30',
                    'calisilan_gun': 30,
                    'maas': 50000,
                    'aciklama': '',
                },
            ],
            'kurum': {'ad': 'Demo Kurum', 'adres': 'Ankara', 'telefon_sabit': '0312 000 00 00'},
        }
        html = mod.build_personel_sozlesme_html(sample)
        self.assertIn('data-pdf-ready="true"', html)
        self.assertIn('PS-2026-0001', html)
        self.assertIn('Öğretmen İş Sözleşmesi', html)
        self.assertIn('3K Kampüs ·', html)
        self.assertNotIn('3K Kampüs LMS', html)
        self.assertIn('10 ay', html)
        self.assertIn('<img src="data:image/', html)

    def test_logo_from_sube_media_url_with_cache_bust(self):
        from apps.finans.application.export.report_html_template import resolve_sube_banner_logo

        logo = resolve_sube_banner_logo(
            None,
            login_logo_url='/media/sube_branding/2/login_logo.png?v=1710000000',
        )
        self.assertTrue(logo.startswith('data:image/'), logo[:40])
