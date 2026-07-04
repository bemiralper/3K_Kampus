from django.test import SimpleTestCase

from apps.odeme_takip.application.services.risk_skoru_utils import (
    hesapla_risk_skoru,
    hesapla_vade_uyum_orani,
    risk_seviyesi,
)


class RiskSkoruUtilsTests(SimpleTestCase):
  def test_vade_uyumu_vadesi_gelen_yoksa_yuzde_yuz(self):
    self.assertEqual(hesapla_vade_uyum_orani(0, 0), 100.0)

  def test_zamaninda_odeme_dusuk_tahsilat_orani_yuksek_skor(self):
    """1/4 taksit ödenmiş, vadesi gelen yok → eski formül 78 verirdi."""
    skor = hesapla_risk_skoru(
      gecikme_sayisi=0,
      ort_gecikme_gun=0,
      kismi_oran=0,
      vade_uyum_orani=100,
    )
    self.assertEqual(skor, 100)
    self.assertEqual(risk_seviyesi(skor), 'dusuk')

  def test_vadesi_gelen_kismen_odenmis(self):
    uyum = hesapla_vade_uyum_orani(100_000, 50_000)
    self.assertEqual(uyum, 50.0)
    skor = hesapla_risk_skoru(1, 10, 0, uyum)
    self.assertLess(skor, 100)
    self.assertGreater(skor, 40)

  def test_gecikme_skoru_duser(self):
    skor = hesapla_risk_skoru(gecikme_sayisi=2, ort_gecikme_gun=15, kismi_oran=0, vade_uyum_orani=50)
    self.assertLess(skor, 70)
