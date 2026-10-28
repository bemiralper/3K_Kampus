"""Özel ders denetim düzeltmeleri: para kilidi, kapsam, telafi zinciri, tatil, girdi doğrulama."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.http import HttpResponse
from django.test import RequestFactory, TestCase
from django.utils import timezone

from apps.ozel_ders.domain.models import (
    BirebirDersOturumu,
    BirebirHakedis,
    BirebirOgrenciProgrami,
    HakedisDurumu,
    OturumDurumu,
    OturumTuru,
    ProgramDurumu,
    SebepKodu,
    TelafiDurumu,
)
from apps.ozel_ders.interfaces.context import guard_bad_input, json_body
from apps.ozel_ders.services import closure_marks, oturum_service, program_service, scope_guard
from apps.ozel_ders.services.conflict_service import _event_local_days
from apps.ozel_ders.services.errors import OzelDersError
from apps.ozel_ders.services.ucret_engine import _rate_row


def _tenant(cls, suffix: str):
    from apps.egitim_tanimlari.models import Ders
    from apps.egitim_yili.domain.models import EgitimYili
    from apps.kurum.domain.models import Kurum
    from apps.ogrenci.domain.models import Ogrenci
    from apps.personel.domain.models import Personel
    from apps.sube.domain.models import Sube

    cls.kurum = Kurum.objects.create(ad=f'Denetim {suffix}', kod=f'DN{suffix}')
    cls.sube = Sube.objects.create(kurum=cls.kurum, ad='Merkez', kod=f'M{suffix}')
    cls.ey = EgitimYili.objects.filter(baslangic_yil=2025).first() or EgitimYili.objects.create(
        baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
    )
    cls.ogrenci = Ogrenci.objects.create(
        kurum=cls.kurum, sube=cls.sube, ad='Ece', soyad='Kaya', aktif_mi=True,
    )
    cls.ders = Ders.objects.create(
        kurum=cls.kurum, sube=cls.sube, ad='Fizik', kod=f'FIZ-{suffix}', kisa_ad='FİZ',
    )
    cls.ogretmen = Personel.objects.create(
        kurum=cls.kurum, sube=cls.sube, ad='Can', soyad='Ak', aktif_mi=True,
    )

    cls.diger_kurum = Kurum.objects.create(ad=f'Diğer {suffix}', kod=f'DG{suffix}')
    cls.diger_sube = Sube.objects.create(kurum=cls.diger_kurum, ad='Diğer', kod=f'D{suffix}')
    cls.diger_ogrenci = Ogrenci.objects.create(
        kurum=cls.diger_kurum, sube=cls.diger_sube, ad='Yabancı', soyad='Öğrenci', aktif_mi=True,
    )
    cls.diger_ders = Ders.objects.create(
        kurum=cls.diger_kurum, sube=cls.diger_sube, ad='Kimya', kod=f'KIM-{suffix}',
    )


class _Base(TestCase):
    suffix = 'X'

    @classmethod
    def setUpTestData(cls):
        _tenant(cls, cls.suffix)

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

    def _set(self, oturum_id, durum, **kwargs):
        kwargs.setdefault('send_whatsapp', False)
        return oturum_service.set_durum(
            oturum_id, durum, kurum_id=self.kurum.id, sube_id=self.sube.id, **kwargs,
        )

    def _telafi(self, kaynak, **data):
        payload = {
            'session_date': date.today().isoformat(),
            'start_time': '12:00',
            'end_time': '13:00',
            'send_whatsapp': False,
        }
        payload.update(data)
        telafi, _ = oturum_service.create_telafi(
            kaynak.id, payload, kurum_id=self.kurum.id, sube_id=self.sube.id,
        )
        return telafi


class HakedisKilidiTests(_Base):
    suffix = 'HK'

    def _hakedis(self, oturum, durum):
        return BirebirHakedis.objects.create(
            oturum=oturum, ogretmen=self.ogretmen, ders=self.ders,
            tarih=oturum.session_date, sure_dk=60,
            birim_ucret=Decimal('100'), tutar=Decimal('100'), durum=durum,
        )

    def test_onayli_hakedis_durum_degisimini_engeller(self):
        o = self._oturum(durum=OturumDurumu.ISLENDI)
        self._hakedis(o, HakedisDurumu.ONAYLANDI)
        with self.assertRaises(OzelDersError) as ctx:
            self._set(o.id, OturumDurumu.IPTAL, sebep_kodu=SebepKodu.KURUM,
                      telafi_durumu=TelafiDurumu.GEREKMIYOR)
        self.assertEqual(ctx.exception.code, 'hakedis_locked')

    def test_bordroya_islenmis_hakedis_durum_degisimini_engeller(self):
        o = self._oturum(durum=OturumDurumu.ISLENDI)
        self._hakedis(o, HakedisDurumu.BORDOYA_ISLENDI)
        with self.assertRaises(OzelDersError) as ctx:
            self._set(o.id, OturumDurumu.PLANLANDI)
        self.assertEqual(ctx.exception.code, 'bordro_locked')

    def test_gelecek_ders_islendi_yapilamaz(self):
        o = self._oturum(session_date=date.today() + timedelta(days=3))
        with self.assertRaises(OzelDersError) as ctx:
            self._set(o.id, OturumDurumu.ISLENDI)
        self.assertEqual(ctx.exception.code, 'future_session')


class UcretSatiriTests(TestCase):
    def _soz(self, *rows):
        return SimpleNamespace(ders_ucretleri=SimpleNamespace(all=lambda: list(rows)))

    def _row(self, ucret, brans=None, tip='DERS_BASI'):
        return SimpleNamespace(
            birim_ucret=Decimal(ucret), brans=brans,
            brans_id=getattr(brans, 'id', None), ucret_tipi=tip,
        )

    def test_derse_uyan_brans_satiri_secilir(self):
        mat = self._row('300', SimpleNamespace(id=1, ad='Matematik', kod='MAT'))
        fiz = self._row('450', SimpleNamespace(id=2, ad='Fizik', kod='FIZ'))
        ders = SimpleNamespace(ad='Fizik-1', kod='F1', kisa_ad='FİZ')
        self.assertIs(_rate_row(self._soz(mat, fiz), ders), fiz)

    def test_belirsiz_ucretlerde_yanlis_brans_secilmez(self):
        mat = self._row('300', SimpleNamespace(id=1, ad='Matematik', kod='MAT'))
        fiz = self._row('450', SimpleNamespace(id=2, ad='Fizik', kod='FIZ'))
        ders = SimpleNamespace(ad='Kimya', kod='KIM', kisa_ad='')
        self.assertIsNone(_rate_row(self._soz(mat, fiz), ders))

    def test_bransiz_satir_varsayilan_olur(self):
        mat = self._row('300', SimpleNamespace(id=1, ad='Matematik', kod='MAT'))
        genel = self._row('250')
        ders = SimpleNamespace(ad='Kimya', kod='KIM', kisa_ad='')
        self.assertIs(_rate_row(self._soz(mat, genel), ders), genel)


class KapsamTests(_Base):
    suffix = 'KP'

    def test_baska_kurum_ogrencisi_reddedilir(self):
        with self.assertRaises(OzelDersError) as ctx:
            scope_guard.ensure_ogrenci(self.diger_ogrenci.id, kurum_id=self.kurum.id)
        self.assertEqual(ctx.exception.status, 403)

    def test_baska_kurum_dersi_reddedilir(self):
        with self.assertRaises(OzelDersError) as ctx:
            scope_guard.ensure_ders(self.diger_ders.id, kurum_id=self.kurum.id)
        self.assertEqual(ctx.exception.status, 403)

    def test_kendi_kayitlari_gecer(self):
        self.assertEqual(scope_guard.ensure_ogrenci(self.ogrenci.id, kurum_id=self.kurum.id), self.ogrenci.id)
        self.assertEqual(scope_guard.ensure_ders(str(self.ders.id), kurum_id=self.kurum.id), self.ders.id)

    def test_tek_seferlik_derste_yabanci_ders_reddedilir(self):
        with self.assertRaises(OzelDersError) as ctx:
            oturum_service.create_oturum(
                {
                    'session_date': date.today().isoformat(),
                    'start_time': '10:00',
                    'end_time': '11:00',
                    'ogrenci_id': self.ogrenci.id,
                    'ders_id': self.diger_ders.id,
                    'ogretmen_id': self.ogretmen.id,
                    'egitim_yili_id': self.ey.id,
                },
                kurum_id=self.kurum.id, sube_id=self.sube.id,
            )
        self.assertEqual(ctx.exception.status, 403)


class TelafiZinciriTests(_Base):
    suffix = 'TZ'

    def _kaynak_bekliyor(self):
        kaynak = self._oturum()
        self._set(kaynak.id, OturumDurumu.OGRETMEN_GELMEDI, sebep_kodu=SebepKodu.HASTALIK)
        kaynak.refresh_from_db()
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.BEKLENIYOR)
        return kaynak

    def test_iptal_edilen_telafi_borcu_kaynaga_dondurur(self):
        kaynak = self._kaynak_bekliyor()
        telafi = self._telafi(kaynak)
        self._set(telafi.id, OturumDurumu.IPTAL, sebep_kodu=SebepKodu.KURUM,
                  telafi_durumu=TelafiDurumu.BEKLENIYOR)
        kaynak.refresh_from_db()
        telafi.refresh_from_db()
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.BEKLENIYOR)
        self.assertEqual(telafi.telafi_durumu, TelafiDurumu.GEREKMIYOR)
        # Borç kaynağa döndüğü için yeni telafi planlanabilir.
        ikinci = self._telafi(kaynak, start_time='13:30', end_time='14:30')
        self.assertEqual(ikinci.replaces_oturum_id, kaynak.id)

    def test_telafisi_olan_ders_geri_alinamaz(self):
        kaynak = self._kaynak_bekliyor()
        self._telafi(kaynak)
        with self.assertRaises(OzelDersError) as ctx:
            self._set(kaynak.id, OturumDurumu.PLANLANDI)
        self.assertEqual(ctx.exception.code, 'telafi_exists')

    def test_ikinci_aktif_telafi_engellenir(self):
        kaynak = self._kaynak_bekliyor()
        self._telafi(kaynak)
        BirebirDersOturumu.objects.filter(pk=kaynak.pk).update(telafi_durumu=TelafiDurumu.BEKLENIYOR)
        with self.assertRaises(OzelDersError) as ctx:
            self._telafi(kaynak, start_time='17:00', end_time='18:00')
        self.assertEqual(ctx.exception.code, 'telafi_exists')

    def test_cok_seviyeli_telafi_islenince_tum_zincir_edildi(self):
        kaynak = self._kaynak_bekliyor()
        t1 = self._telafi(kaynak)
        self._set(t1.id, OturumDurumu.OGRETMEN_GELMEDI, sebep_kodu=SebepKodu.ACIL)
        t1.refresh_from_db()
        self.assertEqual(t1.telafi_durumu, TelafiDurumu.BEKLENIYOR)
        t2 = self._telafi(t1, start_time='09:00', end_time='10:00')
        self._set(t2.id, OturumDurumu.ISLENDI)
        kaynak.refresh_from_db()
        t1.refresh_from_db()
        self.assertEqual(t1.telafi_durumu, TelafiDurumu.EDILDI)
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.EDILDI)

    def test_islenen_telafi_geri_alininca_kaynak_planlandiya_doner(self):
        kaynak = self._kaynak_bekliyor()
        telafi = self._telafi(kaynak)
        self._set(telafi.id, OturumDurumu.ISLENDI)
        self._set(telafi.id, OturumDurumu.PLANLANDI)
        kaynak.refresh_from_db()
        self.assertEqual(kaynak.telafi_durumu, TelafiDurumu.PLANLANDI)

    @patch('apps.ozel_ders.services.notify_service._send_to_veliler', return_value=1)
    def test_telafi_whatsapp_kapatilabilir(self, send):
        kaynak = self._kaynak_bekliyor()
        with self.captureOnCommitCallbacks(execute=True):
            self._telafi(kaynak, send_whatsapp=False)
        send.assert_not_called()

    @patch('apps.ozel_ders.services.notify_service._send_to_veliler', return_value=1)
    def test_telafi_bildirimi_veli_notunu_tasir(self, send):
        kaynak = self._kaynak_bekliyor()
        with self.captureOnCommitCallbacks(execute=True):
            telafi = self._telafi(kaynak, send_whatsapp=True, veli_notu='Ders salonu 3')
        self.assertTrue(send.called)
        kwargs = send.call_args.kwargs
        self.assertEqual(kwargs.get('ek_bilgi'), 'Ders salonu 3')
        self.assertEqual(kwargs.get('log_oturum').id, telafi.id)


class ProgramPasifTests(_Base):
    suffix = 'PP'

    def test_pasife_alinan_program_gelecek_dersleri_kapatir(self):
        p = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ogrenci=self.ogrenci,
            baslangic_tarihi=date.today() - timedelta(days=30), durum=ProgramDurumu.AKTIF,
        )
        gelecek = self._oturum(program=p, session_date=date.today() + timedelta(days=5))
        gecmis = self._oturum(program=p, session_date=date.today() - timedelta(days=5))
        program_service.update_program(
            p.id, {'durum': ProgramDurumu.PASIF}, kurum_id=self.kurum.id, sube_id=self.sube.id,
        )
        gelecek.refresh_from_db()
        gecmis.refresh_from_db()
        self.assertFalse(gelecek.is_active)
        self.assertTrue(gecmis.is_active)

    def test_gecersiz_program_durumu_reddedilir(self):
        p = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ogrenci=self.ogrenci,
            baslangic_tarihi=date.today(), durum=ProgramDurumu.AKTIF,
        )
        with self.assertRaises(OzelDersError):
            program_service.update_program(
                p.id, {'durum': 'SILINDI'}, kurum_id=self.kurum.id, sube_id=self.sube.id,
            )

    def test_program_listesi_suresi_dolmus_slotu_saymaz(self):
        from apps.ozel_ders.domain.models import BirebirHaftalikSlot

        p = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ogrenci=self.ogrenci,
            baslangic_tarihi=date.today() - timedelta(days=60), durum=ProgramDurumu.AKTIF,
        )
        common = dict(program=p, gun=1, ders=self.ders, ogretmen=self.ogretmen, aktif=True)
        BirebirHaftalikSlot.objects.create(baslangic=time(10), bitis=time(11), **common)
        BirebirHaftalikSlot.objects.create(
            baslangic=time(12), bitis=time(13),
            bitis_tarihi=date.today() - timedelta(days=1), **common,
        )
        rows = program_service.list_programs(kurum_id=self.kurum.id, sube_id=self.sube.id)
        row = next(r for r in rows if r['id'] == p.id)
        self.assertEqual(row['slot_count'], 2)
        self.assertEqual(row['guncel_slot_dersleri'], {str(self.ders.id): 1})


class KapatmaIsaretiTests(_Base):
    suffix = 'KI'

    def test_isaret_okunur_ve_temizlenir(self):
        o = self._oturum(session_date=date.today() + timedelta(days=2))
        closure_marks.close_with_mark(o, closure_marks.TATIL_KARARI)
        o.refresh_from_db()
        self.assertFalse(o.is_active)
        self.assertTrue(closure_marks.is_marked(o))
        self.assertTrue(closure_marks.is_marked(o, closure_marks.TATIL_KARARI))
        self.assertFalse(closure_marks.is_marked(o, closure_marks.OGRENCI_TATIL))
        self.assertEqual(closure_marks.clear_mark_fields(o), ['sebep_aciklama'])
        self.assertEqual(o.sebep_aciklama, '')

    def test_tatil_karari_gunun_planli_derslerini_kapatip_acar(self):
        from apps.ozel_ders.domain.models import BirebirHaftalikSlot
        from apps.ozel_ders.services.resmi_tatil_karar_service import apply_karar_to_sessions

        gun = date.today() + timedelta(days=4)
        p = BirebirOgrenciProgrami.objects.create(
            kurum=self.kurum, sube=self.sube, egitim_yili=self.ey, ogrenci=self.ogrenci,
            baslangic_tarihi=date.today(), durum=ProgramDurumu.AKTIF,
        )
        slot = BirebirHaftalikSlot.objects.create(
            program=p, gun=gun.isoweekday(), baslangic=time(15), bitis=time(16),
            ders=self.ders, ogretmen=self.ogretmen,
        )
        slot2 = BirebirHaftalikSlot.objects.create(
            program=p, gun=gun.isoweekday(), baslangic=time(17), bitis=time(18),
            ders=self.ders, ogretmen=self.ogretmen,
        )
        o = self._oturum(session_date=gun, program=p, source_slot=slot)
        islenmis = self._oturum(
            session_date=gun, start_time=time(17), end_time=time(18),
            durum=OturumDurumu.ISLENDI, program=p, source_slot=slot2,
        )
        with patch('apps.ozel_ders.services.conflict_service.is_holiday', return_value=True):
            sonuc = apply_karar_to_sessions(kurum_id=self.kurum.id, sube_id=None, day=gun)
        self.assertEqual(sonuc['closed'], 1)
        o.refresh_from_db()
        islenmis.refresh_from_db()
        self.assertFalse(o.is_active)
        self.assertTrue(closure_marks.is_marked(o, closure_marks.TATIL_KARARI))
        self.assertTrue(islenmis.is_active)

        with patch('apps.ozel_ders.services.conflict_service.is_holiday', return_value=False):
            sonuc = apply_karar_to_sessions(kurum_id=self.kurum.id, sube_id=None, day=gun)
        self.assertEqual(sonuc['reopened'], 1)
        o.refresh_from_db()
        self.assertTrue(o.is_active)
        self.assertFalse(closure_marks.is_marked(o))


class TatilGunuTests(TestCase):
    def test_gece_yarisi_biten_tum_gun_etkinligi_ertesi_gunu_kapsamaz(self):
        tz = timezone.get_current_timezone()
        ev = SimpleNamespace(
            baslangic=timezone.make_aware(datetime(2026, 10, 29, 0, 0), tz),
            bitis=timezone.make_aware(datetime(2026, 10, 30, 0, 0), tz),
        )
        self.assertEqual(_event_local_days(ev), (date(2026, 10, 29), date(2026, 10, 29)))

    def test_utc_kaydi_yerel_gune_cevrilir(self):
        import zoneinfo

        utc = zoneinfo.ZoneInfo('UTC')
        local = timezone.make_aware(datetime(2026, 10, 29, 0, 0), timezone.get_current_timezone())
        ev = SimpleNamespace(baslangic=local.astimezone(utc), bitis=None)
        self.assertEqual(_event_local_days(ev)[0], date(2026, 10, 29))


class GirdiKorumasiTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def test_bozuk_girdi_400_doner(self):
        @guard_bad_input
        def view(request):
            int('abc')
            return HttpResponse('ok')

        resp = view(self.rf.post('/x/'))
        self.assertEqual(resp.status_code, 400)

    def test_benzersizlik_cakismasi_409_doner(self):
        from django.db import IntegrityError

        @guard_bad_input
        def view(request):
            raise IntegrityError('dup')

        resp = view(self.rf.post('/x/'))
        self.assertEqual(resp.status_code, 409)

    def test_json_body_sozluk_disini_reddeder(self):
        req = self.rf.post('/x/', data='[1, 2]', content_type='application/json')
        self.assertEqual(json_body(req), {})
