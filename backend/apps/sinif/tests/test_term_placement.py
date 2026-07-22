"""Dönem bazlı sınıf yerleşimi API testleri."""
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
from apps.term.domain.models import Term

User = get_user_model()


class SinifTermPlacementApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='Placement Kurum', kod='PLC')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PLC-M')
        self.user = User.objects.create_user(username='placementtest', password='test')
        self.client.force_login(self.user)

        self.egitim_yili = EgitimYili.objects.create(
            baslangic_yil=2025, bitis_yil=2026, aktif_mi=True,
        )
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='9. Sınıf', kod='S9', sira=9,
        )
        today = date.today()
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            name='2025-2026 Güz',
            code='Guz25',
            start_date=today - timedelta(days=30),
            end_date=today + timedelta(days=120),
            order_no=1,
            is_active=True,
        )
        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            ad='9-A',
            kod='9A',
            kapasite=30,
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.egitim_yili,
            ad='9-B',
            kod='9B',
            kapasite=30,
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        self.ogrenci1 = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        self.ogrenci2 = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ogrenci=self.ogrenci1,
            egitim_yili=self.egitim_yili,
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ogrenci=self.ogrenci2,
            egitim_yili=self.egitim_yili,
            sinif_seviyesi=self.seviye,
            aktif_mi=True,
        )

    def _headers(self):
        return {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.egitim_yili.id),
        }

    def test_list_mevcutluk_from_placement(self):
        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term,
            student=self.ogrenci1,
            classroom=self.sinif,
            is_active=True,
        )
        res = self.client.get('/siniflar/api/', **self._headers())
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn('aktif_donem', body)
        self.assertEqual(body['aktif_donem']['id'], self.term.id)
        sinif_row = next(s for s in body['siniflar'] if s['id'] == self.sinif.id)
        self.assertEqual(sinif_row['mevcutluk'], 1)

    def test_roster_includes_placed_and_unplaced(self):
        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term,
            student=self.ogrenci1,
            classroom=self.sinif,
            is_active=True,
        )
        res = self.client.get(
            f'/siniflar/api/{self.sinif.id}/atanmamis-ogrenciler/?term_id={self.term.id}',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(len(body['ogrenciler']), 2)
        by_id = {o['id']: o for o in body['ogrenciler']}
        self.assertTrue(by_id[self.ogrenci1.id]['bu_sinifta'])
        self.assertFalse(by_id[self.ogrenci2.id]['bu_sinifta'])
        self.assertIsNone(by_id[self.ogrenci2.id]['sinif_yerlesim'])
        self.assertEqual(body['sinif']['mevcutluk'], 1)

    def test_remove_student_from_class(self):
        import json

        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term,
            student=self.ogrenci1,
            classroom=self.sinif,
            is_active=True,
        )
        OgrenciKayit.objects.filter(ogrenci=self.ogrenci1).update(sinif=self.sinif)

        res = self.client.post(
            f'/siniflar/api/{self.sinif.id}/ogrenci-cikar/',
            data=json.dumps({'term_id': self.term.id, 'student_ids': [self.ogrenci1.id]}),
            content_type='application/json',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['mevcutluk'], 0)
        self.assertFalse(
            StudentClassPlacement.objects.filter(
                term=self.term, student=self.ogrenci1, is_active=True,
            ).exists()
        )
        kayit = OgrenciKayit.objects.get(ogrenci=self.ogrenci1, egitim_yili=self.egitim_yili)
        self.assertIsNone(kayit.sinif_id)

    def test_assign_transfers_from_other_class(self):
        import json

        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term,
            student=self.ogrenci1,
            classroom=self.sinif_b,
            is_active=True,
        )
        res = self.client.post(
            f'/siniflar/api/{self.sinif.id}/ogrenci-ata/',
            data=json.dumps({'term_id': self.term.id, 'student_ids': [self.ogrenci1.id]}),
            content_type='application/json',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        placement = StudentClassPlacement.objects.get(
            term=self.term, student=self.ogrenci1, is_active=True,
        )
        self.assertEqual(placement.classroom_id, self.sinif.id)

        roster = self.client.get(
            f'/siniflar/api/{self.sinif.id}/atanmamis-ogrenciler/?term_id={self.term.id}',
            **self._headers(),
        ).json()
        row = next(o for o in roster['ogrenciler'] if o['id'] == self.ogrenci1.id)
        self.assertTrue(row['bu_sinifta'])
        self.assertEqual(row['sinif_yerlesim']['ad'], '9-A')

    def test_bulk_assign_creates_placement_and_syncs_kayit(self):
        import json

        res = self.client.post(
            f'/siniflar/api/{self.sinif.id}/ogrenci-ata/',
            data=json.dumps({
                'term_id': self.term.id,
                'student_ids': [self.ogrenci1.id, self.ogrenci2.id],
            }),
            content_type='application/json',
            **self._headers(),
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(
            StudentClassPlacement.objects.filter(
                term=self.term, classroom=self.sinif, is_active=True,
            ).count(),
            2,
        )
        kayit = OgrenciKayit.objects.get(ogrenci=self.ogrenci1, egitim_yili=self.egitim_yili)
        self.assertEqual(kayit.sinif_id, self.sinif.id)

    def test_ogrenci_detail_shows_donem_sinif(self):
        StudentClassPlacement.objects.create(
            academic_year=self.egitim_yili,
            term=self.term,
            student=self.ogrenci1,
            classroom=self.sinif,
            is_active=True,
        )
        res = self.client.get(f'/ogrenciler/api/{self.ogrenci1.id}/', **self._headers())
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['donem_sinif']['ad'], '9-A')
        self.assertEqual(body['aktif_donem']['id'], self.term.id)
