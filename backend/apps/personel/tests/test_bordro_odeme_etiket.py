from datetime import date
from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.personel.domain.sozlesme_models import HakedisDurumu
from apps.personel.interfaces.sozlesme_views import (
    _bordro_odeme_etiket,
    _bordro_odeme_grubu,
)


def _h(durum, odeme_tarihi=None, display='Hesaplandı'):
    return SimpleNamespace(
        durum=durum,
        odeme_tarihi=odeme_tarihi,
        get_durum_display=lambda: display,
    )


class BordroOdemeEtiketTest(SimpleTestCase):
    def test_odenen_ayri_gruba_duser(self):
        odenen = _h(HakedisDurumu.ODENDI, date(2026, 10, 1), 'Ödendi')
        self.assertEqual(_bordro_odeme_grubu(odenen), 'odenen')
        self.assertIn('Ödendi', _bordro_odeme_etiket(odenen))
        self.assertIn('01.10.2026', _bordro_odeme_etiket(odenen))

    def test_hesaplanan_odenmis_sayilmaz(self):
        bekleyen = _h(HakedisDurumu.HESAPLANDI, display='Hesaplandı')
        self.assertEqual(_bordro_odeme_grubu(bekleyen), 'odenmedi')
        etiket = _bordro_odeme_etiket(bekleyen)
        self.assertIn('Ödenmedi', etiket)
        self.assertNotIn('Ödendi<br/>', etiket)
