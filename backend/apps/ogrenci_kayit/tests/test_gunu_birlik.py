"""Günü birlik deneme kaydı: kısa kayıt, TC eşleme, kitleye sızmama."""
import json
from datetime import timedelta
from io import BytesIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
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
from apps.ogrenci.domain.models import Ogrenci, OgrenciAdres, OgrenciKayit, OgrenciVeli
from apps.ogrenci.interfaces.list_helpers import build_kayit_queryset
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
        today = timezone.localdate()
        self.exam = Exam.objects.create(
            name='TYT Deneme', exam_type='YKS_TYT', exam_date=today + timedelta(days=20),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.exam_b = Exam.objects.create(
            name='Başka Deneme', exam_type='YKS_TYT', exam_date=today + timedelta(days=40),
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
        self.assertEqual(label, '12. Sınıf · Tek deneme')
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

    def test_secenekler_gecmis_ve_baska_seviyeyi_gizler(self):
        today = timezone.localdate()
        self.exam.exam_date = today - timedelta(days=1)
        self.exam.save(update_fields=['exam_date'])
        lgs = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=today + timedelta(days=5),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        res = self.client.get(f'{URL}secenekler/?sinif_seviyesi={self.sev12.id}', **self.headers)
        self.assertEqual(res.status_code, 200, res.content)
        ids = [item['id'] for item in res.json()['sinavlar']]
        self.assertIn(self.exam_b.id, ids)
        self.assertNotIn(self.exam.id, ids)
        self.assertNotIn(lgs.id, ids)

        res8 = self.client.get(f'{URL}secenekler/?sinif_seviyesi={self.sev8.id}', **self.headers)
        ids8 = [item['id'] for item in res8.json()['sinavlar']]
        self.assertEqual(ids8, [lgs.id])

    def test_ilk_oturum_gecse_sonraki_oturum_listelenir(self):
        from apps.coaching.olcme_degerlendirme.models import ExamSessionModel

        today = timezone.localdate()
        ExamSessionModel.objects.create(
            exam=self.exam, name='1. Oturum', order=1,
            session_date=today - timedelta(days=2),
        )
        later = ExamSessionModel.objects.create(
            exam=self.exam, name='2. Oturum', order=2,
            session_date=today + timedelta(days=5),
        )
        self.exam.exam_date = today - timedelta(days=2)
        self.exam.save(update_fields=['exam_date'])
        res = self.client.get(f'{URL}secenekler/?sinif_seviyesi={self.sev12.id}', **self.headers)
        self.assertEqual(res.status_code, 200, res.content)
        item = next(row for row in res.json()['sinavlar'] if row['id'] == self.exam.id)
        self.assertEqual([session['id'] for session in item['sessions']], [later.id])
        self.assertEqual(item['exam_date'], (today + timedelta(days=5)).isoformat())

    def test_kitledeki_seviye_sinav_turunu_ezer(self):
        from apps.coaching.olcme_degerlendirme.models import ExamAudience

        ExamAudience.objects.create(exam=self.exam_b, sinif_seviyesi=self.sev8)
        res12 = self.client.get(f'{URL}secenekler/?sinif_seviyesi={self.sev12.id}', **self.headers)
        ids12 = [item['id'] for item in res12.json()['sinavlar']]
        self.assertNotIn(self.exam_b.id, ids12)
        self.assertIn(self.exam.id, ids12)
        res8 = self.client.get(f'{URL}secenekler/?sinif_seviyesi={self.sev8.id}', **self.headers)
        ids8 = [item['id'] for item in res8.json()['sinavlar']]
        self.assertEqual(ids8, [self.exam_b.id])

    def test_kisa_kayit_uyumsuz_seviyeyi_yazmaz(self):
        res = self._post([self._row(seviye=self.sev8, tc='10000000008')])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['rows'][0]['status'], 'hata')
        self.assertIn('sınıf', res.json()['rows'][0]['message'])
        self.assertFalse(Ogrenci.objects.filter(tc_kimlik_no='10000000008').exists())

    def test_gecmis_sinav_kisa_kaydi_reddeder(self):
        self.exam.exam_date = timezone.localdate() - timedelta(days=2)
        self.exam.save(update_fields=['exam_date'])
        res = self._post([self._row()])
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('geçmiş', res.json()['error'])


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

    def _register(self, payload):
        return self.client.post(
            '/api/ogrenci-kayit/register/',
            data=json.dumps(payload),
            content_type='application/json',
            **self.headers,
        )

    def _walk_payload(self, **student):
        base = {
            'tc_kimlik_no': '10000000046',
            'ad': 'Deneme',
            'soyad': 'Misafir',
            'dogum_tarihi': '2011-04-04',
            'telefon': '05321110046',
        }
        base.update(student)
        return {
            'student': base,
            'enrollment': {
                'egitim_yili': self.yil.id,
                'sinif_seviyesi': self.seviye.id,
                'ogrenci_no': 'GB-46',
            },
            'address': {'acik_adres': 'Deneme sokak 1'},
            'guardians': [{
                'ad': 'Veli',
                'soyad': 'Misafir',
                'tc_kimlik_no': '10000000047',
                'telefon': '05321110047',
            }],
            'veliSecimi': 'add',
            'package': {'ek_hizmet_ids': [self.hizmet.id]},
            'gunu_birlik': {'exam_id': self.exam.id},
        }

    def _nakit(self):
        from apps.finans.constants.payment_types import OdemeYontemiTipi
        from apps.finans.domain.financial_account import MaliHesap
        from apps.finans.domain.payment_method import OdemeYontemi

        hesap = MaliHesap.objects.create(sube=self.sube, ad='Nakit Kasa', tip='kasa')
        yontem = OdemeYontemi.objects.create(
            mali_hesap=hesap, kurum=self.kurum, ad='Nakit', tip=OdemeYontemiTipi.NAKIT,
        )
        return hesap, yontem

    def test_wizard_veli_okul_ve_secilen_sinavi_yazar_listeye_dusmez(self):
        from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant

        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=20),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        other = Exam.objects.create(
            name='Başka Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=40),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        res = self._register(self._walk_payload())
        self.assertEqual(res.status_code, 201, res.content)
        self.assertIn('sınava eklendi', res.json()['message'])
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000046')
        self.assertEqual(ogrenci.kayit_turu, GUNU_BIRLIK_CODE)
        self.assertTrue(OgrenciKayit.objects.filter(ogrenci=ogrenci, egitim_yili=self.yil).exists())
        self.assertTrue(OgrenciAdres.objects.filter(ogrenci=ogrenci, adres='Deneme sokak 1').exists())
        self.assertTrue(OgrenciVeli.objects.filter(ogrenci=ogrenci, ad='Veli', telefon='05321110047').exists())
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam, student=ogrenci).exists())
        self.assertFalse(ExamParticipant.objects.filter(exam=other, student=ogrenci).exists())
        ctx = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.yil.id,
        }
        params = {
            'q': '', 'all_years': False, 'durum': 'aktif',
            'sinif_seviyesi_ids': [], 'giris_turu': None, 'kayit_turu': None,
            'cinsiyet': None, 'paket_id': None, 'paket_turu': None, 'kalemler': [],
            'sinif_ids': [], 'school_ids': [], 'alan_ids': [], 'coach_ids': [],
            'kayit_tarihi_bas': None, 'kayit_tarihi_bit': None,
            'sort': 'created_at_desc', 'page': 1, 'page_size': 25,
        }
        qs, _ = build_kayit_queryset(ctx, params)
        self.assertNotIn(ogrenci.id, set(qs.values_list('ogrenci_id', flat=True)))
        params['kayit_turu'] = GUNU_BIRLIK_CODE
        listed, _ = build_kayit_queryset(ctx, params)
        self.assertIn(ogrenci.id, set(listed.values_list('ogrenci_id', flat=True)))

    def test_ana_liste_aramasi_deneme_ogrencisini_ayirir(self):
        self.exam = Exam.objects.create(
            name='Liste Deneme', exam_type='LGS',
            exam_date=timezone.localdate() + timedelta(days=10),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        payload = self._walk_payload()
        payload['gunu_birlik'] = {'kayit': True}
        payload['package'] = {}
        res = self._register(payload)
        self.assertEqual(res.status_code, 201, res.content)
        listed = self.client.get('/ogrenciler/api/list/?q=Misafir', **self.headers)
        self.assertEqual(listed.status_code, 200, listed.content)
        body = listed.json()
        self.assertEqual(body.get('total_count'), 0)
        self.assertGreaterEqual(body.get('deneme_count') or 0, 1)

    def test_gunu_birlik_once_ogrenci_sonra_listeden_deneme(self):
        from apps.odeme_takip.domain.models import Sozlesme
        from apps.ogrenci_kayit.application.deneme_ucret import MARKER
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler

        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=20),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        payload = self._walk_payload()
        payload['gunu_birlik'] = {'kayit': True}
        payload['package'] = {}
        res = self._register(payload)
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertNotIn('exam_id', body)
        self.assertIn('açıldı', body['message'])
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000046')
        self.assertEqual(ogrenci.kayit_turu, GUNU_BIRLIK_CODE)
        self.assertFalse(ExamParticipant.objects.filter(student=ogrenci).exists())
        rows = list_misafirler(self.kurum.id, self.sube.id, q='Deneme')
        row = next(item for item in rows if item['id'] == ogrenci.id)
        self.assertEqual(row['sinavlar'], [])
        self.assertEqual(row['sinif_seviyesi_id'], self.seviye.id)
        self.assertEqual(row['sinif_seviyesi'], '8. Sınıf')

        _hesap, yontem = self._nakit()
        kayit = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/sinav/',
            data=json.dumps({
                'islem': 'kayit',
                'ogrenci_id': ogrenci.id,
                'exam_id': self.exam.id,
                'deneme_ucreti': '250',
                'odeme_yontemi_id': yontem.id,
                'mali_hesap_id': _hesap.id,
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(kayit.status_code, 200, kayit.content)
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam, student=ogrenci).exists())
        sozlesme = Sozlesme.objects.get(ogrenci=ogrenci, notlar__contains=MARKER)
        self.assertEqual(int(sozlesme.net_tutar), 250)

        tekrar = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/sinav/',
            data=json.dumps({
                'islem': 'kayit',
                'ogrenci_id': ogrenci.id,
                'exam_id': self.exam.id,
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(tekrar.status_code, 400, tekrar.content)
        self.assertIn('zaten', tekrar.json()['detail'])

    def test_kayitli_ogrenci_turu_degismez_sinava_eklenir(self):
        from apps.coaching.olcme_degerlendirme.models import Exam, ExamParticipant

        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=20),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        asil = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Asıl', soyad='Öğrenci',
            tc_kimlik_no='10000000048', telefon='05321110048',
            kayit_turu='asil', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=asil, kurum=self.kurum, sube=self.sube, egitim_yili=self.yil, aktif_mi=True,
        )
        res = self._register(self._walk_payload(
            tc_kimlik_no='10000000048', ad='Asıl', soyad='Öğrenci', telefon='05321110048',
        ))
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['message'], 'Kayıtlı öğrenci, sınava eklendi.')
        asil.refresh_from_db()
        self.assertEqual(asil.kayit_turu, 'asil')
        self.assertEqual(asil.ad, 'Asıl')
        self.assertEqual(OgrenciKayit.objects.filter(ogrenci=asil).count(), 1)
        self.assertTrue(ExamParticipant.objects.filter(exam=self.exam, student=asil).exists())

    def test_pasif_deneme_tek_deneme_formunda_listeye_doner(self):
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler

        pasif = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Eski', soyad='Deneme',
            tc_kimlik_no='10000000049', telefon='05321110049',
            kayit_turu='deneme_kulubu', aktif_mi=False,
        )
        kayit = OgrenciKayit.objects.create(
            ogrenci=pasif, kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            sinif_seviyesi=self.seviye, aktif_mi=False, okul_no='DK-49',
        )
        payload = {
            'student': {
                'tc_kimlik_no': '10000000049',
                'ad': 'Eski',
                'soyad': 'Deneme',
                'dogum_tarihi': '2011-04-04',
                'telefon': '05321110049',
            },
            'enrollment': {
                'egitim_yili': self.yil.id,
                'sinif_seviyesi': self.seviye.id,
                'ogrenci_no': 'GB-49',
            },
            'address': {},
            'guardians': [],
            'package': {},
            'gunu_birlik': {'kayit': True},
        }
        res = self._register(payload)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertIn('açıldı', res.json()['message'])
        pasif.refresh_from_db()
        kayit.refresh_from_db()
        self.assertEqual(pasif.kayit_turu, GUNU_BIRLIK_CODE)
        self.assertTrue(pasif.aktif_mi)
        self.assertTrue(kayit.aktif_mi)
        self.assertEqual(kayit.sinif_seviyesi_id, self.seviye.id)
        ids = {row['id'] for row in list_misafirler(self.kurum.id, self.sube.id, q='Deneme')}
        self.assertIn(pasif.id, ids)

    def test_aktif_kurum_kaydi_sinavsiz_tek_deneme_listesine_yazilmaz(self):
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler

        asil = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Asıl', soyad='Kayıt',
            tc_kimlik_no='10000000050', telefon='05321110050',
            kayit_turu='asil', aktif_mi=True,
        )
        OgrenciKayit.objects.create(
            ogrenci=asil, kurum=self.kurum, sube=self.sube, egitim_yili=self.yil, aktif_mi=True,
        )
        payload = {
            'student': {
                'tc_kimlik_no': '10000000050',
                'ad': 'Asıl',
                'soyad': 'Kayıt',
                'dogum_tarihi': '2011-04-04',
                'telefon': '05321110050',
            },
            'enrollment': {
                'egitim_yili': self.yil.id,
                'sinif_seviyesi': self.seviye.id,
            },
            'address': {},
            'guardians': [],
            'package': {},
            'gunu_birlik': {'kayit': True},
        }
        res = self._register(payload)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('kurum kaydında', res.json()['detail'])
        asil.refresh_from_db()
        self.assertEqual(asil.kayit_turu, 'asil')
        self.assertTrue(asil.aktif_mi)
        ids = {row['id'] for row in list_misafirler(self.kurum.id, self.sube.id)}
        self.assertNotIn(asil.id, ids)

    def test_paketsiz_kayit_giris_belgesi_uretir(self):
        from apps.communication.application.communication_service import SendResult
        from apps.ogrenci.domain.models import OgrenciEgitimPaketi
        from apps.ogrenci_kayit.application.giris_belgesi import build_giris_belgesi_html, load_giris_context

        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=12),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        payload = self._walk_payload()
        payload['package'] = {}
        res = self._register(payload)
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body['exam_id'], self.exam.id)
        self.assertTrue(body['participant_id'])
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000046')
        self.assertFalse(OgrenciEgitimPaketi.objects.filter(ogrenci=ogrenci).exists())

        ctx, reason = load_giris_context(self.kurum.id, self.sube.id, self.exam.id, ogrenci.id)
        self.assertEqual(reason, '')
        html = build_giris_belgesi_html(ctx)
        self.assertIn('SINAV GİRİŞ BELGESİ', html)
        self.assertIn('Deneme Misafir', html)
        self.assertNotIn('class="student"', html)
        self.assertIn('10000000046', html)
        self.assertNotIn('Tarihi gelmemiş', html)
        self.assertNotIn('Girmemiş', html)
        self.assertIn('page-foot', html)
        self.assertIn('T.C. KİMLİK NO', html)
        self.assertIn('LGS Deneme', html)
        self.assertIn('HAZIR BULUNMA', html)
        self.assertIn('Kurşun kalem, silgi ve kalemtıraşınızı getiriniz.', html)
        self.assertIn('Telefon ve akıllı saatlerinizi görevliye teslim ediniz.', html)
        self.assertIn('Belirtilen salon ve sıra numarasına göre yerleşiniz.', html)
        self.assertIn('Sınavdan 15 dakika önce salonda hazır bulununuz.', html)
        self.assertIn('Sınav sonuç bilgilendirmesi', html)
        self.assertIn('WhatsApp numaralarına gönderilecektir', html)
        self.assertIn('class="seatbox"', html)
        self.assertEqual(body['seat_status'], 'no_room')

        pdf_bytes = b'%PDF-1.4\n' + (b'x' * 3000)
        with patch(
            'apps.communication.application.html_to_pdf.render_html_to_pdf',
            return_value=pdf_bytes,
        ):
            pdf = self.client.get(
                f'/api/ogrenci-kayit/gunu-birlik/giris-belgesi/?exam_id={self.exam.id}&ogrenci_id={ogrenci.id}',
                **self.headers,
            )
        self.assertEqual(pdf.status_code, 200, pdf.content[:200])
        self.assertEqual(pdf['Content-Type'], 'application/pdf')
        self.assertTrue(pdf.content.startswith(b'%PDF'))

        with patch(
            'apps.communication.application.notification_dispatcher.dispatch_event',
            return_value=SendResult(success=True),
        ) as notify, patch(
            'apps.communication.application.html_to_pdf.render_html_to_pdf',
            return_value=pdf_bytes,
        ):
            sent = self.client.post(
                '/api/ogrenci-kayit/gunu-birlik/giris-belgesi/whatsapp/',
                data=json.dumps({
                    'exam_id': self.exam.id,
                    'ogrenci_id': ogrenci.id,
                    'alicilar': ['ogrenci', 'veli'],
                }),
                content_type='application/json',
                **self.headers,
            )
        self.assertEqual(sent.status_code, 200, sent.content)
        self.assertEqual(sent.json()['sent'], 2)
        self.assertEqual(notify.call_count, 2)
        self.assertEqual(notify.call_args_list[0].args[1], 'sinav.giris_belgesi')

    def test_ayin_sinav_tablosu_seviyeye_ve_katilima_gore(self):
        from apps.coaching.olcme_degerlendirme.models import ExamParticipant, ExamSessionModel
        from apps.ogrenci_kayit.application.giris_belgesi import build_giris_belgesi_html, load_giris_context

        today = timezone.localdate()
        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=today,
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        res = self._register(self._walk_payload())
        self.assertEqual(res.status_code, 201, res.content)
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000046')

        missed = Exam.objects.create(
            name='Kaçırılan LGS', exam_type='LGS', exam_date=today.replace(day=1),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        ExamSessionModel.objects.create(exam=missed, name='Sabah', order=1, session_date=today.replace(day=1))
        sat = Exam.objects.create(
            name='Girilen LGS', exam_type='LGS', exam_date=today.replace(day=1),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        ExamParticipant.objects.create(exam=sat, student=ogrenci, sinif_seviyesi=self.seviye)
        Exam.objects.create(
            name='TYT Başka', exam_type='YKS_TYT', exam_date=today,
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        later = (today.replace(day=28) + timedelta(days=10)).replace(day=1)
        Exam.objects.create(
            name='Gelecek Ay LGS', exam_type='LGS', exam_date=later,
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        from calendar import monthrange
        last_day = today.replace(day=monthrange(today.year, today.month)[1])
        spill_day = last_day + timedelta(days=2)
        spanning = Exam.objects.create(
            name='Sarkan LGS', exam_type='LGS', exam_date=last_day,
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        ExamSessionModel.objects.create(
            exam=spanning, name='Ilk Gun', order=1, session_date=last_day,
        )
        ExamSessionModel.objects.create(
            exam=spanning, name='Sonraki Ay', order=2, session_date=spill_day,
        )

        ctx, reason = load_giris_context(self.kurum.id, self.sube.id, self.exam.id, ogrenci.id)
        self.assertEqual(reason, '')
        html = build_giris_belgesi_html(ctx)
        self.assertIn('KAÇIRILAN LGS', html)
        self.assertEqual(html.count('KAÇIRILAN LGS'), 1)
        self.assertNotIn('Sabah', html)
        self.assertIn('GİRİLEN LGS', html)
        self.assertNotIn('TYT Başka', html)
        self.assertNotIn('TYT BAŞKA', html)
        self.assertNotIn('Gelecek Ay LGS', html)
        self.assertIn('SARKAN LGS', html)
        self.assertNotIn('Sonraki Ay', html)
        from apps.ogrenci_kayit.application.giris_belgesi import _date_span
        self.assertIn(_date_span([last_day, spill_day]), html)
        self.assertNotIn('Girmemiş', html)
        self.assertNotIn('Tarihi gelmemiş', html)
        self.assertNotIn('>Oturum<', html)
        self.assertIn('SINAV TAKVİMİ', html)
        self.assertEqual(html.count('class="mark reg"'), 2)
        self.assertEqual(html.count('class="mark none"'), 2)
        from calendar import monthrange
        if today.day < monthrange(today.year, today.month)[1]:
            Exam.objects.create(
                name='Yarınki LGS', exam_type='LGS',
                exam_date=today + timedelta(days=1),
                kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
            )
            ctx, reason = load_giris_context(self.kurum.id, self.sube.id, self.exam.id, ogrenci.id)
            html = build_giris_belgesi_html(ctx)
            self.assertIn('YARINKİ LGS', html)
            chunk = html[html.index('YARINKİ LGS'):html.index('YARINKİ LGS') + 240]
            self.assertIn('class="mark none"', chunk)
            self.assertNotIn('class="mark reg"', chunk)

    def test_gecmis_ve_uyumsuz_deneme_kaydi_reddedilir(self):
        past = Exam.objects.create(
            name='Eski LGS', exam_type='LGS',
            exam_date=timezone.localdate() - timedelta(days=3),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        self.exam = past
        payload = self._walk_payload()
        res = self._register(payload)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('geçmiş', res.json()['detail'])

        tyt = Exam.objects.create(
            name='TYT Deneme', exam_type='YKS_TYT',
            exam_date=timezone.localdate() + timedelta(days=8),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        payload['gunu_birlik'] = {'exam_id': tyt.id}
        res = self._register(payload)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('sınıf seviyesine', res.json()['detail'])

    def test_deneme_ucreti_son_tutari_hatirlar_ve_bos_birakilirsa_yazmaz(self):
        from apps.finans.application.dashboard_overview_service import _bugun_alinan_toplam
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
        from apps.odeme_takip.domain.models import Sozlesme, Tahsilat

        hesap, yontem = self._nakit()
        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=12),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        payload = self._walk_payload()
        payload['package'] = {}
        payload['gunu_birlik']['deneme_ucreti'] = '1.500'
        payload['gunu_birlik']['odeme_yontemi_id'] = yontem.id
        payload['gunu_birlik']['mali_hesap_id'] = hesap.id
        res = self._register(payload)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['deneme_ucreti'], 1500)
        self.assertNotIn('Ödeme şekli', res.json()['message'])
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000046')
        sozlesme = Sozlesme.objects.get(ogrenci=ogrenci)
        self.assertEqual(sozlesme.net_tutar, 1500)
        self.assertEqual(sozlesme.paket_turu, 'deneme')
        self.assertEqual(sozlesme.mali_hesap_id, hesap.id)
        self.assertEqual(sozlesme.odeme_yontemi_id, yontem.id)
        self.assertFalse(Tahsilat.objects.filter(sozlesme=sozlesme).exists())
        gelir = GelirKaydi.objects.get(aciklama__contains='deneme ücreti')
        self.assertEqual(gelir.durum, 'tahsil_edildi')
        self.assertEqual(int(gelir.tahsil_edilen), 1500)
        self.assertEqual(int(GelirTahsilat.objects.get(gelir_kaydi=gelir).tutar), 1500)
        self.assertEqual(int(BakiyeHareketiRepository.son_bakiye(hesap.id)), 1500)
        self.assertEqual(
            _bugun_alinan_toplam(self.kurum.id, timezone.localdate(), self.sube.id),
            1500,
        )

        listed = self.client.get('/api/ogrenci-kayit/gunu-birlik/', **self.headers)
        self.assertEqual(listed.status_code, 200, listed.content)
        row = next(item for item in listed.json()['ogrenciler'] if item['id'] == ogrenci.id)
        self.assertEqual(row['ogrenci_no'], 'GB-46')

        remembered = self.client.get(
            '/api/ogrenci-kayit/gunu-birlik/ucret/?tc=10000000046',
            **self.headers,
        )
        self.assertEqual(remembered.status_code, 200, remembered.content)
        self.assertEqual(remembered.json()['tutar'], 1500)

        empty = self._walk_payload(
            tc_kimlik_no='10000000050', ad='Bos', soyad='Ucret', telefon='05321110050',
        )
        empty['package'] = {}
        empty['enrollment']['ogrenci_no'] = 'GB-50'
        empty['gunu_birlik']['deneme_ucreti'] = ''
        res = self._register(empty)
        self.assertEqual(res.status_code, 201, res.content)
        bos = Ogrenci.objects.get(tc_kimlik_no='10000000050')
        self.assertFalse(Sozlesme.objects.filter(ogrenci=bos).exists())

        bad = self._walk_payload(
            tc_kimlik_no='10000000051', ad='Hatali', soyad='Ucret', telefon='05321110051',
        )
        bad['package'] = {}
        bad['gunu_birlik']['deneme_ucreti'] = '12,50'
        res = self._register(bad)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('tam sayı', res.json()['detail'])

    def test_oturum_degisir_iptal_finansi_kapatir_kurum_kaydi_listede_kalir(self):
        from apps.coaching.olcme_degerlendirme.models import ExamParticipant, ExamSessionModel
        from apps.odeme_takip.domain.models import Sozlesme, Tahsilat

        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=12),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        hesap, yontem = self._nakit()
        payload = self._walk_payload(telefon='05321110060')
        payload['package'] = {}
        payload['gunu_birlik']['deneme_ucreti'] = '750'
        payload['gunu_birlik']['odeme_yontemi_id'] = yontem.id
        payload['gunu_birlik']['mali_hesap_id'] = hesap.id
        res = self._register(payload)
        self.assertEqual(res.status_code, 201, res.content)
        ogrenci = Ogrenci.objects.get(tc_kimlik_no='10000000046')
        sabah = ExamSessionModel.objects.create(
            exam=self.exam, name='Sabah', order=1,
            session_date=timezone.localdate() + timedelta(days=12),
        )
        aksam = ExamSessionModel.objects.create(
            exam=self.exam, name='Akşam', order=2,
            session_date=timezone.localdate() + timedelta(days=13),
        )
        moved = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/sinav/',
            data=json.dumps({
                'islem': 'oturum',
                'ogrenci_id': ogrenci.id,
                'exam_id': self.exam.id,
                'exam_session_id': aksam.id,
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(moved.status_code, 200, moved.content)
        participant = ExamParticipant.objects.get(exam=self.exam, student=ogrenci)
        self.assertEqual(participant.exam_session_id, aksam.id)
        self.assertNotEqual(participant.exam_session_id, sabah.id)
        self.assertTrue(Sozlesme.objects.filter(ogrenci=ogrenci, net_tutar=750).exclude(durum='iptal').exists())

        cancelled = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/sinav/',
            data=json.dumps({
                'islem': 'iptal',
                'ogrenci_id': ogrenci.id,
                'exam_id': self.exam.id,
            }),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.content)
        self.assertFalse(ExamParticipant.objects.filter(exam=self.exam, student=ogrenci).exists())
        from apps.finans.domain.gelir_kaydi import GelirKaydi
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository

        sozlesme = Sozlesme.objects.get(ogrenci=ogrenci)
        self.assertEqual(sozlesme.durum, 'iptal')
        self.assertFalse(Tahsilat.objects.filter(sozlesme=sozlesme, durum='aktif').exists())
        self.assertEqual(GelirKaydi.objects.get(aciklama__contains='deneme ücreti').durum, 'iptal')
        self.assertEqual(int(BakiyeHareketiRepository.son_bakiye(hesap.id)), 0)

        from ..application.deneme_ucret import ensure_deneme_izi

        ogrenci.kayit_turu = 'asil'
        ogrenci.save(update_fields=['kayit_turu'])
        kayit = OgrenciKayit.objects.get(ogrenci=ogrenci)
        ensure_deneme_izi(ogrenci=ogrenci, kayit=kayit)
        listed = self.client.get('/api/ogrenci-kayit/gunu-birlik/', **self.headers)
        self.assertEqual(listed.status_code, 200, listed.content)
        self.assertTrue(any(item['id'] == ogrenci.id and item['kurum_kaydi'] for item in listed.json()['ogrenciler']))
        asil = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Duz', soyad='Ogrenci',
            tc_kimlik_no='10000000061', kayit_turu='asil', aktif_mi=True,
        )
        ExamParticipant.objects.create(
            exam=self.exam, student=asil, source=ExamParticipant.Source.MANUAL,
            sinif_seviyesi=self.seviye,
        )
        listed = self.client.get('/api/ogrenci-kayit/gunu-birlik/', **self.headers)
        self.assertFalse(any(item['id'] == asil.id for item in listed.json()['ogrenciler']))
        ctx = {
            'kurum_id': self.kurum.id,
            'sube_id': self.sube.id,
            'egitim_yili_id': self.yil.id,
        }
        params = {
            'q': '', 'all_years': False, 'durum': 'aktif',
            'sinif_seviyesi_ids': [], 'giris_turu': None, 'kayit_turu': None,
            'cinsiyet': None, 'paket_id': None, 'paket_turu': None, 'kalemler': [],
            'sinif_ids': [], 'school_ids': [], 'alan_ids': [], 'coach_ids': [],
            'kayit_tarihi_bas': None, 'kayit_tarihi_bit': None,
            'sort': 'created_at_desc', 'page': 1, 'page_size': 25,
        }
        normal, _ = build_kayit_queryset(ctx, params)
        self.assertIn(ogrenci.id, set(normal.values_list('ogrenci_id', flat=True)))

    def _review_exam(self):
        self.exam = Exam.objects.create(
            name='LGS Deneme', exam_type='LGS', exam_date=timezone.localdate() + timedelta(days=10),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        return self.exam

    def _review_kayit(self):
        return OgrenciKayit.objects.create(
            ogrenci=self.guest, kurum=self.kurum, sube=self.sube,
            egitim_yili=self.yil, sinif_seviyesi=self.seviye, okul_no='GB-987',
        )

    def _review_action(self, body):
        return self.client.post('/api/ogrenci-kayit/gunu-birlik/sinav/', body, format='json', **self.headers)

    def test_arama_ad_soyad_ve_ogrenci_numarasi(self):
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler
        self._review_kayit()
        for query in ['Eski Misafir', 'Misafir Eski', 'GB-987']:
            with self.subTest(query=query):
                rows = list_misafirler(self.kurum.id, self.sube.id, q=query, egitim_yili_id=self.yil.id)
                self.assertEqual([row['id'] for row in rows], [self.guest.id])

    def test_liste_bes_yuz_kayitta_kesilmez(self):
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler
        Ogrenci.objects.bulk_create([
            Ogrenci(kurum=self.kurum, sube=self.sube, ad='Liste', soyad=str(i),
                    tc_kimlik_no=str(20000000000 + i), kayit_turu=GUNU_BIRLIK_CODE)
            for i in range(501)
        ])
        rows = list_misafirler(self.kurum.id, self.sube.id)
        self.assertEqual(len(rows), 502)
        self.assertIn(self.guest.id, {row['id'] for row in rows})

    def test_hatali_sinif_yeni_ve_mevcut_kayitta_degisiklik_birakmaz(self):
        self._review_exam()
        for tc in [self.guest.tc_kimlik_no, '10000000046']:
            with self.subTest(tc=tc):
                payload = self._walk_payload(tc_kimlik_no=tc, ad='Degismemeli')
                payload['package'] = {}
                payload['gunu_birlik'] = {'kayit': True}
                payload['enrollment']['sinif'] = 99999999
                res = self._register(payload)
                self.assertEqual(res.status_code, 400, res.content)
        self.guest.refresh_from_db()
        self.assertEqual(self.guest.ad, 'Eski')
        self.assertFalse(Ogrenci.objects.filter(tc_kimlik_no='10000000046').exists())
        self.assertFalse(OgrenciKayit.objects.filter(ogrenci=self.guest).exists())

    def test_ucret_hatasi_sihirbazdaki_kaydi_geri_alir(self):
        self._review_exam()
        payload = self._walk_payload()
        payload['package'] = {}
        payload['gunu_birlik']['deneme_ucreti'] = '250'
        res = self._register(payload)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertIn('Ödeme şekli', res.json()['detail'])
        self.assertFalse(Ogrenci.objects.filter(tc_kimlik_no='10000000046').exists())
        self.assertFalse(ExamParticipant.objects.filter(exam=self.exam).exists())

    def test_listeden_ucret_hatasi_geri_alinir_ve_tekrar_denenebilir(self):
        from apps.odeme_takip.domain.models import Sozlesme
        self._review_exam()
        self._review_kayit()
        body = {'islem': 'kayit', 'ogrenci_id': self.guest.id, 'exam_id': self.exam.id, 'deneme_ucreti': '250'}
        res = self._review_action(body)
        self.assertEqual(res.status_code, 400, res.content)
        self.assertFalse(ExamParticipant.objects.filter(exam=self.exam, student=self.guest).exists())
        self.assertFalse(Sozlesme.objects.filter(ogrenci=self.guest).exists())
        hesap, yontem = self._nakit()
        body.update(odeme_yontemi_id=yontem.id, mali_hesap_id=hesap.id)
        res = self._review_action(body)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(ExamParticipant.objects.filter(exam=self.exam, student=self.guest).count(), 1)
        self.assertEqual(Sozlesme.objects.filter(ogrenci=self.guest, net_tutar=250).count(), 1)

    def test_aktif_yil_ve_sinav_kaydi_dogru_seviyeyi_kullanir(self):
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler
        self._review_exam()
        self._review_kayit()
        yeni_yil = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        diger = SinifSeviyesi.objects.create(kurum=self.kurum, sube=self.sube, ad='7. Sınıf', kod='7')
        OgrenciKayit.objects.create(ogrenci=self.guest, kurum=self.kurum, sube=self.sube,
                                   egitim_yili=yeni_yil, sinif_seviyesi=diger, okul_no='YENI-7')
        row = list_misafirler(self.kurum.id, self.sube.id, egitim_yili_id=self.yil.id)[0]
        self.assertEqual(row['sinif_seviyesi_id'], self.seviye.id)
        self.assertEqual(row['ogrenci_no'], 'GB-987')
        self.assertEqual(list_misafirler(self.kurum.id, self.sube.id, q='YENI-7', egitim_yili_id=self.yil.id), [])
        res = self._review_action({'islem': 'kayit', 'ogrenci_id': self.guest.id, 'exam_id': self.exam.id})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(ExamParticipant.objects.get(exam=self.exam, student=self.guest).sinif_seviyesi_id, self.seviye.id)

    def test_coklu_oturumda_secili_katilim_degistirilir_ve_silinir(self):
        from apps.coaching.olcme_degerlendirme.models import ExamSessionModel
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler
        self._review_exam()
        sessions = [ExamSessionModel.objects.create(exam=self.exam, name=f'Oturum {i}', order=i,
                    session_date=timezone.localdate() + timedelta(days=10 + i)) for i in range(3)]
        parts = [ExamParticipant.objects.create(exam=self.exam, student=self.guest, exam_session=session,
                    source=ExamParticipant.Source.MANUAL, sinif_seviyesi=self.seviye) for session in sessions[:2]]
        row = list_misafirler(self.kurum.id, self.sube.id)[0]
        self.assertEqual(len(row['sinavlar']), 2)
        self.assertEqual(row['deneme_sayisi'], 1)
        body = {'islem': 'oturum', 'ogrenci_id': self.guest.id, 'exam_id': self.exam.id,
                'exam_session_id': sessions[2].id}
        self.assertEqual(self._review_action(body).status_code, 400)
        body['participant_id'] = parts[1].id
        res = self._review_action(body)
        self.assertEqual(res.status_code, 200, res.content)
        parts[0].refresh_from_db()
        parts[1].refresh_from_db()
        self.assertEqual(parts[0].exam_session_id, sessions[0].id)
        self.assertEqual(parts[1].exam_session_id, sessions[2].id)
        with patch('apps.ogrenci_kayit.application.deneme_ucret.void_deneme_ucreti', return_value=1) as void:
            body['islem'] = 'iptal'
            res = self._review_action(body)
            self.assertEqual(res.status_code, 200, res.content)
            self.assertTrue(ExamParticipant.objects.filter(pk=parts[0].id).exists())
            self.assertFalse(ExamParticipant.objects.filter(pk=parts[1].id).exists())
            void.assert_not_called()
            body['participant_id'] = parts[0].id
            self.assertEqual(self._review_action(body).status_code, 200)
            void.assert_called_once()

    def _paid_deneme_sale(self):
        from apps.odeme_takip.domain.models import Sozlesme
        hesap, yontem = self._nakit()
        self.exam = Exam.objects.create(
            name='Tek deneme finans testi', exam_type='LGS',
            exam_date=timezone.localdate() + timedelta(days=12),
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        payload = self._walk_payload()
        payload['package'] = {}
        payload['gunu_birlik'].update(
            deneme_ucreti='250', odeme_yontemi_id=yontem.id, mali_hesap_id=hesap.id,
        )
        response = self._register(payload)
        self.assertEqual(response.status_code, 201, response.content)
        return Sozlesme.objects.get(ogrenci__tc_kimlik_no='10000000046'), hesap

    def test_tek_deneme_sozlesme_listesi_ve_alacak_raporuna_girmez(self):
        from apps.finans.infrastructure.bakiye_hareketi_repository import BakiyeHareketiRepository
        sale, hesap = self._paid_deneme_sale()
        response = self.client.get('/odeme-takip/api/sozlesmeler/', **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json(), [])
        dashboard = self.client.get('/odeme-takip/api/dashboard/', **self.headers)
        self.assertEqual(dashboard.status_code, 200, dashboard.content)
        for key in ('toplam_sozlesme', 'toplam_hacim', 'acik_alacak', 'brut_toplam', 'sozlesmesiz_ogrenci_sayisi'):
            self.assertEqual(float(dashboard.json()[key]), 0, key)
        self.assertEqual(sale.toplam_odenen, 250)
        self.assertEqual(sale.kalan_borc, 0)
        self.assertEqual(int(BakiyeHareketiRepository.son_bakiye(hesap.id)), 250)
        # URL bilinse bile bu satışa ikinci sözleşme tahsilatı açılamaz.
        detail = self.client.get(f'/odeme-takip/api/sozlesmeler/{sale.id}/', **self.headers)
        self.assertEqual(detail.status_code, 404)
        duplicate = self.client.post(
            '/odeme-takip/api/tahsilatlar/create/',
            {'sozlesme_id': sale.id, 'tutar': 250}, format='json', **self.headers,
        )
        self.assertEqual(duplicate.status_code, 404)
        self.assertEqual(int(BakiyeHareketiRepository.son_bakiye(hesap.id)), 250)

    def test_deneme_kulubu_sozlesmesi_listede_kalir(self):
        sale, _ = self._paid_deneme_sale()
        sale.pk = None
        sale.sozlesme_no = 'KULUP-TEST'
        sale.notlar = 'Yıllık deneme kulübü sözleşmesi'
        sale.paket_adi = 'Deneme kulübü'
        sale.save()
        response = self.client.get('/odeme-takip/api/sozlesmeler/', **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual([row['id'] for row in response.json()], [sale.id])
        self.assertEqual(sale.toplam_odenen, 0)
        self.assertEqual(sale.kalan_borc, 250)

    def test_deneme_odemesi_yalniz_gercek_tahsilatla_gosterilir(self):
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat
        from apps.finans.constants.gider_types import OdemeDurum
        sale, _ = self._paid_deneme_sale()
        self.assertEqual(sale.toplam_odenen, 250)
        # İptal edilmiş/kısmi/missing gelir, tamamlandı statüsüyle ödenmiş varsayılmaz.
        collection = GelirTahsilat.objects.get()
        collection.tutar = 100
        collection.save(update_fields=['tutar'])
        self.assertEqual(sale.toplam_odenen, 100)
        self.assertEqual(sale.kalan_borc, 150)
        collection.durum = OdemeDurum.IPTAL
        collection.save(update_fields=['durum'])
        self.assertEqual(sale.toplam_odenen, 0)
        sale.notlar = 'gunu_birlik_deneme_ucreti gelir:99999999'
        sale.save(update_fields=['notlar'])
        self.assertEqual(sale.toplam_odenen, 0)
        self.client.force_login(self.user)
        response = self.client.get(f'/ogrenciler/api/{sale.ogrenci_id}/finans-ozet/', **self.headers)
        self.assertEqual(response.status_code, 200, response.content)
        row = next(row for row in response.json()['sozlesmeler'] if row['id'] == sale.id)
        self.assertEqual(row['toplam_odenen'], 0)
        self.assertEqual(row['tahsilatlar'], [])

    def test_deneme_canli_kontrolu_salt_okunur_ve_sube_sinirli(self):
        from io import StringIO
        from django.core.management import call_command
        from apps.odeme_takip.domain.models import Sozlesme
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat
        sale, _ = self._paid_deneme_sale()
        before = (Sozlesme.objects.count(), GelirTahsilat.objects.count())
        out = StringIO()
        call_command('audit_deneme_satislari', kurum_id=self.kurum.id, sube_id=self.sube.id, stdout=out)
        result = json.loads(out.getvalue())
        self.assertTrue(result['salt_okunur'])
        self.assertEqual(result['satis_izi_sayisi'], 1)
        self.assertEqual(result['inceleme_gereken'], 0)
        self.assertEqual(result['kayitlar'][0]['satis_izi_id'], sale.id)
        self.assertEqual(before, (Sozlesme.objects.count(), GelirTahsilat.objects.count()))
        out = StringIO()
        call_command('audit_deneme_satislari', kurum_id=self.kurum.id, sube_id=self.sube.id + 9999, stdout=out)
        self.assertEqual(json.loads(out.getvalue())['satis_izi_sayisi'], 0)

    def test_f01_dashboard_dogum_gunu_kitle_arama_ve_liderlik_sizintisi_kapali(self):
        from apps.communication.application.audience_query import AudienceQueryService, empty_query
        from apps.communication.application.birthday_wish_service import (
            _birthday_students,
            list_staff_birthdays,
        )
        from apps.dashboard.application.admin_dashboard_service import AdminDashboardService
        from apps.student_portal.services.achievement_service import build_weekly_focus_leaderboard

        today = timezone.localdate()
        sale, _ = self._paid_deneme_sale()
        walk_student = sale.ogrenci
        walk_student.dogum_tarihi = today.replace(year=today.year - 14)
        walk_student.telefon = '05521234567'
        walk_student.whatsapp_uygun = True
        walk_student.save(update_fields=['dogum_tarihi', 'telefon', 'whatsapp_uygun'])

        summary = AdminDashboardService.build(
            kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.yil.id,
        )
        self.assertEqual(summary['ogrenci']['kpis']['aktif'], 0)
        self.assertEqual(summary['ogrenci']['kpis']['yeni_kayit_bu_ay'], 0)
        self.assertEqual(summary['ogrenci']['kpis']['aktif_sozlesme'], 0)
        self.assertEqual(summary['ogrenci']['dogum_gunleri']['yaklasan'], [])

        self.assertEqual(list(_birthday_students(self.kurum.id, today)), [])
        self.assertEqual(
            list_staff_birthdays(self.kurum.id, on_date=today),
            [],
        )

        preview = AudienceQueryService.resolve(
            self.kurum.id,
            empty_query(['ogrenci']),
            context_sube_id=self.sube.id,
            context_egitim_yili_id=self.yil.id,
        )
        self.assertEqual(preview.total, 0)

        self.client.force_login(self.user)
        search_res = self.client.get(
            f'/ogrenciler/api/search/?q={walk_student.ad}', **self.headers,
        )
        self.assertEqual(search_res.status_code, 200)
        self.assertEqual(search_res.json()['ogrenciler'], [])

        search_inc = self.client.get(
            f'/ogrenciler/api/search/?q={walk_student.ad}&include_gunu_birlik=1',
            **self.headers,
        )
        self.assertEqual([r['id'] for r in search_inc.json()['ogrenciler']], [walk_student.id])

        normal_student = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Asil',
            soyad='Öğrenci',
            tc_kimlik_no='10000000148',
            kayit_turu='asil',
            aktif_mi=True,
        )
        normal_kayit = OgrenciKayit.objects.create(
            ogrenci=normal_student,
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
            sinif_seviyesi=self.seviye,
            okul_no='ASIL-1',
            aktif_mi=True,
        )
        lb = build_weekly_focus_leaderboard(
            {
                'ogrenci': normal_student,
                'kayit': normal_kayit,
                'kurum_id': self.kurum.id,
                'sube_id': self.sube.id,
                'egitim_yili_id': self.yil.id,
            },
            today,
        )
        self.assertEqual(lb['active_competitors'], 1)

    def test_f03_f11_excel_koltuk_atama_ve_farkli_yil_sinif_seviyesi_fallback(self):
        from apps.coaching.olcme_degerlendirme.models import ExamRoom
        from apps.ogrenci_kayit.application.gunu_birlik import commit_rows, list_misafirler, load_seviyeler

        exam_one = self._review_exam()
        room = ExamRoom.objects.create(exam=exam_one, name='Salon 101', capacity=15, order=1)
        seviyeler = load_seviyeler(self.kurum.id, self.sube.id)
        committed = commit_rows(
            exam_one,
            [{
                'ad': 'Excel',
                'soyad': 'Aday',
                'tc_kimlik_no': '10000000199',
                'telefon': '05339998877',
                'sinif_seviyesi_id': self.seviye.id,
            }],
            seviyeler,
        )
        self.assertEqual(committed[0].status, 'yeni')
        excel_student = Ogrenci.objects.get(tc_kimlik_no='10000000199')
        part_one = ExamParticipant.objects.get(exam=exam_one, student=excel_student)
        self.assertEqual(part_one.room_id, room.id)
        self.assertEqual(part_one.seat_no, 1)

        # OgrenciKayit olmadan da (Excel sonrası veya başka yılda) sınıf seviyesi çözümlenir
        yeni_yil = EgitimYili.objects.create(baslangic_yil=2026, bitis_yil=2027, aktif_mi=True)
        rows = list_misafirler(self.kurum.id, self.sube.id, q='Excel', egitim_yili_id=yeni_yil.id)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['sinif_seviyesi_id'], self.seviye.id)

        exam_two = Exam.objects.create(
            name='Yeni Yıl LGS',
            exam_type='LGS',
            exam_date=timezone.localdate() + timedelta(days=20),
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=yeni_yil,
        )
        res = self._review_action({
            'islem': 'kayit',
            'ogrenci_id': excel_student.id,
            'exam_id': exam_two.id,
        })
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(ExamParticipant.objects.filter(exam=exam_two, student=excel_student).exists())

    def test_f04_pasife_alma_koltuk_ve_ucreti_iptal_eder_ve_aktife_alinir(self):
        from apps.coaching.olcme_degerlendirme.models import ExamRoom
        from apps.coaching.olcme_degerlendirme.services.exam_roster import enrich_participants
        from apps.finans.constants.gider_types import OdemeDurum
        from apps.finans.domain.gelir_tahsilat import GelirTahsilat
        from apps.roller.models import Permission

        # Pasife alma izni ekle
        perm, _ = Permission.objects.get_or_create(
            code='ogrenci.delete',
            defaults={'module': 'ogrenci', 'action': 'delete', 'description': 'Öğrenci silme'},
        )
        role = UserRole.objects.filter(user=self.user, kurum=self.kurum).first().role
        role.permissions.add(perm)

        hesap, yontem = self._nakit()
        exam = self._review_exam()
        room = ExamRoom.objects.create(exam=exam, name='Salon A', capacity=5, order=1)
        self._review_kayit()
        reg = self._review_action({
            'islem': 'kayit',
            'ogrenci_id': self.guest.id,
            'exam_id': exam.id,
            'deneme_ucreti': '300',
            'odeme_yontemi_id': yontem.id,
            'mali_hesap_id': hesap.id,
        })
        self.assertEqual(reg.status_code, 200, reg.content)
        self.assertTrue(ExamParticipant.objects.filter(exam=exam, student=self.guest, room=room).exists())

        # Geçmiş sınav kaydı ise korunmalı, ama kayit_pasif=True olmalı
        past_exam = Exam.objects.create(
            name='Geçmiş Deneme',
            exam_type='LGS',
            exam_date=timezone.localdate() - timedelta(days=5),
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        past_part = ExamParticipant.objects.create(
            exam=past_exam,
            student=self.guest,
            source=ExamParticipant.Source.MANUAL,
            sinif_seviyesi=self.seviye,
        )

        res = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/durum/',
            {'ogrenci_id': self.guest.id, 'aktif_mi': False},
            format='json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(ExamParticipant.objects.filter(exam=exam, student=self.guest).exists())
        self.assertTrue(ExamParticipant.objects.filter(pk=past_part.id).exists())
        self.assertEqual(GelirTahsilat.objects.get().durum, OdemeDurum.IPTAL)

        enriched = enrich_participants(
            past_exam, [{'student_id': past_part.student_id, 'sinif_seviyesi_id': self.seviye.id}],
        )
        self.assertTrue(enriched[0]['kayit_pasif'])

        pasif_list = self.client.get('/api/ogrenci-kayit/gunu-birlik/?durum=pasif', **self.headers)
        self.assertEqual(pasif_list.status_code, 200)
        self.assertEqual([r['id'] for r in pasif_list.json()['ogrenciler']], [self.guest.id])
        self.assertEqual(pasif_list.json()['pasif_count'], 1)

        re_res = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/durum/',
            {'ogrenci_id': self.guest.id, 'aktif_mi': True},
            format='json',
            **self.headers,
        )
        self.assertEqual(re_res.status_code, 200, re_res.content)
        self.guest.refresh_from_db()
        self.assertTrue(self.guest.aktif_mi)
        self.assertTrue(OgrenciKayit.objects.get(ogrenci=self.guest).aktif_mi)

    def test_f05_kurum_kayitli_ogrencide_deneme_silme_duzenleme_ve_pasife_alma_engellenir(self):
        from apps.ogrenci_kayit.application.deneme_ucret import ensure_deneme_izi
        from apps.roller.models import Permission

        perm, _ = Permission.objects.get_or_create(
            code='ogrenci.delete',
            defaults={'module': 'ogrenci', 'action': 'delete', 'description': 'Öğrenci silme'},
        )
        role = UserRole.objects.filter(user=self.user, kurum=self.kurum).first().role
        role.permissions.add(perm)

        exam = self._review_exam()
        kayit = self._review_kayit()
        part = ExamParticipant.objects.create(
            exam=exam,
            student=self.guest,
            source=ExamParticipant.Source.MANUAL,
            sinif_seviyesi=self.seviye,
        )
        self.guest.kayit_turu = 'asil'
        self.guest.save(update_fields=['kayit_turu'])
        ensure_deneme_izi(ogrenci=self.guest, kayit=kayit)

        cancel_res = self._review_action({
            'islem': 'iptal',
            'ogrenci_id': self.guest.id,
            'exam_id': exam.id,
            'participant_id': part.id,
        })
        self.assertEqual(cancel_res.status_code, 400)
        self.assertTrue(ExamParticipant.objects.filter(pk=part.id).exists())

        durum_res = self.client.post(
            '/api/ogrenci-kayit/gunu-birlik/durum/',
            {'ogrenci_id': self.guest.id, 'aktif_mi': False},
            format='json',
            **self.headers,
        )
        self.assertEqual(durum_res.status_code, 400)
        self.guest.refresh_from_db()
        self.assertTrue(self.guest.aktif_mi)

    def test_f06_f08_f09_kasasiz_odeme_ayni_saniye_ucret_iptal_haric_ve_kurum_gecisi(self):
        from apps.finans.models import OdemeYontemi
        from apps.odeme_takip.domain.models import Sozlesme
        from apps.ogrenci_kayit.application.deneme_ucret import (
            deneme_odeme_secenekleri,
            ensure_deneme_izi,
            last_deneme_ucreti,
            record_deneme_ucreti,
            void_deneme_ucreti,
        )

        hesap, yontem = self._nakit()
        kurumsal_pos = OdemeYontemi.objects.create(
            kurum=self.kurum,
            ad='Kurumsal Sanal POS',
            tip='KREDI_KARTI',
            mali_hesap=None,
            aktif_mi=True,
        )
        secenek = deneme_odeme_secenekleri(self.kurum.id, self.sube.id)
        yontem_ids = {item['id'] for item in secenek['odeme_yontemleri']}
        self.assertIn(kurumsal_pos.id, yontem_ids)

        kayit = self._review_kayit()
        exam_1 = self._review_exam()
        exam_2 = Exam.objects.create(
            name='LGS Deneme 2',
            exam_type='LGS',
            exam_date=timezone.localdate() + timedelta(days=15),
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        # Aynı saniye içinde art arda iki deneme ücreti + iz kaydı UniqueViolation üretmemeli
        record_deneme_ucreti(
            ogrenci=self.guest, kayit=kayit, exam=exam_1, tutar=250,
            user=self.user, odeme_yontemi_id=kurumsal_pos.id, mali_hesap_id=hesap.id,
        )
        record_deneme_ucreti(
            ogrenci=self.guest, kayit=kayit, exam=exam_2, tutar=400,
            user=self.user, odeme_yontemi_id=yontem.id, mali_hesap_id=hesap.id,
        )
        void_deneme_ucreti(ogrenci=self.guest, exam=exam_2)
        ensure_deneme_izi(ogrenci=self.guest, kayit=kayit)

        # İptal edilen 400 TL ve 0 TL iz kaydı son ücreti ezmemeli
        self.assertEqual(last_deneme_ucreti(self.kurum.id, self.guest.tc_kimlik_no), 250)

        # Öğrenci finans özetinde 0 TL I... iz kaydı görünmemeli
        self.client.force_login(self.user)
        fin_res = self.client.get(f'/ogrenciler/api/{self.guest.id}/finans-ozet/', **self.headers)
        self.assertEqual(fin_res.status_code, 200)
        sozlesme_nolar = [s['sozlesme_no'] for s in fin_res.json()['sozlesmeler']]
        self.assertTrue(all(not no.startswith('I') for no in sozlesme_nolar))

        # TcCheckView: D.../I... son_sozlesme olarak dönmemeli ve sonraki_seviye başka kuruma sızmamalı
        baska_kurum = Kurum.objects.create(ad='Başka', kod='BSK')
        baska_sube = Sube.objects.create(kurum=baska_kurum, ad='Yan', kod='BSK-Y')
        SinifSeviyesi.objects.create(kurum=baska_kurum, sube=baska_sube, ad='9. Sınıf (Yabancı)', kod='9')
        tc_res = self.client.get(
            f'/api/ogrenci-kayit/tc-check/?tc={self.guest.tc_kimlik_no}', **self.headers,
        )
        self.assertEqual(tc_res.status_code, 200)
        tc_body = tc_res.json()
        self.assertIsNone(tc_body['son_sozlesme'])
        self.assertIsNone(tc_body['sonraki_seviye'])
        self.assertEqual(tc_body['son_kayit']['egitim_yili_id'], self.yil.id)
        self.assertEqual(tc_body['son_kayit']['okul_no'], 'GB-987')

        # Öğrenci Bilgi Drawer (PUT /ogrenciler/api/<pk>/) üzerinden kurum kaydına geçişte iz bırakılmalı
        Sozlesme.objects.filter(ogrenci=self.guest).delete()
        ExamParticipant.objects.create(
            exam=exam_1, student=self.guest, source=ExamParticipant.Source.MANUAL, sinif_seviyesi=self.seviye,
        )
        put_res = self.client.put(
            f'/ogrenciler/api/{self.guest.id}/',
            data=json.dumps({'ad': self.guest.ad, 'soyad': self.guest.soyad, 'kayit_turu': 'asil'}),
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(put_res.status_code, 200, put_res.content)
        self.assertTrue(Sozlesme.objects.filter(ogrenci=self.guest, notlar__contains='kurum_kaydi_deneme_izi').exists())

    def test_f07_optik_sonuc_girilmis_sinavda_iptal_ve_oturum_degisikligi_engellenir(self):
        from apps.coaching.olcme_degerlendirme.models import ExamSession, ExamSessionModel, StudentAnswer

        exam = self._review_exam()
        s1 = ExamSessionModel.objects.create(
            exam=exam, name='Sabah', order=1, session_date=timezone.localdate() + timedelta(days=10),
        )
        s2 = ExamSessionModel.objects.create(
            exam=exam, name='Öğle', order=2, session_date=timezone.localdate() + timedelta(days=10),
        )
        part = ExamParticipant.objects.create(
            exam=exam, student=self.guest, exam_session=s1,
            source=ExamParticipant.Source.MANUAL, sinif_seviyesi=self.seviye,
        )
        optik_session = ExamSession.objects.create(exam=exam)
        StudentAnswer.objects.create(
            session=optik_session, student=self.guest, booklet='A',
        )

        iptal_res = self._review_action({
            'islem': 'iptal', 'ogrenci_id': self.guest.id, 'exam_id': exam.id, 'participant_id': part.id,
        })
        self.assertEqual(iptal_res.status_code, 400)
        self.assertIn('sonuç girildiği için', iptal_res.json()['detail'].lower())

        oturum_res = self._review_action({
            'islem': 'oturum',
            'ogrenci_id': self.guest.id,
            'exam_id': exam.id,
            'participant_id': part.id,
            'exam_session_id': s2.id,
        })
        self.assertEqual(oturum_res.status_code, 400)
        self.assertTrue(ExamParticipant.objects.filter(pk=part.id, exam_session=s1).exists())

    def test_f10_f12_cok_oturumlu_giris_belgesi_arti90_arama_ve_olcme_yetkisi(self):
        from apps.coaching.olcme_degerlendirme.models import ExamRoom, ExamSessionModel
        from apps.ogrenci_kayit.application.giris_belgesi import build_giris_belgesi_html, load_giris_context
        from apps.ogrenci_kayit.application.gunu_birlik import list_misafirler

        self.guest.telefon = '05321112233'
        self.guest.save(update_fields=['telefon'])
        rows = list_misafirler(self.kurum.id, self.sube.id, q='+90 532 111 22 33')
        self.assertEqual([r['id'] for r in rows], [self.guest.id])

        exam = Exam.objects.create(
            name='YKS Prova',
            exam_type='YKS_TYT_AYT',
            exam_date=timezone.localdate() + timedelta(days=7),
            kurum=self.kurum,
            sube=self.sube,
            egitim_yili=self.yil,
        )
        s_tyt = ExamSessionModel.objects.create(
            exam=exam, name='TYT Oturumu', order=1, session_date=timezone.localdate() + timedelta(days=7),
        )
        s_ayt = ExamSessionModel.objects.create(
            exam=exam, name='AYT Oturumu', order=2, session_date=timezone.localdate() + timedelta(days=8),
        )
        r_a = ExamRoom.objects.create(exam=exam, exam_session=s_tyt, name='A-101', capacity=20, order=1)
        r_b = ExamRoom.objects.create(exam=exam, exam_session=s_ayt, name='B-204', capacity=20, order=2)
        ExamParticipant.objects.create(
            exam=exam, student=self.guest, exam_session=s_tyt, room=r_a, seat_no=4,
            source=ExamParticipant.Source.MANUAL, sinif_seviyesi=self.seviye,
        )
        p_ayt = ExamParticipant.objects.create(
            exam=exam, student=self.guest, exam_session=s_ayt, room=r_b, seat_no=12,
            source=ExamParticipant.Source.MANUAL, sinif_seviyesi=self.seviye,
        )
        ctx, err = load_giris_context(self.kurum.id, self.sube.id, exam.id, self.guest.id, participant_id=p_ayt.id)
        self.assertEqual(err, '')
        self.assertEqual(ctx.participants[0].id, p_ayt.id)
        html = build_giris_belgesi_html(ctx)
        self.assertIn('A-101', html)
        self.assertIn('B-204', html)
        self.assertIn('12', html)

        # Yalnız olcme.write yetkisi olan personel şablon ve seçenek uçlarını kullanabilmeli
        olcme_only = User.objects.create_user(username='olcme_uzman', password='x')
        grant_olcme_write(olcme_only, self.kurum)
        olcme_client = APIClient()
        olcme_client.force_authenticate(user=olcme_only)
        self.assertEqual(
            olcme_client.get('/api/ogrenci-kayit/gunu-birlik/secenekler/', **self.headers).status_code,
            200,
        )
        self.assertEqual(
            olcme_client.get('/api/ogrenci-kayit/gunu-birlik/sablon/', **self.headers).status_code,
            200,
        )

