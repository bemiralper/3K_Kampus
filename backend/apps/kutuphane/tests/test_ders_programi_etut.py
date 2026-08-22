"""Ders programından ilk etüt giriş saati."""
from datetime import date, time
from types import SimpleNamespace

from django.test import SimpleTestCase, TestCase

from apps.communication.application.notification_events import get_event
from apps.communication.application.variable_resolver import (
    build_attendance_context,
    build_recipient_context,
    resolve_variables,
)
from apps.kurum.domain.models import Kurum
from apps.kutuphane.ders_programi_utils import (
    first_etut_baslangic,
    first_etut_times_for_weekday,
    last_etut_bitis,
)
from apps.kutuphane.domain.models import SubeDersProgrami
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class FirstEtutTimesUnitTest(SimpleTestCase):
    def test_uses_lowest_ders_no(self):
        block = {
            'dersler': [
                {'ders_no': 2, 'baslangic': '09:20', 'bitis': '10:00'},
                {'ders_no': 1, 'baslangic': '08:30', 'bitis': '09:10'},
            ],
        }
        self.assertEqual(first_etut_baslangic(block), '08:30')

    def test_empty_period_is_blank(self):
        self.assertEqual(first_etut_baslangic({}), '')
        self.assertEqual(first_etut_baslangic(None), '')
        self.assertEqual(last_etut_bitis({}), '')
        self.assertEqual(last_etut_bitis(None), '')

    def test_last_etut_uses_highest_ders_no_bitis(self):
        block = {
            'dersler': [
                {'ders_no': 1, 'baslangic': '08:30', 'bitis': '09:10'},
                {'ders_no': 3, 'baslangic': '10:20', 'bitis': '11:00'},
                {'ders_no': 2, 'baslangic': '09:20', 'bitis': '10:00'},
            ],
        }
        self.assertEqual(first_etut_baslangic(block), '08:30')
        self.assertEqual(last_etut_bitis(block), '11:00')

    def test_weekday_times_from_v2_schedule(self):
        data = {
            '0': {
                'MORNING': {
                    'dersler': [
                        {'ders_no': 1, 'baslangic': '08:30', 'bitis': '09:10'},
                        {'ders_no': 2, 'baslangic': '09:20', 'bitis': '10:00'},
                    ],
                },
                'AFTERNOON': {
                    'dersler': [{'ders_no': 1, 'baslangic': '13:10', 'bitis': '13:50'}],
                },
                'EVENING': {
                    'dersler': [{'ders_no': 1, 'baslangic': '18:00', 'bitis': '18:40'}],
                },
            },
        }
        times = first_etut_times_for_weekday(data, 0)
        self.assertEqual(times['sabah_ilk_etut_saati'], '08:30')
        self.assertEqual(times['sabah_son_etut_cikis_saati'], '10:00')
        self.assertEqual(times['ogle_ilk_etut_saati'], '13:10')
        self.assertEqual(times['ogle_son_etut_cikis_saati'], '13:50')
        self.assertEqual(times['aksam_ilk_etut_saati'], '18:00')
        self.assertEqual(times['aksam_son_etut_cikis_saati'], '18:40')

    def test_missing_day_period_is_blank(self):
        times = first_etut_times_for_weekday({'0': {}}, 6)
        self.assertEqual(times['sabah_ilk_etut_saati'], '')
        self.assertEqual(times['ogle_ilk_etut_saati'], '')
        self.assertEqual(times['aksam_ilk_etut_saati'], '')
        self.assertEqual(times['sabah_son_etut_cikis_saati'], '')
        self.assertEqual(times['ogle_son_etut_cikis_saati'], '')
        self.assertEqual(times['aksam_son_etut_cikis_saati'], '')


class FirstEtutMessageContextTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Etüt Kurum', kod='ETK', aktif_mi=True)
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Etüt Şube', kod='ES', aktif_mi=True)
        self.program = SubeDersProgrami.objects.create(
            sube_id=self.sube.id,
            kurum_id=self.kurum.id,
            ad='Haftalık',
            aktif_mi=True,
            gun_bazli_aktiflik={
                str(i): {
                    'aktif': True,
                    'periyotlar': ['MORNING', 'AFTERNOON', 'EVENING'],
                }
                for i in range(7)
            },
            ders_saatleri={
                'MORNING': {
                    'dersler': [
                        {'ders_no': 1, 'baslangic': '08:15', 'bitis': '08:55'},
                        {'ders_no': 2, 'baslangic': '09:05', 'bitis': '09:45'},
                    ],
                },
                'AFTERNOON': {
                    'dersler': [
                        {'ders_no': 1, 'baslangic': '13:05', 'bitis': '13:45'},
                        {'ders_no': 2, 'baslangic': '13:55', 'bitis': '14:35'},
                    ],
                },
                'EVENING': {
                    'dersler': [
                        {'ders_no': 1, 'baslangic': '17:45', 'bitis': '18:25'},
                        {'ders_no': 2, 'baslangic': '18:35', 'bitis': '19:15'},
                    ],
                },
            },
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Yılmaz', aktif_mi=True,
        )

    def test_attendance_context_reads_program_for_session_weekday(self):
        # 2026-08-03 Pazartesi (weekday=0)
        session = SimpleNamespace(
            tarih=date(2026, 8, 3),
            ders_no=1,
            periyot_kodu='MORNING',
            library=SimpleNamespace(ad='A Salonu', sube_id=self.sube.id),
            sube_ders_programi=self.program,
            get_periyot_kodu_display=lambda: 'Sabah',
        )
        record = SimpleNamespace(giris_saati=time(8, 40), cikis_saati=None)
        ctx = build_attendance_context(
            session=session,
            record=record,
            ogrenci=self.ogrenci,
            veli=SimpleNamespace(tam_ad='Ayşe Hanım'),
            kurum=self.kurum,
        )
        self.assertEqual(ctx['ilk_etut_saati'], '08:15')
        self.assertEqual(ctx['son_etut_cikis_saati'], '09:45')
        self.assertEqual(ctx['sabah_ilk_etut_saati'], '08:15')
        self.assertEqual(ctx['ogle_ilk_etut_saati'], '13:05')
        self.assertEqual(ctx['aksam_ilk_etut_saati'], '17:45')
        body = resolve_variables(
            'İlk etüt {{ilk_etut_saati}} / Son çıkış {{son_etut_cikis_saati}}',
            ctx,
        )
        self.assertEqual(body, 'İlk etüt 08:15 / Son çıkış 09:45')

        session.periyot_kodu = 'AFTERNOON'
        session.get_periyot_kodu_display = lambda: 'Öğleden sonra'
        ctx_ogle = build_attendance_context(
            session=session,
            record=record,
            ogrenci=self.ogrenci,
            veli=SimpleNamespace(tam_ad='Ayşe Hanım'),
            kurum=self.kurum,
        )
        self.assertEqual(ctx_ogle['ilk_etut_saati'], '13:05')
        self.assertEqual(ctx_ogle['son_etut_cikis_saati'], '14:35')

        session.periyot_kodu = 'EVENING'
        ctx_aksam = build_attendance_context(
            session=session,
            record=record,
            ogrenci=self.ogrenci,
            veli=SimpleNamespace(tam_ad='Ayşe Hanım'),
            kurum=self.kurum,
        )
        self.assertEqual(ctx_aksam['ilk_etut_saati'], '17:45')
        self.assertEqual(ctx_aksam['son_etut_cikis_saati'], '19:15')

    def test_recipient_context_uses_active_sube_program(self):
        ctx = build_recipient_context(
            ogrenci=self.ogrenci,
            veli=SimpleNamespace(tam_ad='Ayşe Hanım'),
            kurum=self.kurum,
            sube_ad=self.sube.ad,
        )
        self.assertEqual(ctx['sabah_ilk_etut_saati'], '08:15')
        self.assertEqual(ctx['sabah_son_etut_cikis_saati'], '09:45')
        self.assertEqual(ctx.get('ilk_etut_saati', ''), '')
        self.assertEqual(ctx.get('son_etut_cikis_saati', ''), '')

    def test_yoklama_catalog_exposes_etut_variables(self):
        for key in ('yoklama.gelmedi', 'yoklama.gec', 'yoklama.cikis'):
            names = get_event(key).all_variables()
            self.assertIn('ilk_etut_saati', names)
            self.assertIn('son_etut_cikis_saati', names)
