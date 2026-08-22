from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.egitim_tanimlari.models import Ders, SinifSeviyesi
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.resources.models import BookType, ResourceBook
from apps.sube.domain.models import Sube
from apps.student_resources.models import StudentResourceAssignment, StudentRoutineQuota

User = get_user_model()

QUOTA_URL = '/api/student-resources/routine-quotas/'
ASSIGNMENTS_URL = '/api/coaching/manual-assignments/assignments/'


class StudentRoutineQuotaTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Kota Kurum', kod='KOTA1')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ela', soyad='Demir', aktif_mi=True,
        )
        self.admin = User.objects.create_superuser(
            username='quota_admin', email='quota@test.com', password='testpass123',
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Türkçe', kod='TUR',
        )
        self.sinif = SinifSeviyesi.objects.create(
            kurum=self.kurum, sube=self.sube, ad='11. Sınıf', kod='S11', sira=11,
        )
        self.paragraf_type, _ = BookType.objects.get_or_create(
            kod='PARAGRAF', defaults={'ad': 'Paragraf', 'renk': 'info', 'sira': 10},
        )
        self.problem_type, _ = BookType.objects.get_or_create(
            kod='PROBLEM', defaults={'ad': 'Problem', 'renk': 'warning', 'sira': 11},
        )
        self.other_type = BookType.objects.create(kod='SB_OTHER', ad='Soru Bankası')
        self.paragraf_book = ResourceBook.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Limit Paragraf', kod='LP1',
            book_type=self.paragraf_type, ders=self.ders, sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.paragraf_book_2 = ResourceBook.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Palme Paragraf', kod='PP1',
            book_type=self.paragraf_type, ders=self.ders, sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.problem_book = ResourceBook.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Problemler', kod='PR1',
            book_type=self.problem_type, ders=self.ders, sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.other_book = ResourceBook.objects.create(
            sube=self.sube, kurum=self.kurum, ad='Fizik SB', kod='FZ1',
            book_type=self.other_type, ders=self.ders, sinif_seviyesi=self.sinif,
            aktif_mi=True,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def _save_quota(self, **overrides):
        payload = {
            'student': self.student.id,
            'kind': 'PARAGRAF',
            'daily_question_count': 20,
            'resource_book': self.paragraf_book.id,
            'started_on': '2026-08-01',
        }
        payload.update(overrides)
        return self.client.post(QUOTA_URL, payload, format='json')

    def test_weekly_is_daily_times_seven(self):
        response = self._save_quota(daily_question_count=20)
        self.assertEqual(response.status_code, 201, response.data)
        data = response.data['data']
        self.assertEqual(data['weekly_question_count'], 140)
        self.assertEqual(data['started_on'], '2026-08-01')
        self.assertEqual(data['status'], 'ACTIVE')
        self.assertGreaterEqual(data['planned_days'], 1)
        self.assertEqual(data['planned_question_total'], 20 * data['planned_days'])

    def test_rejects_mismatched_book_type(self):
        response = self._save_quota(resource_book=self.other_book.id)
        self.assertEqual(response.status_code, 400)

    def test_second_active_same_kind_updates_same_row(self):
        first = self._save_quota(daily_question_count=15)
        self.assertEqual(first.status_code, 201)
        quota_id = first.data['data']['id']
        second = self._save_quota(daily_question_count=25)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.data['data']['id'], quota_id)
        self.assertEqual(second.data['data']['daily_question_count'], 25)
        self.assertEqual(
            StudentRoutineQuota.objects.filter(
                student=self.student, kind='PARAGRAF', status='ACTIVE',
            ).count(),
            1,
        )

    def test_new_book_finishes_previous_and_keeps_history(self):
        first = self._save_quota()
        old_id = first.data['data']['id']
        second = self._save_quota(resource_book=self.paragraf_book_2.id, daily_question_count=10)
        self.assertEqual(second.status_code, 201)
        old = StudentRoutineQuota.objects.get(pk=old_id)
        self.assertEqual(old.status, StudentRoutineQuota.Status.BOOK_FINISHED)
        self.assertIsNotNone(old.finished_on)
        self.assertEqual(second.data['data']['status'], 'ACTIVE')
        self.assertNotEqual(second.data['data']['id'], old_id)

    def test_mark_finished_syncs_pool_assignment(self):
        created = self._save_quota()
        quota_id = created.data['data']['id']
        pool_id = created.data['data']['source_assignment']
        finished_on = '2026-08-20'
        response = self.client.post(
            f'{QUOTA_URL}{quota_id}/mark_finished/',
            {'finished_on': finished_on},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data']['status'], 'BOOK_FINISHED')
        self.assertEqual(response.data['data']['finished_on'], finished_on)
        pool = StudentResourceAssignment.objects.get(pk=pool_id)
        self.assertEqual(pool.status, StudentResourceAssignment.Status.COMPLETED)
        self.assertEqual(pool.completed_at.date(), date(2026, 8, 20))

    def test_available_books_filters_by_kind(self):
        response = self.client.get(f'{QUOTA_URL}available_books/', {'kind': 'PARAGRAF'})
        self.assertEqual(response.status_code, 200)
        ids = {row['id'] for row in response.data['data']}
        self.assertIn(self.paragraf_book.id, ids)
        self.assertNotIn(self.problem_book.id, ids)
        self.assertNotIn(self.other_book.id, ids)

    def test_create_assignment_with_quota_task(self):
        self._save_quota()
        due = (timezone.now() + timedelta(days=7)).isoformat()
        response = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'Haftalık Ödev',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book.id,
                    'topic_name': 'Paragraf',
                    'content_mode': 'TOPIC',
                    'order': 0,
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 140 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 140,
                        'order': 0,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        task = response.data['data']['lessons'][0]['tasks'][0]
        self.assertEqual(task['quota_kind'], 'PARAGRAF')
        self.assertIsNone(task['content_id'])
        self.assertEqual(task['question_count'], 140)
        self.assertEqual(task['remaining_question_count'], 140)

        again = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'İkinci Ödev',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book.id,
                    'topic_name': 'Paragraf',
                    'content_mode': 'TOPIC',
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 140 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 140,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(again.status_code, 400)

    def test_partial_solved_count_derives_remaining_and_percent(self):
        due = (timezone.now() + timedelta(days=7)).isoformat()
        created = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'Kota Kontrol',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book.id,
                    'topic_name': 'Paragraf',
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 140 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 140,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        task_id = created.data['data']['lessons'][0]['tasks'][0]['id']

        partial = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{task_id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'completed_question_count': 90},
            format='json',
        )
        self.assertEqual(partial.status_code, 200, partial.data)
        data = partial.data['data']
        self.assertEqual(data['completion_status'], 'PARTIAL')
        self.assertEqual(data['completed_question_count'], 90)
        self.assertEqual(data['remaining_question_count'], 50)
        self.assertEqual(data['task_completion_percent'], 64)

        done = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{task_id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'completed_question_count': 140},
            format='json',
        )
        self.assertEqual(done.data['data']['completion_status'], 'DONE')
        self.assertEqual(done.data['data']['remaining_question_count'], 0)

        zero = self.client.post(
            f'/api/coaching/manual-assignments/tasks/{task_id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'completed_question_count': 0},
            format='json',
        )
        self.assertEqual(zero.data['data']['completion_status'], 'NOT_DONE')
        self.assertEqual(zero.data['data']['remaining_question_count'], 140)

    def test_finished_quota_not_listed_as_active_for_assignment(self):
        created = self._save_quota()
        quota_id = created.data['data']['id']
        self.client.post(f'{QUOTA_URL}{quota_id}/mark_finished/', {}, format='json')
        listing = self.client.get(QUOTA_URL, {'student_id': self.student.id})
        active = [q for q in listing.data['data'] if q['status'] == 'ACTIVE']
        self.assertEqual(active, [])
        finished = [q for q in listing.data['data'] if q['status'] == 'BOOK_FINISHED']
        self.assertEqual(len(finished), 1)
        self.assertTrue(finished[0]['has_pending_assignment'] is False)

    def test_last_quota_defaults_from_latest_assignment(self):
        due = (timezone.now() + timedelta(days=7)).isoformat()
        first = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'İlk Kota',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book.id,
                    'topic_name': 'Paragraf',
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 70 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 70,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(first.status_code, 201, first.data)
        first_task_id = first.data['data']['lessons'][0]['tasks'][0]['id']
        self.client.post(
            f'/api/coaching/manual-assignments/tasks/{first_task_id}/update_task_status/',
            {'completion_status': 'DONE'},
            format='json',
        )
        second = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'Son Kota',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book_2.id,
                    'topic_name': 'Paragraf',
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 175 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 175,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(second.status_code, 201, second.data)
        response = self.client.get(
            f'{ASSIGNMENTS_URL}last_quota_defaults/',
            {'student_id': self.student.id},
        )
        self.assertEqual(response.status_code, 200, response.data)
        paragraf = response.data['data']['PARAGRAF']
        self.assertEqual(paragraf['resource_book'], self.paragraf_book_2.id)
        self.assertEqual(paragraf['daily_question_count'], 25)
        self.assertEqual(paragraf['weekly_question_count'], 175)
        self.assertIsNone(response.data['data']['PROBLEM'])

    def test_report_book_cumulative_for_quota_book(self):
        due = (timezone.now() + timedelta(days=7)).isoformat()
        first = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'İlk',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book.id,
                    'topic_name': 'Paragraf',
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 70 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 70,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(first.status_code, 201, first.data)
        first_task_id = first.data['data']['lessons'][0]['tasks'][0]['id']
        self.client.post(
            f'/api/coaching/manual-assignments/tasks/{first_task_id}/update_task_status/',
            {'completion_status': 'PARTIAL', 'completed_question_count': 40},
            format='json',
        )
        second = self.client.post(
            ASSIGNMENTS_URL,
            {
                'student': self.student.id,
                'title': 'İkinci',
                'status': 'ASSIGNED',
                'due_date': due,
                'lessons': [{
                    'resource_book': self.paragraf_book.id,
                    'topic_name': 'Paragraf',
                    'tasks': [{
                        'task_type': 'SOLVE_TEST',
                        'title': 'Paragraf — 140 soru',
                        'quota_kind': 'PARAGRAF',
                        'question_count': 140,
                    }],
                }],
            },
            format='json',
        )
        self.assertEqual(second.status_code, 201, second.data)
        assignment_id = second.data['data']['id']
        report = self.client.get(f'{ASSIGNMENTS_URL}{assignment_id}/report/')
        self.assertEqual(report.status_code, 200, report.data)
        books = report.data.get('book_cumulative') or []
        self.assertEqual(len(books), 1)
        self.assertEqual(books[0]['resource_book'], self.paragraf_book.id)
        self.assertEqual(books[0]['quota_kind'], 'PARAGRAF')
        self.assertEqual(books[0]['cumulative_total_questions'], 210)
        self.assertEqual(books[0]['cumulative_completed_questions'], 40)
        self.assertEqual(books[0]['current_total_questions'], 140)

    def test_book_type_seed_names(self):
        self.assertEqual(BookType.objects.get(kod='PARAGRAF').ad, 'Paragraf')
        self.assertEqual(BookType.objects.get(kod='PROBLEM').ad, 'Problem')
