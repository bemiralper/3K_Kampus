"""Yoklama kaydı veli telefonu — Ara veli için."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.domain.models import AttendanceRecord, AttendanceSession, AttendanceStatus, Library
from apps.ogrenci.domain.models import Ogrenci, OgrenciVeli
from apps.sube.domain.models import Sube

User = get_user_model()


class AttendanceRecordVeliCallTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Yoklama Ara', kod='YARA')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YARA-M')
        self.library = Library.objects.create(
            kurum_id=self.kurum.id, sube_id=self.sube.id, ad='Salon', kod='YA-1', kapasite=20,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Yılmaz', aktif_mi=True,
        )
        self.veli = OgrenciVeli.objects.create(
            ogrenci=self.ogrenci,
            veli_turu='anne',
            ad='Ayşe',
            soyad='Yılmaz',
            telefon='05551234567',
            varsayilan=True,
        )
        self.session = AttendanceSession.objects.create(
            library=self.library,
            tarih=date(2026, 8, 21),
            acan_id=1,
        )
        AttendanceRecord.objects.create(
            attendance_session=self.session,
            ogrenci_id=self.ogrenci.id,
            durum=AttendanceStatus.ABSENT,
            kaydeden_id=1,
        )
        self.user = User.objects.create_superuser(username='yara_admin', password='testpass123')
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
        }

    def test_records_include_veli_phone(self):
        self.client.force_login(self.user)
        res = self.client.get(
            f'/kutuphane/api/salon/{self.library.id}/yoklama/{self.session.id}/kayit/',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        rows = res.json()['data']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['veli_ad'], 'Ayşe Yılmaz')
        self.assertEqual(rows[0]['veli_telefon'], '05551234567')
        self.assertEqual(rows[0]['ogrenci_adi'], 'Ali Yılmaz')
