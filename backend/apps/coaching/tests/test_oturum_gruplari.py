"""Hafta içi / hafta sonu oturum grubu ayarı ve atama."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.olcme_degerlendirme.models import (
    Exam, ExamParticipant, ExamSessionModel, OlcmeOgrenciOturumTercihi,
    OlcmeSeviyeOturumAyar,
)
from apps.coaching.olcme_degerlendirme.services.exam_roster import (
    replace_auto_participants, resolve_exam_candidates,
)
from apps.coaching.olcme_degerlendirme.services.exam_schedule_groups import (
    HAFTA_ICI, HAFTA_SONU, default_preference_for_seviye, ensure_seviye_defaults,
    is_mezun_seviye, resolve_student_groups,
)
from apps.coaching.olcme_degerlendirme.views.roster_views import _hatirlatma_ctx
from apps.coaching.tests.test_exam_roster import RosterFixtureMixin
from apps.egitim_tanimlari.models import SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci, OgrenciEgitimPaketi, OgrenciKayit
from apps.sube.domain.models import Sube

User = get_user_model()
EXAMS_URL = '/api/coaching/olcme-degerlendirme/exams/'
AYAR_SEV = '/api/coaching/olcme-degerlendirme/oturum-ayarlari/seviyeler/'
AYAR_OGR = '/api/coaching/olcme-degerlendirme/oturum-ayarlari/ogrenciler/'


class ScheduleGroupResolveTest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()
        self.mezun = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mezun', kod='mezun', sira=20,
        )
        self.mezun_ogr = self._ogr('Mert', 'Mezun', seviye=self.mezun)

    def test_mezun_fallback_is_weekend(self):
        self.assertTrue(is_mezun_seviye(self.mezun))
        self.assertEqual(default_preference_for_seviye(self.mezun), HAFTA_SONU)
        self.assertEqual(default_preference_for_seviye(self.sev12), HAFTA_ICI)

    def test_ensure_defaults_and_override(self):
        ensure_seviye_defaults(self.sube.id)
        self.assertEqual(
            OlcmeSeviyeOturumAyar.objects.get(
                sube=self.sube, sinif_seviyesi=self.mezun,
            ).preference,
            HAFTA_SONU,
        )
        groups = resolve_student_groups(
            sube_id=self.sube.id,
            egitim_yili_id=self.yil.id,
            student_seviye_ids={
                self.in_class.id: self.sev12.id,
                self.mezun_ogr.id: self.mezun.id,
            },
        )
        self.assertEqual(groups[self.in_class.id], HAFTA_ICI)
        self.assertEqual(groups[self.mezun_ogr.id], HAFTA_SONU)

        OlcmeOgrenciOturumTercihi.objects.create(
            sube=self.sube, egitim_yili=self.yil,
            ogrenci=self.in_class, preference=HAFTA_SONU,
        )
        groups = resolve_student_groups(
            sube_id=self.sube.id,
            egitim_yili_id=self.yil.id,
            student_seviye_ids={self.in_class.id: self.sev12.id},
        )
        self.assertEqual(groups[self.in_class.id], HAFTA_SONU)


class SessionAssignmentTest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()
        self.mezun = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mezun', kod='mezun', sira=20,
        )
        self.mezun_ogr = self._ogr('Mert', 'Mezun', seviye=self.mezun)
        self.exam = Exam.objects.create(
            name='Grup Sınav', exam_type='YKS_TYT',
            kurum=self.kurum, sube=self.sube, egitim_yili=self.yil,
        )
        ensure_seviye_defaults(self.sube.id)

    def test_weekday_session_gets_weekday_only(self):
        ici = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta içi', order=0,
            schedule_preference='HAFTA_ICI',
            session_date=date(2026, 4, 13), start_time=time(10, 0), end_time=time(12, 0),
        )
        sonu = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta sonu', order=1,
            schedule_preference='HAFTA_SONU',
            session_date=date(2026, 4, 18), start_time=time(11, 0), end_time=time(13, 0),
        )
        recs = resolve_exam_candidates(
            kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.yil.id,
            seviye_ids=[self.sev12.id, self.mezun.id],
        )
        replace_auto_participants(self.exam, recs)
        weekday_ids = set(
            ExamParticipant.objects.filter(exam=self.exam, exam_session=ici)
            .values_list('student_id', flat=True)
        )
        weekend_ids = set(
            ExamParticipant.objects.filter(exam=self.exam, exam_session=sonu)
            .values_list('student_id', flat=True)
        )
        self.assertIn(self.in_class.id, weekday_ids)
        self.assertNotIn(self.mezun_ogr.id, weekday_ids)
        self.assertIn(self.mezun_ogr.id, weekend_ids)
        self.assertNotIn(self.in_class.id, weekend_ids)

    def test_farketmez_gets_everyone(self):
        sess = ExamSessionModel.objects.create(
            exam=self.exam, name='Hepsi', order=0, schedule_preference='FARKETMEZ',
        )
        recs = resolve_exam_candidates(
            kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.yil.id,
            seviye_ids=[self.sev12.id, self.mezun.id],
        )
        replace_auto_participants(self.exam, recs)
        ids = set(
            ExamParticipant.objects.filter(exam=self.exam, exam_session=sess)
            .values_list('student_id', flat=True)
        )
        self.assertIn(self.in_class.id, ids)
        self.assertIn(self.mezun_ogr.id, ids)

    def test_student_can_sit_two_weekday_sessions(self):
        a = ExamSessionModel.objects.create(
            exam=self.exam, name='1. Oturum', order=0, schedule_preference='HAFTA_ICI',
        )
        b = ExamSessionModel.objects.create(
            exam=self.exam, name='2. Oturum', order=1, schedule_preference='HAFTA_ICI',
        )
        recs = resolve_exam_candidates(
            kurum_id=self.kurum.id, sube_id=self.sube.id, egitim_yili_id=self.yil.id,
            seviye_ids=[self.sev12.id],
        )
        replace_auto_participants(self.exam, recs)
        self.assertTrue(
            ExamParticipant.objects.filter(
                exam=self.exam, student=self.in_class, exam_session=a,
            ).exists()
        )
        self.assertTrue(
            ExamParticipant.objects.filter(
                exam=self.exam, student=self.in_class, exam_session=b,
            ).exists()
        )

    def test_hatirlatma_uses_participant_session(self):
        sonu = ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta sonu', order=0,
            schedule_preference='HAFTA_SONU',
            session_date=date(2026, 4, 18), start_time=time(11, 30), end_time=time(14, 0),
        )
        ExamSessionModel.objects.create(
            exam=self.exam, name='Hafta içi', order=1,
            schedule_preference='HAFTA_ICI',
            session_date=date(2026, 4, 13), start_time=time(9, 0), end_time=time(11, 0),
        )
        p = ExamParticipant.objects.create(
            exam=self.exam, student=self.mezun_ogr, exam_session=sonu,
        )
        ctx = _hatirlatma_ctx(self.exam, p)
        self.assertEqual(ctx['sinav_tarihi'], '18.04.2026')
        self.assertEqual(ctx['baslama_saati'], '11:30')
        self.assertEqual(ctx['bitis_saati'], '14:00')


class OturumAyarAPITest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()
        self.mezun = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mezun', kod='mezun', sira=20,
        )
        self.other_kurum = Kurum.objects.create(ad='Diğer', kod='DGR')
        self.other_sube = Sube.objects.create(kurum=self.other_kurum, ad='Diğer', kod='DGR-M')
        self.other_yil = EgitimYili.objects.create(baslangic_yil=2024, bitis_yil=2025, aktif_mi=False)
        self.other_sev = SinifSeviyesi.objects.create(
            kurum=self.other_kurum, sube=self.other_sube, ad='12. Sınıf', kod='12',
        )
        self.user = User.objects.create_user(username='ayar', password='test')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }

    def test_seviye_defaults_isolated_to_sube(self):
        res = self.client.get(AYAR_SEV, **self.headers)
        self.assertEqual(res.status_code, 200, res.content[:300])
        ids = {r['sinif_seviyesi_id'] for r in res.json()['items']}
        self.assertIn(self.sev12.id, ids)
        self.assertIn(self.mezun.id, ids)
        self.assertNotIn(self.other_sev.id, ids)
        mezun = next(r for r in res.json()['items'] if r['sinif_seviyesi_id'] == self.mezun.id)
        self.assertEqual(mezun['preference'], HAFTA_SONU)
        names = [r['sinif_seviyesi'] for r in res.json()['items']]
        self.assertIn('12. Sınıf', names)
        self.assertIn('Mezun', names)

    def test_student_override_and_list(self):
        OgrenciEgitimPaketi.objects.create(
            ogrenci=self.in_class, paket_turu='deneme', paket_id=self.paket.id,
            paket_adi=self.paket.ad, aktif_mi=True,
        )
        res = self.client.patch(
            AYAR_OGR,
            {'ogrenci_id': self.in_class.id, 'preference': 'HAFTA_SONU'},
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content[:400])
        listed = self.client.get(AYAR_OGR, **self.headers)
        self.assertEqual(listed.status_code, 200)
        row = next(r for r in listed.json()['items'] if r['ogrenci_id'] == self.in_class.id)
        self.assertEqual(row['preference'], HAFTA_SONU)
        self.assertTrue(row['is_override'])


class ExamCreateWithSessionsTest(RosterFixtureMixin, TestCase):
    def setUp(self):
        self._setup_roster()
        self.mezun = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Mezun', kod='mezun', sira=20,
        )
        self.mezun_ogr = self._ogr('Mert', 'Mezun', seviye=self.mezun)
        ensure_seviye_defaults(self.sube.id)
        self.user = User.objects.create_user(username='create-sess', password='test')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube.id),
            'HTTP_X_EGITIMYILI_ID': str(self.yil.id),
        }

    def test_create_assigns_by_session_preference(self):
        res = self.client.post(
            EXAMS_URL,
            {
                'name': 'İki Oturum',
                'exam_type': 'YKS_TYT',
                'sinif_seviyesi_ids': [self.sev12.id, self.mezun.id],
                'rooms': [{'name': 'A', 'capacity': 40}],
                'seating_mode': 'sequential',
                'sessions': [
                    {
                        'name': 'Hafta içi',
                        'order': 0,
                        'schedule_preference': 'HAFTA_ICI',
                        'session_date': '2026-04-13',
                        'start_time': '10:00',
                        'end_time': '12:00',
                    },
                    {
                        'name': 'Hafta sonu',
                        'order': 1,
                        'schedule_preference': 'HAFTA_SONU',
                        'session_date': '2026-04-18',
                        'start_time': '11:00',
                        'end_time': '13:00',
                    },
                ],
            },
            format='json', **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content[:500])
        exam = Exam.objects.get(id=res.json()['id'])
        self.assertEqual(exam.exam_sessions.count(), 2)
        ici = exam.exam_sessions.get(schedule_preference='HAFTA_ICI')
        sonu = exam.exam_sessions.get(schedule_preference='HAFTA_SONU')
        self.assertTrue(
            ExamParticipant.objects.filter(
                exam=exam, student=self.in_class, exam_session=ici,
            ).exists()
        )
        self.assertTrue(
            ExamParticipant.objects.filter(
                exam=exam, student=self.mezun_ogr, exam_session=sonu,
            ).exists()
        )
        self.assertFalse(
            ExamParticipant.objects.filter(
                exam=exam, student=self.mezun_ogr, exam_session=ici,
            ).exists()
        )
