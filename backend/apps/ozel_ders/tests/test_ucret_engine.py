"""Ücret motoru birim testleri — mesai içi/dışı + ders ücretli."""
from datetime import date, time
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from apps.ozel_ders.domain.models import MesaiModu, OturumDurumu, OturumTuru
from apps.ozel_ders.services.ucret_engine import UcretSonuc, evaluate


def _fake_oturum(**kwargs):
    o = MagicMock()
    o.ogretmen_id = kwargs.get('ogretmen_id', 1)
    o.kurum_id = kwargs.get('kurum_id', 1)
    o.sube_id = kwargs.get('sube_id', 1)
    o.session_date = kwargs.get('session_date', date(2026, 3, 2))  # Monday
    o.start_time = kwargs.get('start_time', time(18, 0))
    o.end_time = kwargs.get('end_time', time(19, 0))
    o.oturum_turu = kwargs.get('oturum_turu', OturumTuru.OZEL)
    o.durum = kwargs.get('durum', OturumDurumu.ISLENDI)
    o.duration_minutes.return_value = 60
    return o


def _fake_sozlesme(*, turu, birim=Decimal('500'), mesai_bitis=time(17, 30)):
    soz = MagicMock()
    soz.sozlesme_turu = turu
    soz.ders_birim_ucret = birim
    soz.ders_ucret_tipi = 'SAAT_BASI'
    mesai = MagicMock()
    mesai.gun = 1
    mesai.aktif = True
    mesai.baslangic = time(8, 30)
    mesai.bitis = mesai_bitis
    soz.mesai_saatleri.all.return_value = [mesai]
    soz.ders_ucretleri.first.return_value = None
    return soz


class UcretEngineTests(SimpleTestCase):
    @patch('apps.ozel_ders.services.ucret_engine._resolve_rule', return_value=None)
    @patch('apps.ozel_ders.services.ucret_engine._get_active_contract')
    def test_tam_zamanli_mesai_ici_ucretsiz(self, mock_contract, _rule):
        mock_contract.return_value = _fake_sozlesme(turu='TAM_ZAMANLI')
        o = _fake_oturum(start_time=time(16, 30), end_time=time(17, 30))
        result = evaluate(o)
        self.assertIsInstance(result, UcretSonuc)
        self.assertFalse(result.payable)
        self.assertIn('Mesai', result.reason)

    @patch('apps.ozel_ders.services.ucret_engine._resolve_rule', return_value=None)
    @patch('apps.ozel_ders.services.ucret_engine._get_active_contract')
    def test_tam_zamanli_mesai_disi_ucretli(self, mock_contract, _rule):
        mock_contract.return_value = _fake_sozlesme(turu='TAM_ZAMANLI')
        o = _fake_oturum(start_time=time(18, 0), end_time=time(19, 0))
        result = evaluate(o)
        self.assertTrue(result.payable)
        self.assertEqual(result.tutar, Decimal('500.00'))

    @patch('apps.ozel_ders.services.ucret_engine._resolve_rule', return_value=None)
    @patch('apps.ozel_ders.services.ucret_engine._get_active_contract')
    def test_ders_ucretli_her_zaman(self, mock_contract, _rule):
        mock_contract.return_value = _fake_sozlesme(turu='DERS_UCRETLI')
        o = _fake_oturum(start_time=time(10, 0), end_time=time(11, 0))
        result = evaluate(o)
        self.assertTrue(result.payable)
        self.assertEqual(result.mesai_modu, MesaiModu.HER_ZAMAN)

    @patch('apps.ozel_ders.services.ucret_engine._resolve_rule', return_value=None)
    @patch('apps.ozel_ders.services.ucret_engine._get_active_contract')
    def test_planlandi_ucret_yok(self, mock_contract, _rule):
        mock_contract.return_value = _fake_sozlesme(turu='DERS_UCRETLI')
        o = _fake_oturum(durum=OturumDurumu.PLANLANDI)
        result = evaluate(o)
        self.assertFalse(result.payable)
