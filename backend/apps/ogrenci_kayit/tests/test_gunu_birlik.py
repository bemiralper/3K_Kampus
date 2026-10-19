"""Günü birlik deneme kaydı: kısa kayıt, TC eşleme, kitleye sızmama."""
import json
from io import BytesIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from openpyxl import Workbook, load_workbook
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant
from apps.coaching.olcme_degerlendirme.services.exam_roster import (
    replace_auto_participants,
    resolve_exam_candidates,
)
from apps.coaching.olcme_degerlendirme.views.analysis_views import (
    _gunu_birlik_labels,
    _program_label,
)
from apps.coaching.tests.olcme_helpers import grant_olcme_write
from apps.egitim_paketleri.models import EkHizmet
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciKayit
from apps.ogrenci.services.kayit_turu import GUNU_BIRLIK_CODE
from apps.ogrenci_kayit.domain.models import LookupCategory, LookupOption
from apps.roller.models import Role, UserRole
from apps.roller.seed import ensure_default_roles
from apps.sube.domain.models import Sube

User = get_user_model()
URL = '/api/ogrenci-kayit/gunu-birlik/'


class GunuBirlikApiTests(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Günü Kurum', kod='GUNU')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='GUNU-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.sev12 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12. Sınıf', kod='12',
        )
        self.sev8 = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='8. Sınıf', kod='8',
        )
        self.exam = Exam.objects.create(
            name='TYT Deneme', exam_type='YKS_TYT', exam_date='2026-10-25',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.exam_b = Exam.objects.create(
            name='Başka Deneme', exam_type='YKS_TYT', exam_date='2026-11-01',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.user = User.objects.create_user(username='gunu_memur', password='x')
        grant_olcme_write(self.user, self.kurum)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }

    def _row(self, ad='Ayşe', soyad='Yılmaz', tc='10000000001', seviye=None, telefon='05321112233'):
        return {
            'ad': ad,
            'soyad': soyad,
            'tc_kimlik_no': tc,
            'telefon': telefon,
            'sinif_seviyesi_id': (seviye or self.sev12).id,
        }

    def _post(self, rows, *, exam=None, commit=True):
        return self.client.post(
            URL,
            {
                'exam_id': (exam or self.exam).id,
                'commit': commit,
                'ogrenciler': rows,
            },
            format='json',
            **self.headers,
        )

    def test_yeni_tc_yillik_kayit_acmaz_ve_secilen_sinava_duser(self):
        res = self._post([self._row()])
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body['rows'][0]['status'], 'yeni')
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000001')
        self.assertEqual(ogrenci.kayit_turu, GUNU_BIRLIK_CODE)
        self.assertFalse(OgrenciKayit.objects.filter(ogrenci=ogrenci).exists())
        part = ExamParticipant.objects.get(exam=self.exam, student=ogrenci)
        self.assertEqual(part.source, ExamParticipant.Source.MANUAL)
        self.assertEqual(part.sinif_seviyesi_id, self.sev12.id)
        self.assertFalse(ExamParticipant.objects.filter(exam=self.exam_b, student=ogrenci).exists())
        label = _gunu_birlik_labels(self.exam, [ogrenci.id])[ogrenci.id]
        self.assertEqual(label, '12. Sınıf · Günü birlik')
        self.assertEqual(_program_label('', False, False, label), label)

    def test_ayni_tc_ikinci_sinavda_ogrenci_cogalmaz(self):
        self._post([self._row()])
        res = self._post([self._row(ad='Ayse', soyad='Yilmaz')], exam=self.exam_b)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['rows'][0]['status'], 'mevcut_misafir')
        self.assertEqual(Ogrenci.objects.filter(tc_kimlik_no='10000000001').count(), 1)
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000001')
        self.assertEqual(ogrenci.kayit_turu, GUNU_BIRLIK_CODE)
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam, student=ogrenci).exists())
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam_b, student=ogrenci).exists())

    def test_asil_ogrenci_turu_bozulmaz_sinava_eklenir(self):
        asil = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Kaya',
            tc_kimlik_no='10000000002', kayit_turu='asil', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=asil, egitim_yili=self.yil, kurum=self.kurum, sube=self.sube,
            sinif_seviyesi=self.sev12, aktif_mi=True,
        )
        res = self._post([self._row(ad='Ali', soyad='Kaya', tc='10000000002')])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['rows'][0]['status'], 'kayitli_ogrenci')
        self.assertEqual(res.json()['rows'][0]['message'], 'Kayıtlı öğrenci, sınava eklendi.')
        asil.refresh_from_db()
        self.assertEqual(asil.kayit_turu, 'asil')
        self.assertEqual(Ogrenci.objects.filter(tc_kimlik_no='10000000002').count(), 1)
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam, student=asil).exists())

    def test_seviye_kitlesi_gunu_birlik_kaydi_almaz(self):
        self._post([self._row()])
        guest = Ogrenci.objects.get(tc_kimlik_no='10000000001')
        OgrenciKayit.objects.create(
            ogrenci=guest, egitim_yili=self.yil, kurum=self.kurum, sube=self.sube,
            sinif_seviyesi=self.sev12, aktif_mi=True,
        )
        classmate = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Sinif', soyad='Ogrenci', kayit_turu='asil',
        )
        OgrenciKayit.objects.create(
            ogrenci=classmate, egitim_yili=self.yil, kurum=self.kurum, sube=self.sube,
            sinif_seviyesi=self.sev12, aktif_mi=True,
        )
        recs = resolve_exam_candidates(
            kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.yil.id,
            seviye_ids=[self.sev12.id],
        )
        ids = {r.student_id for r in recs}
        self.assertIn(classmate.id, ids)
        self.assertNotIn(guest.id, ids)
        replace_auto_participants(self.exam_b, recs)
        self.assertFalse(ExamParticipant.objects.filter(exam=self.exam_b, student=guest).exists())
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam, student=guest).exists())

    def test_bozuk_tc_kaydi_durdurur_saglam_satir_ayrilir(self):
        rows = [
            self._row(tc='123'),
            self._row(ad='Veli', soyad='Demir', tc='10000000003'),
        ]
        preview = self._post(rows, commit=False)
        self.assertEqual(preview.status_code, 200, preview.content)
        statuses = [row['status'] for row in preview.json()['rows']]
        self.assertEqual(statuses, ['hata', 'yeni'])
        self.assertFalse(Ogrenci.objects.filter(tc_kimlik_no='10000000003').exists())

        saved = self._post(rows, commit=True)
        self.assertEqual(saved.status_code, 200, saved.content)
        saved_rows = saved.json()['rows']
        self.assertEqual(saved_rows[0]['status'], 'hata')
        self.assertEqual(saved_rows[1]['status'], 'yeni')
        self.assertTrue(Ogrenci.objects.filter(tc_kimlik_no='10000000003', kayit_turu=GUNU_BIRLIK_CODE).exists())
        self.assertFalse(Ogrenci.objects.filter(tc_kimlik_no='123').exists())

    def test_excel_onizleme_bozuk_satiri_ayirir(self):
        wb = Workbook()
        ws = wb.active
        ws.append(['Ad', 'Soyad', 'TC', 'Telefon', 'Seviye'])
        ws.append(['Kötü', 'Satır', '123', '', '12'])
        ws.append(['Veli', 'Demir', '10000000004', '05320000000', '12'])
        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = 'liste.xlsx'
        res = self.client.post(
            f'{URL}excel/',
            {'exam_id': self.exam.id, 'file': buf},
            format='multipart',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual([row['status'] for row in res.json()['rows']], ['hata', 'yeni'])
        self.assertFalse(Ogrenci.objects.filter(tc_kimlik_no='10000000004').exists())
        self.assertFalse(res.json()['committed'])

    def test_sablon_xlsx(self):
        res = self.client.get(f'{URL}sablon/', **self.headers)
        self.assertEqual(res.status_code, 200)
        wb = load_workbook(BytesIO(res.content))
        self.assertEqual([c.value for c in next(wb.active.iter_rows(max_row=1))], ['Ad', 'Soyad', 'TC', 'Telefon', 'Seviye'])


class GunuBirlikTamKayitTests(TestCase):
    def setUp(self):
        ensure_default_roles()
        self.kurum = Kurum.objects.create(ad='Yükselt Kurum', kod='YUK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='YUK-M')
        self.yil = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='8. Sınıf', kod='8',
        )
        self.hizmet = EkHizmet.objects.create(
            ad='Kütüphane', kod='KUT', hizmet_turu='kutuphane',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            brut_fiyat=1000, kdv_orani=10,
        )
        self.user = User.objects.create_user(username='yuk_memur', password='x')
        UserRole.objects.create(
            user=self.user,
            role=Role.objects.get(code='kurum_yoneticisi'),
            kurum=self.kurum,
            must_change_password=False,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }
        self.guest = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Eski', soyad='Misafir',
            tc_kimlik_no='10000000009', telefon='05329998877',
            kayit_turu=GUNU_BIRLIK_CODE, aktif_mi=True,
        )

    def test_tam_kayit_gunu_birlik_turunu_gunceller(self):
        category, _ = LookupCategory.objects.get_or_create(
            code='registration_type', defaults={'name': 'Kayıt Türü'},
        )
        asil, _ = LookupOption.objects.get_or_create(
            category=category, code='asil', defaults={'label': 'Asil', 'order': 1},
        )
        res = self.client.post(
            '/api/ogrenci-kayit/register/',
            data=json.dumps({
                'student': {
                    'tc_kimlik_no': '10000000009',
                    'ad': 'Yeni',
                    'soyad': 'Öğrenci',
                    'dogum_tarihi': '2012-03-01',
                    'kayit_turu': asil.id,
                },
                'enrollment': {
                    'egitim_yili': self.yil.id,
                    'sinif_seviyesi': self.seviye.id,
                },
                'address': {},
                'guardians': [],
                'package': {'ek_hizmet_ids': [self.hizmet.id]},
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.guest.refresh_from_db()
        self.assertEqual(self.guest.kayit_turu, 'asil')
        self.assertEqual(self.guest.ad, 'Yeni')
        self.assertTrue(OgrenciKayit.objects.filter(ogrenci=self.guest, egitim_yili=self.yil).exists())
        self.assertEqual(Ogrenci.objects.filter(tc_kimlik_no='10000000009').count(), 1)
