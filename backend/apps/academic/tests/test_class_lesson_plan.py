"""Sınıf Ders Planı — şube/yıl hizası ve bağlantı doğrulamaları."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import Client, TestCase

from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.egitim_tanimlari.models import Alan, Ders, SinifSeviyesi
from apps.egitim_yili.domain.models import EgitimYili
from apps.kurum.domain.models import Kurum
from apps.sinif.domain.models import Sinif
from apps.sube.domain.models import Sube
from apps.term.domain.models import Term

User = get_user_model()


class ClassLessonPlanApiTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.kurum = Kurum.objects.create(ad='CLP Kurum', kod='CLP')
        self.sube_a = Sube.objects.create(kurum=self.kurum, ad='Şube A', kod='CLP-A')
        self.sube_b = Sube.objects.create(kurum=self.kurum, ad='Şube B', kod='CLP-B')
        self.year = EgitimYili.objects.create(baslangic_yil=2025, bitis_yil=2026, aktif_mi=True)
        self.user = User.objects.create_user(username='clpuser', password='test')
        self.client.force_login(self.user)

        self.seviye = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='9. Sınıf', kod='9', aktif_mi=True,
        )
        self.alan = Alan.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Sayısal', kod='SAY', aktif_mi=True,
        )
        self.ders_a = Ders.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Matematik', kod='MAT', aktif_mi=True,
        )
        self.ders_a.sinif_seviyeleri.add(self.seviye)
        self.ders_a.alanlar.add(self.alan)
        self.ders_fizik = Ders.objects.create(
            kurum=self.kurum, sube=self.sube_a, ad='Fizik', kod='FIZ', aktif_mi=True,
        )
        self.ders_fizik.sinif_seviyeleri.add(self.seviye)
        self.ders_fizik.alanlar.add(self.alan)
        self.ders_b = Ders.objects.create(
            kurum=self.kurum, sube=self.sube_b, ad='Fizik', kod='FIZ', aktif_mi=True,
        )

        self.sinif = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.year,
            ad='9-A',
            sinif_seviyesi=self.seviye,
            alan=self.alan,
            aktif_mi=True,
        )
        self.sinif_b = Sinif.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.year,
            ad='9-B',
            sinif_seviyesi=self.seviye,
            alan=self.alan,
            aktif_mi=True,
        )
        self.term = Term.objects.create(
            kurum=self.kurum,
            sube=self.sube_a,
            egitim_yili=self.year,
            name='Güz',
            code='GUZ',
            start_date=date(2025, 9, 1),
            end_date=date(2026, 1, 31),
            is_active=True,
        )

        self.headers = {
            'HTTP_X_KURUM_ID': str(self.kurum.id),
            'HTTP_X_SUBE_ID': str(self.sube_a.id),
            'HTTP_X_EGITIMYILI_ID': str(self.year.id),
        }

    def test_context_lists_classrooms_and_terms(self):
        res = self.client.get('/api/academic/class-lesson-plan/context/', **self.headers)
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body['active_year']['id'], self.year.id)
        classroom_ids = {c['id'] for c in body['classrooms']}
        self.assertIn(self.sinif.id, classroom_ids)
        term_ids = {t['id'] for t in body['terms']}
        self.assertIn(self.term.id, term_ids)

    def test_ders_options_scoped_to_sube_and_seviye(self):
        res = self.client.get(
            f'/api/academic/class-lesson-plan/ders-options/?classroom_id={self.sinif.id}',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        ids = {r['id'] for r in res.json()['results']}
        self.assertIn(self.ders_a.id, ids)
        self.assertNotIn(self.ders_b.id, ids)

    def test_create_plan_success(self):
        res = self.client.post(
            '/api/academic/class-lesson-plan/create/',
            data={
                'term': self.term.id,
                'sinif': self.sinif.id,
                'ders': self.ders_a.id,
                'weekly_hours': 4,
                'credit': 2,
                'is_mandatory': True,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 201, res.content)
        self.assertTrue(
            ClassLessonPlan.objects.filter(
                sinif=self.sinif, term=self.term, ders=self.ders_a, is_active=True,
            ).exists()
        )

    def test_create_rejects_cross_sube_ders(self):
        res = self.client.post(
            '/api/academic/class-lesson-plan/create/',
            data={
                'term': self.term.id,
                'sinif': self.sinif.id,
                'ders': self.ders_b.id,
                'weekly_hours': 2,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (400, 403))

    def test_create_rejects_when_schedule_locked(self):
        self.term.schedule_locked = True
        self.term.save(update_fields=['schedule_locked'])
        res = self.client.post(
            '/api/academic/class-lesson-plan/create/',
            data={
                'term': self.term.id,
                'sinif': self.sinif.id,
                'ders': self.ders_a.id,
                'weekly_hours': 2,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_list_filtered_by_sube(self):
        ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders_a,
            weekly_hours=3,
        )
        res = self.client.get(
            f'/api/academic/class-lesson-plan/?classroom_id={self.sinif.id}&term_id={self.term.id}',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['count'], 1)

        # Yanlış şube bağlamı → sınıf gate 403/404
        bad = dict(self.headers)
        bad['HTTP_X_SUBE_ID'] = str(self.sube_b.id)
        res_b = self.client.get(
            f'/api/academic/class-lesson-plan/?classroom_id={self.sinif.id}&term_id={self.term.id}',
            **bad,
        )
        self.assertIn(res_b.status_code, (403, 404))

    def test_seed_from_alan(self):
        res = self.client.post(
            '/api/academic/class-lesson-plan/seed-from-alan/',
            data={
                'classroom_id': self.sinif.id,
                'term_id': self.term.id,
                'default_weekly_hours': 2,
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertIn(res.status_code, (200, 201), res.content)
        body = res.json()
        self.assertEqual(body['created_count'], 2)
        self.assertEqual(
            ClassLessonPlan.objects.filter(
                sinif=self.sinif, term=self.term, is_active=True,
            ).count(),
            2,
        )
        # İkinci çağrı — mevcutları atla
        again = self.client.post(
            '/api/academic/class-lesson-plan/seed-from-alan/',
            data={'classroom_id': self.sinif.id, 'term_id': self.term.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()['created_count'], 0)
        self.assertEqual(again.json()['skipped_existing'], 2)

    def test_seed_requires_alan(self):
        self.sinif.alan = None
        self.sinif.save(update_fields=['alan'])
        res = self.client.post(
            '/api/academic/class-lesson-plan/seed-from-alan/',
            data={'classroom_id': self.sinif.id, 'term_id': self.term.id},
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 400)

    def test_copy_to_other_classroom(self):
        ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders_a,
            weekly_hours=4,
        )
        ClassLessonPlan.objects.create(
            egitim_yili=self.year,
            term=self.term,
            sinif=self.sinif,
            ders=self.ders_fizik,
            weekly_hours=3,
        )
        res = self.client.post(
            '/api/academic/class-lesson-plan/copy/',
            data={
                'source_classroom_id': self.sinif.id,
                'term_id': self.term.id,
                'target_classroom_ids': [self.sinif_b.id],
                'copy_teachers': False,
                'mode': 'skip_existing',
            },
            content_type='application/json',
            **self.headers,
        )
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        self.assertEqual(body['created_count'], 2)
        self.assertEqual(
            ClassLessonPlan.objects.filter(
                sinif=self.sinif_b, term=self.term, is_active=True,
            ).count(),
            2,
        )
        mat = ClassLessonPlan.objects.get(
            sinif=self.sinif_b, term=self.term, ders=self.ders_a, is_active=True,
        )
        self.assertEqual(mat.weekly_hours, 4)
        self.assertIsNone(mat.ogretmen_id)
