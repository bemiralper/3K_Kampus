"""Yoklama / telafi / WhatsApp senaryoları (plan §19)."""
from __future__ import annotations

from datetime import date, time, timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirOturumBildirimLog,
    OturumDurumu,
    OturumTuru,
    SebepKodu,
    TelafiDurumu,
)
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services import oturum_service
from apps.ozel_ders.services.notify_service import (
    EVENT_OGRETMEN_GELMEDI,
    EVENT_TELAFI_PLANLANDI,
)


def _make_tenant(cls):
    from apps.kurum.domain.models import Kurum
    from apps.sube.domain.models import Sube
    from apps.egitim_yili.domain.models import EgitimYili
    from apps.ogrenci.domain.models import Ogrenci
    from apps.egitim_tanimlari.models import Ders
    from apps.personel.domain.models import Personel

    cls.kurum = Kurum.objects.create(ad='Test Kurum YT', kod='TKYT')
    cls.sube = Sube.objects.create(kurum=cls.kurum, ad='Merkez', kod='MYT')
    cls.ey = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
    cls.ogrenci = Ogrenci.objects.create(
        kurum=cls.kurum, sube=cls.sube, ad='Ahmet', soyad='Yılmaz', aktif_mi=True,
    )
    cls.ders = Ders.objects.create(
        kurum=cls.kurum, sube=cls.sube, ad='Matematik', kod='MAT-YT', kisa_ad='MAT',
    )
    cls.ogretmen = Personel.objects.create(
        kurum=cls.kurum, sube=cls.sube, ad='Tuba', soyad='Demir', aktif_mi=True,
    )


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class YoklamaTelafiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        _make_tenant(cls)

    def _oturum(self, **kwargs):
        defaults = dict(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.ey,
            session_date=date.today() - timedelta(days=1),
            start_time=time(15, 0),
            end_time=time(16, 0),
            ogrenci=self.ogrenci,
            ders=self.ders,
            ogretmen=self.ogretmen,
            oturum_turu=OturumTuru.OZEL,
            durum=OturumDurumu.PLANLANDI,
            telafi_durumu=TelafiDurumu.GEREKMIYOR,
            is_active=True,
        )
        defaults.update(kwargs)
        return BirebirDersOturumu.objects.create(**defaults)

    def test_1_islendi_telafi_gerekmiyor(self):
        o = self._oturum()
        with patch('apps.ozel_ders.services.notify_service._send_to_veliler') as send:
            result = oturum_service.set_durum(
                o.id, OturumDurumu.ISLENDI,
                kurum_id=self.kurum.id, sube_id=self.sube.id,
            )
            send.assert_not_called()
        self.assertEqual(result.durum, OturumDurumu.ISLENDI)
        self.assertEqual(result.telafi_durumu, TelafiDurumu.GEREKMIYOR)

    def test_2_online_telafi_gerekmiyor(self):
        o = self._oturum()
        result = oturum_service.set_durum(
            o.id, OturumDurumu.ONLINE,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
        )
        self.assertEqual(result.durum, OturumDurumu.ONLINE)
        self.assertEqual(result.telafi_durumu, TelafiDurumu.GEREKMIYOR)

    @patch('apps.ozel_ders.services.notify_service._send_to_veliler', return_value=1)
    def test_3_ogretmen_gelmedi_sebep_ve_bildirim(self, send):
        o = self._oturum()
        result = oturum_service.set_durum(
            o.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
        )
        self.assertEqual(result.durum, OturumDurumu.OGRETMEN_GELMEDI)
        self.assertEqual(result.telafi_durumu, TelafiDurumu.BEKLENIYOR)
        # on_commit — TestCase wraps in transaction; call notify directly for assert
        transaction = __import__('django.db', fromlist=['transaction']).transaction
        with self.captureOnCommitCallbacks(execute=True):
            oturum_service.set_durum(
                self._oturum().id, OturumDurumu.OGRETMEN_GELMEDI,
                kurum_id=self.kurum.id, sube_id=self.sube.id,
                sebep_kodu=SebepKodu.MAZERET,
            )
        self.assertTrue(send.called)

        with self.assertRaises(OzelDersError) as ctx:
            oturum_service.set_durum(
                self._oturum().id, OturumDurumu.OGRETMEN_GELMEDI,
                kurum_id=self.kurum.id, sube_id=self.sube.id,
            )
        self.assertEqual(ctx.exception.code, 'sebep_kodu')

    def test_4_ogrenci_gelmedi_sebep(self):
        o = self._oturum()
        result = oturum_service.set_durum(
            o.id, OturumDurumu.OGRENCI_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
            telafi_durumu=TelafiDurumu.GEREKMIYOR,
        )
        self.assertEqual(result.durum, OturumDurumu.OGRENCI_GELMEDI)
        self.assertEqual(result.telafi_durumu, TelafiDurumu.GEREKMIYOR)

    def test_5_ogrenci_gelmedi_telafi_bekleniyor(self):
        o = self._oturum()
        result = oturum_service.set_durum(
            o.id, OturumDurumu.OGRENCI_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.ACIL,
            telafi_durumu=TelafiDurumu.BEKLENIYOR,
        )
        self.assertEqual(result.telafi_durumu, TelafiDurumu.BEKLENIYOR)

    @patch('apps.ozel_ders.services.notify_service._send_to_veliler', return_value=1)
    def test_notify_ogrenci_gelmedi_uses_separate_events(self, send):
        from apps.ozel_ders.services.notify_service import (
            EVENT_OGRENCI_GELMEDI,
            EVENT_OGRENCI_GELMEDI_TELAFI,
            notify_yoklama,
        )
        yok = self._oturum(durum=OturumDurumu.OGRENCI_GELMEDI, telafi_durumu=TelafiDurumu.GEREKMIYOR)
        with self.captureOnCommitCallbacks(execute=True):
            notify_yoklama(yok, send_whatsapp=True)
        self.assertEqual(send.call_args.args[1], EVENT_OGRENCI_GELMEDI)

        send.reset_mock()
        bekleyen = self._oturum(
            durum=OturumDurumu.OGRENCI_GELMEDI, telafi_durumu=TelafiDurumu.BEKLENIYOR,
        )
        with self.captureOnCommitCallbacks(execute=True):
            notify_yoklama(bekleyen, send_whatsapp=True)
        self.assertEqual(send.call_args.args[1], EVENT_OGRENCI_GELMEDI_TELAFI)

    def test_6_iptal_sebep(self):
        o = self._oturum()
        result = oturum_service.set_durum(
            o.id, OturumDurumu.IPTAL,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.KURUM,
            sebep_aciklama='Program değişikliği',
            telafi_durumu=TelafiDurumu.GEREKMIYOR,
        )
        self.assertEqual(result.durum, OturumDurumu.IPTAL)
        self.assertIn('Program', result.sebep_aciklama)

    @patch('apps.ozel_ders.services.notify_service._send_to_veliler', return_value=1)
    def test_7_8_9_telafi_olustur_ve_bildirim(self, send):
        kaynak = self._oturum()
        oturum_service.set_durum(
            kaynak.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
            send_whatsapp=False,
        )
        with self.captureOnCommitCallbacks(execute=True):
            telafi, _ = oturum_service.create_telafi(
                kaynak.id,
                {
                    'session_date': (date.today() + timedelta(days=3)).isoformat(),
                    'start_time': '14:00',
                    'end_time': '15:00',
                },
                kurum_id=self.kurum.id,
                sube_id=self.sube.id,
            )
        kaynak.refresh_from_db()
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.PLANLANDI)
        self.assertEqual(telafi.oturum_turu, OturumTuru.TELAFI)
        self.assertEqual(telafi.replaces_oturum_id, kaynak.id)
        self.assertEqual(telafi.ogrenci_id, kaynak.ogrenci_id)
        self.assertEqual(telafi.ders_id, kaynak.ders_id)
        # Telafi planlandı bildirimi çağrıldı
        self.assertTrue(any(
            c.args[1] == EVENT_TELAFI_PLANLANDI for c in send.call_args_list
        ))
        for c in send.call_args_list:
            if c.args[1] == EVENT_TELAFI_PLANLANDI:
                extra = c.kwargs.get('extra_ctx') or {}
                self.assertTrue(extra.get('telafi_tarihi'))
                self.assertTrue(extra.get('telafi_saati'))
                self.assertTrue(extra.get('ders_tarihi'))
                self.assertTrue(extra.get('ders_saati'))

    def test_10_telafi_islendi_kaynak_edildi(self):
        kaynak = self._oturum()
        oturum_service.set_durum(
            kaynak.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
            send_whatsapp=False,
        )
        telafi, _ = oturum_service.create_telafi(
            kaynak.id,
            {
                'session_date': (date.today() + timedelta(days=2)).isoformat(),
                'start_time': '14:00',
                'end_time': '15:00',
            },
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        oturum_service.set_durum(
            telafi.id, OturumDurumu.ISLENDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            send_whatsapp=False,
        )
        kaynak.refresh_from_db()
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.EDILDI)

    def test_11_telafi_de_basarisiz_yeni_bekleniyor(self):
        kaynak = self._oturum()
        oturum_service.set_durum(
            kaynak.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
            send_whatsapp=False,
        )
        telafi, _ = oturum_service.create_telafi(
            kaynak.id,
            {
                'session_date': (date.today() + timedelta(days=2)).isoformat(),
                'start_time': '14:00',
                'end_time': '15:00',
            },
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        oturum_service.set_durum(
            telafi.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.ACIL,
            send_whatsapp=False,
        )
        telafi.refresh_from_db()
        kaynak.refresh_from_db()
        self.assertEqual(telafi.telafi_durumu, TelafiDurumu.BEKLENIYOR)
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.PLANLANDI)
        self.assertEqual(telafi.replaces_oturum_id, kaynak.id)

        # Yeni telafi telafi dersinden planlanabilir
        telafi2, _ = oturum_service.create_telafi(
            telafi.id,
            {
                'session_date': (date.today() + timedelta(days=5)).isoformat(),
                'start_time': '10:00',
                'end_time': '11:00',
            },
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        self.assertEqual(telafi2.replaces_oturum_id, telafi.id)

    def test_12_idempotent_bildirim_log(self):
        o = self._oturum(durum=OturumDurumu.OGRETMEN_GELMEDI, telafi_durumu=TelafiDurumu.BEKLENIYOR)
        BirebirOturumBildirimLog.objects.create(
            oturum=o, event_key=EVENT_OGRETMEN_GELMEDI, veli_id=99,
        )
        with patch(
            'apps.ogrenci.application.veli_contact.list_outbound_veliler',
        ) as lv:
            veli = MagicMock()
            veli.id = 99
            lv.return_value = [(veli, '905551112233')]
            with patch('apps.ozel_ders.services.notify_service.ContactResolver.veli_allows_outbound', return_value=True):
                with patch('apps.ozel_ders.services.notify_service.dispatch_event') as de:
                    from apps.ozel_ders.services import notify_service
                    notify_service._send_to_veliler(o, EVENT_OGRETMEN_GELMEDI)
                    de.assert_not_called()

    def test_13_serialize_links(self):
        kaynak = self._oturum()
        oturum_service.set_durum(
            kaynak.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
            send_whatsapp=False,
        )
        telafi, _ = oturum_service.create_telafi(
            kaynak.id,
            {
                'session_date': (date.today() + timedelta(days=2)).isoformat(),
                'start_time': '14:00',
                'end_time': '15:00',
            },
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
        )
        src = oturum_service.serialize_oturum(
            oturum_service.get_oturum(kaynak.id, kurum_id=self.kurum.id, sube_id=self.sube.id)
        )
        child = oturum_service.serialize_oturum(
            oturum_service.get_oturum(telafi.id, kurum_id=self.kurum.id, sube_id=self.sube.id)
        )
        self.assertEqual(src['telafi_oturum']['id'], telafi.id)
        self.assertEqual(child['kaynak_oturum']['id'], kaynak.id)

    def test_14_liste_telafi_filtresi(self):
        a = self._oturum()
        oturum_service.set_durum(
            a.id, OturumDurumu.OGRETMEN_GELMEDI,
            kurum_id=self.kurum.id, sube_id=self.sube.id,
            sebep_kodu=SebepKodu.HASTALIK,
            send_whatsapp=False,
        )
        self._oturum(durum=OturumDurumu.ISLENDI)
        rows = oturum_service.list_oturumlar(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            telafi_durumu=TelafiDurumu.BEKLENIYOR,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], a.id)

    @patch('apps.ozel_ders.services.notify_service.dispatch_event')
    def test_15_whatsapp_basarisiz_log(self, de):
        from apps.communication.application.communication_service import SendResult
        de.return_value = SendResult(success=False, errors=['Meta hata'], message_id=None)
        o = self._oturum(durum=OturumDurumu.OGRETMEN_GELMEDI, telafi_durumu=TelafiDurumu.BEKLENIYOR)
        veli = MagicMock()
        veli.id = 42
        with patch(
            'apps.ogrenci.application.veli_contact.list_outbound_veliler',
            return_value=[(veli, '90555')],
        ):
            with patch('apps.ozel_ders.services.notify_service.ContactResolver.veli_allows_outbound', return_value=True):
                from apps.ozel_ders.services import notify_service
                notify_service._send_to_veliler(o, EVENT_OGRETMEN_GELMEDI)
        self.assertTrue(
            BirebirOturumBildirimLog.objects.filter(
                oturum=o, event_key=EVENT_OGRETMEN_GELMEDI, veli_id=42,
            ).exists()
        )

    def test_fallback_bodies_match_catalog_copy(self):
        from apps.ozel_ders.services.notify_service import (
            EVENT_IPTAL,
            EVENT_ISLENDI,
            EVENT_OGRENCI_GELMEDI,
            EVENT_OGRENCI_GELMEDI_TELAFI,
            EVENT_OGRETMEN_GELMEDI,
            EVENT_TELAFI_PLANLANDI,
            _fallback_body,
        )
        ctx = {
            'ogrenci_ad': 'Ahmet Yılmaz',
            'ders_tarihi': '15 Ocak 2026 Pazartesi',
            'ders_saati': '15.00',
            'ders_adi': 'Matematik',
            'sebep': 'Hastalık',
            'ek_bilgi': 'Ek not',
            'telafi_tarihi': '18 Ocak 2026 Pazar',
            'telafi_saati': '14.00',
        }
        ogretmen = _fallback_body(EVENT_OGRETMEN_GELMEDI, ctx)
        self.assertIn('Değerli Velimiz', ogretmen)
        self.assertIn('Ahmet Yılmaz', ogretmen)
        self.assertIn('öğretmenimizin katılım sağlayamaması', ogretmen)
        self.assertIn('telafisi yapılacaktır', ogretmen)
        self.assertNotIn('{{telafi_notu}}', ogretmen)
        ogrenci = _fallback_body(EVENT_OGRENCI_GELMEDI_TELAFI, ctx)
        self.assertIn('katılım sağlanamamıştır', ogrenci)
        self.assertIn('telafi edilecektir', ogrenci)
        ogrenci_yok = _fallback_body(EVENT_OGRENCI_GELMEDI, ctx)
        self.assertIn('katılım sağlanamamıştır', ogrenci_yok)
        self.assertNotIn('telafi edilecektir', ogrenci_yok)
        self.assertNotIn('telafisi yapılacaktır', ogrenci_yok)
        self.assertNotIn('—', ogrenci_yok)
        iptal = _fallback_body(EVENT_IPTAL, ctx)
        self.assertIn('İptal nedeni', iptal)
        self.assertIn('Hastalık', iptal)
        self.assertIn('Ek not', iptal)
        telafi = _fallback_body(EVENT_TELAFI_PLANLANDI, ctx)
        self.assertIn('Telafi Tarihi', telafi)
        self.assertIn('18 Ocak 2026 Pazar', telafi)
        self.assertIn('14.00', telafi)
        islendi = _fallback_body(EVENT_ISLENDI, ctx)
        self.assertIn('gerçekleştirilmiştir', islendi)

    @patch('apps.ozel_ders.services.notify_service._send_to_veliler', return_value=1)
    def test_yoklama_notes_passed_as_ek_bilgi(self, send):
        o = self._oturum()
        with self.captureOnCommitCallbacks(execute=True):
            oturum_service.set_durum(
                o.id, OturumDurumu.IPTAL,
                kurum_id=self.kurum.id, sube_id=self.sube.id,
                sebep_kodu=SebepKodu.KURUM,
                telafi_durumu=TelafiDurumu.GEREKMIYOR,
                notes='Velilerle görüşüldü',
                send_whatsapp=True,
            )
        self.assertTrue(send.called)
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs.get('ek_bilgi'), 'Velilerle görüşüldü')

    def test_telafi_olusturulamaz_beklenmiyorsa(self):
        o = self._oturum()
        with self.assertRaises(OzelDersError):
            oturum_service.create_telafi(
                o.id,
                {
                    'session_date': date.today().isoformat(),
                    'start_time': '10:00',
                    'end_time': '11:00',
                },
                kurum_id=self.kurum.id,
                sube_id=self.sube.id,
            )
