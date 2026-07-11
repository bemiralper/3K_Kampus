"""Personel sözleşme serializer — görevlendirme rol alan adları."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.personel.interfaces.sozlesme_serializers import serialize_sozlesme


class SozlesmeSerializeTests(SimpleTestCase):
    def test_serialize_with_role_code_and_name(self):
        rol = SimpleNamespace(code='ogretmen', name='Öğretmen')
        gorevlendirme = SimpleNamespace(rol=rol)
        personel = SimpleNamespace(
            tam_ad='Ayşe Yılmaz',
            tc_kimlik_no='12345678901',
            fotograf=None,
        )
        egitim_yili = SimpleNamespace(__str__=lambda self: '2025-2026')
        kurum = SimpleNamespace(ad='Demo', adres='', telefon_sabit='')
        sozlesme = SimpleNamespace(
            id=1,
            sozlesme_no='PS-2026-0001',
            kurum_id=1,
            kurum=kurum,
            sube_id=2,
            sube=SimpleNamespace(ad='Merkez'),
            personel_id=10,
            personel=personel,
            gorevlendirme_id=5,
            gorevlendirme=gorevlendirme,
            personel_no_snapshot='P-010',
            brans_snapshot='Matematik',
            gorev_snapshot='Öğretmen',
            departman_snapshot='Merkez',
            egitim_yili_id=3,
            egitim_yili=egitim_yili,
            sozlesme_turu='TAM_ZAMANLI',
            get_sozlesme_turu_display=lambda: 'Tam Zamanlı',
            durum='AKTIF',
            get_durum_display=lambda: 'Aktif',
            duzenlenme_tarihi=None,
            baslangic_tarihi=SimpleNamespace(isoformat=lambda: '2026-09-01'),
            bitis_tarihi=SimpleNamespace(isoformat=lambda: '2027-06-30'),
            brut_maas=50000,
            net_maas=40000,
            sgk_gun=30,
            haftalik_calisma_gun_sayisi=5,
            haftalik_izin_gunleri=[],
            ders_ucreti_aktif=False,
            ders_ucret_tipi='',
            ders_birim_ucret=0,
            toplam_calisma_suresi_ay=10,
            toplam_sozlesme_bedeli=500000,
            auto_save_rev=0,
            notlar='',
            sozlesme_dosya=None,
            fesih_tarihi=None,
            fesih_sebebi='',
            created_at=None,
        )

        mesai_qs = MagicMock()
        mesai_qs.all.return_value = []
        plan_qs = MagicMock()
        plan_qs.all.return_value = []
        ders_qs = MagicMock()
        ders_qs.all.return_value = []
        ucret_qs = MagicMock()
        ucret_qs.all.return_value = []
        madde_qs = MagicMock()
        madde_qs.all.return_value = []

        sozlesme.mesai_saatleri = mesai_qs
        sozlesme.maas_plani = plan_qs
        sozlesme.ders_ucretleri = ders_qs
        sozlesme.ucret_donemleri = ucret_qs
        sozlesme.maddeler = madde_qs

        with patch('apps.personel.interfaces.sozlesme_serializers.calc_ozet_metrikleri') as mock_ozet:
            mock_ozet.return_value = {
                'toplam_maas': 500000,
                'toplam_calisma_suresi_ay': 10,
                'haftalik_calisma_saati': 40,
                'ders_ucreti': 0,
                'ders_ucret_tipi': '',
                'sgk_gun': 30,
                'haftalik_calisma_gun': 5,
                'gunluk_ucret': 0,
                'saatlik_ucret': 0,
                'tahmini_aylik_maliyet': 50000,
                'kalan_gun': 300,
            }
            data = serialize_sozlesme(sozlesme)

        self.assertEqual(data['is_ogretmen'], True)
        self.assertEqual(data['belge_basligi'], 'Öğretmen İş Sözleşmesi')
