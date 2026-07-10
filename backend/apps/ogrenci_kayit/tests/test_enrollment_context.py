"""Kayıt alan çözümlemesi testleri."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.ogrenci_kayit.application.enrollment_context import resolve_kayit_alan_id


class ResolveKayitAlanIdTest(SimpleTestCase):
    def test_prefers_kayit_alan_over_sinif_and_inference(self):
        kayit = SimpleNamespace(
            alan_id=3,
            ogrenci_id=1,
            egitim_yili_id=10,
            sinif=SimpleNamespace(alan_id=5, sinif_seviyesi_id=12, sinif_seviyesi=None),
            sinif_seviyesi=None,
            sinif_seviyesi_id=None,
        )
        self.assertEqual(resolve_kayit_alan_id(kayit), 3)

    def test_falls_back_to_sinif_alan(self):
        kayit = SimpleNamespace(
            alan_id=None,
            ogrenci_id=1,
            egitim_yili_id=10,
            sinif=SimpleNamespace(alan_id=7, sinif_seviyesi_id=12, sinif_seviyesi=None),
            sinif_seviyesi=None,
            sinif_seviyesi_id=None,
        )
        self.assertEqual(resolve_kayit_alan_id(kayit), 7)

    @patch("apps.ogrenci_kayit.application.enrollment_context.infer_alan_id_from_enrolled_grup")
    def test_falls_back_to_enrolled_grup(self, infer_mock):
        infer_mock.return_value = 9
        kayit = SimpleNamespace(
            alan_id=None,
            ogrenci_id=42,
            egitim_yili_id=10,
            sinif=None,
            sinif_seviyesi=None,
            sinif_seviyesi_id=12,
        )
        self.assertEqual(resolve_kayit_alan_id(kayit, ogrenci_id=42, egitim_yili_id=10), 9)
        infer_mock.assert_called()
