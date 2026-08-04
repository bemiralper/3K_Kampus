"""Ödev planı — ders gruplaması kitabın gerçek dersine göre olmalı."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import AssignmentLesson, ManualAssignment
from apps.coaching.assignment_manual.serializers import AssignmentLessonSerializer
from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube

User = get_user_model()
ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class PlanLessonGroupingTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Plan Grup Kurum', kod='PGK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='PGK-M')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Rabia', soyad='Korucu', aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='plan_grp_coach', email='pg@test.com', password='x',
        )
        self.mat = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik-1', kod='MAT1',
        )
        self.tarih = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Tarih', kod='TAR',
        )
        self.cografya = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Coğrafya', kod='COG',
        )
        self.sinif = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='12', kod='S12', sira=12,
        )
        self.book_type = BookType.objects.create(kod='SB_PG', ad='Soru Bankası')
        self.book_mat = ResourceBook.objects.create(
            sube=self.sube, ad='Mat SB', kod='MAT-SB', kurum=self.kurum,
            book_type=self.book_type, ders=self.mat, sinif_seviyesi=self.sinif, aktif_mi=True,
        )
        self.book_tarih = ResourceBook.objects.create(
            sube=self.sube, ad='Tarih SB', kod='TAR-SB', kurum=self.kurum,
            book_type=self.book_type, ders=self.tarih, sinif_seviyesi=self.sinif, aktif_mi=True,
        )
        self.book_cog = ResourceBook.objects.create(
            sube=self.sube, ad='Coğrafya SB', kod='COG-SB', kurum=self.kurum,
            book_type=self.book_type, ders=self.cografya, sinif_seviyesi=self.sinif, aktif_mi=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def test_serializer_prefers_book_ders_over_stale_lesson_fk(self):
        assignment = ManualAssignment.objects.create(
            student=self.student,
            coach=self.coach,
            title='Haftalık',
            status='ASSIGNED',
            due_date=timezone.now() + timezone.timedelta(days=3),
        )
        # Yanlış denormalize: tüm bloklar Matematik-1'e bağlanmış
        block = AssignmentLesson.objects.create(
            assignment=assignment,
            lesson=self.mat,
            resource_book=self.book_tarih,
            order=0,
            topic_name='Osmanlı',
        )
        data = AssignmentLessonSerializer(block).data
        self.assertEqual(data['lesson'], self.tarih.id)
        self.assertEqual(data['lesson_name'], 'Tarih')

    def test_create_forces_lesson_from_resource_book(self):
        due = (timezone.now() + timezone.timedelta(days=3)).isoformat()
        response = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'Çok dersli plan',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [
                    {
                        'order': 0,
                        'lesson': self.mat.id,  # yanlış gönderilmiş olsa bile
                        'resource_book': self.book_tarih.id,
                        'topic_name': 'Osmanlı',
                        'tasks': [{'task_type': 'SOLVE_TEST', 'title': 'T1', 'question_count': 10}],
                    },
                    {
                        'order': 1,
                        'lesson': self.mat.id,
                        'resource_book': self.book_cog.id,
                        'topic_name': 'İklim',
                        'tasks': [{'task_type': 'SOLVE_TEST', 'title': 'C1', 'question_count': 8}],
                    },
                    {
                        'order': 2,
                        'lesson': self.mat.id,
                        'resource_book': self.book_mat.id,
                        'topic_name': 'Türev',
                        'tasks': [{'task_type': 'SOLVE_TEST', 'title': 'M1', 'question_count': 12}],
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        lessons = response.data['data']['lessons']
        by_name = {row['lesson_name']: row for row in lessons}
        self.assertIn('Tarih', by_name)
        self.assertIn('Coğrafya', by_name)
        self.assertIn('Matematik-1', by_name)
        self.assertEqual(by_name['Tarih']['lesson'], self.tarih.id)
        self.assertEqual(by_name['Coğrafya']['lesson'], self.cografya.id)
        self.assertEqual(by_name['Matematik-1']['lesson'], self.mat.id)

        # DB'de de düzeltilmiş olmalı
        db_lessons = {
            al.resource_book_id: al.lesson_id
            for al in AssignmentLesson.objects.filter(assignment_id=response.data['data']['id'])
        }
        self.assertEqual(db_lessons[self.book_tarih.id], self.tarih.id)
        self.assertEqual(db_lessons[self.book_cog.id], self.cografya.id)
        self.assertEqual(db_lessons[self.book_mat.id], self.mat.id)
