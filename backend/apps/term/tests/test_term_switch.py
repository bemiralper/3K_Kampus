"""Aktif dönem değişince sınıflar ve öğrenci atamaları sıfırlanır."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.student_class_placement import StudentClassPlacement
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.application.service import activate_term
from apps.term.domain.models import Term

User = get_user_model()


class TermSwitchResetsClassesTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Dönem Kurum', kod='DNM')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='DNM-M')
        self.user = User.objects.create_user(username='termreset', password='test')
        self.client.force_login(self.user)

        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11. Sınıf', kod='S11', sira=11,
        )
        today = date.today()
        self.term1 = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            name='1. Dönem',
            code='D1',
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=60),
            order_no=1,
            is_active=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            term=self.term1,
            ad='11-A',
            kod='11A',
            kapasite=30,
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ada', soyad='Yılmaz', aktif_mi=True,
        )
        self.kayit = OgrenciKayit.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ogrenci=self.ogrenci,
            egitim_yili=self.egitim_yili,
            sinif=self.sinif,
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term1,
            student=self.ogrenci,
            classroom=self.sinif,
            is_active=True,
        )

    def _headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def test_activating_new_term_hides_old_classes_and_clears_assignments(self):
        today = date.today()
        term2 = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            name='2. Dönem',
            code='D2',
            start_date=today + timedelta(days=61),
            end_date=today + timedelta(days=180),
            order_no=2,
            is_active=True,
        )
        activate_term(term2)

        self.term1.refresh_from_db()
        self.assertFalse(self.term1.is_active)
        self.assertTrue(term2.is_active)

        res = self.client.get('/siniflar/api/', **self._headers())
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['aktif_donem']['id'], term2.id)
        self.assertEqual(body['siniflar'], [])

        self.kayit.refresh_from_db()
        self.assertIsNone(self.kayit.sinif_id)
        self.assertTrue(
            StudentClassPlacement.objects.filter(
                term=self.term1, student=self.ogrenci, is_active=True,
            ).exists()
        )

    def test_switching_back_restores_term_assignments(self):
        today = date.today()
        term2 = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            name='2. Dönem',
            code='D2',
            start_date=today + timedelta(days=61),
            end_date=today + timedelta(days=180),
            order_no=2,
            is_active=True,
        )
        activate_term(term2)
        activate_term(self.term1)

        self.kayit.refresh_from_db()
        self.assertEqual(self.kayit.sinif_id, self.sinif.id)

        res = self.client.get('/siniflar/api/', **self._headers())
        ids = [s['id'] for s in res.json()['siniflar']]
        self.assertIn(self.sinif.id, ids)
        self.assertEqual(res.json()['siniflar'][0]['mevcutluk'], 1)

    def test_patch_activate_term_hides_previous_term_classes(self):
        import json

        today = date.today()
        term2 = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            name='2. Dönem',
            code='D2',
            start_date=today + timedelta(days=61),
            end_date=today + timedelta(days=180),
            order_no=2,
            is_active=False,
        )
        res = self.client.patch(
            f'/api/terms/{term2.id}/update/',
            data=json.dumps({'is_active': True}),
            content_type='application/json',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)

        self.term1.refresh_from_db()
        term2.refresh_from_db()
        self.assertFalse(self.term1.is_active)
        self.assertTrue(term2.is_active)

        listed = self.client.get('/siniflar/api/', **self._headers()).json()
        self.assertEqual(listed['aktif_donem']['id'], term2.id)
        self.assertEqual(listed['siniflar'], [])
        self.kayit.refresh_from_db()
        self.assertIsNone(self.kayit.sinif_id)
