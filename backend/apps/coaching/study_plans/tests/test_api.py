from datetime import date, datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.coaching.study_plans.models import StudyProgram, StudyTemplate
from apps.coaching.study_plans.services import ensure_builtin_templates
from apps.egitim_tanimlari.models import Ders
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()

TEMPLATES_URL = '/api/coaching/study-plans/templates/'
GENERATE_URL = '/api/coaching/study-plans/programs/generate/'
PROGRAMS_URL = '/api/coaching/study-plans/programs/'


class StudyPlanApiTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='API Kurum', kod='APK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        self.other = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Can', soyad='Demir', aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='plan_coach',
            email='plan_coach@test.com',
            password='testpass123',
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Fen', kod='FEN',
        )
        ensure_builtin_templates(self.kurum)
        self.template = StudyTemplate.objects.get(kurum=self.kurum, name='Standart')
        self.week_start = date(2026, 9, 14)
        self.today_monday = date(2026, 9, 14)
        self.client = APIClient()
        self.client.force_authenticate(user=self.coach)
        self.client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        self.client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)

    def _seed_homework(self, student, tests=10, questions_each=10):
        assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=student,
            title='Haftalık testler',
            status='ASSIGNED',
            assigned_date=timezone.make_aware(datetime(2026, 9, 14, 9, 0)),
            due_date=timezone.make_aware(datetime(2026, 9, 21, 18, 0)),
            is_active=True,
        )
        lesson = AssignmentLesson.objects.create(assignment=assignment, lesson=self.ders)
        for i in range(tests):
            AssignmentTask.objects.create(
                lesson_block=lesson,
                task_type=AssignmentTask.TaskType.SOLVE_TEST,
                title=f'Test {i + 1}',
                question_count=questions_each,
                estimated_duration_minutes=12,
                order=i,
            )
        return assignment

    def _freeze_today(self, value=None):
        return patch(
            'apps.coaching.study_plans.engine.timezone.localdate',
            return_value=value or self.today_monday,
        )

    def test_templates_seed_on_list(self):
        response = self.client.get(TEMPLATES_URL)
        self.assertEqual(response.status_code, 200)
        names = {row['name'] for row in response.data}
        self.assertTrue({'Standart', 'Yoğun', 'Sınav Haftası', 'Özel'} <= names)

    def test_generate_splits_and_returns_summary(self):
        self._seed_homework(self.student, tests=10)
        with self._freeze_today():
            response = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
                'include_homework': True,
            }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        days = response.data['days']
        self.assertEqual(len(days), 5)
        self.assertEqual([d['planned_tests'] for d in days], [2, 2, 2, 2, 2])
        self.assertEqual([d['planned_questions'] for d in days], [20, 20, 20, 20, 20])
        self.assertIn('Pzt', days[0]['chip'])
        summary = response.data['summary']
        self.assertEqual(summary['tests']['planned'], 10)
        self.assertEqual(summary['questions']['planned'], 100)

    def test_generate_leftover_when_over_cap(self):
        self.template.is_builtin = False
        self.template.save(update_fields=['is_builtin'])
        self._seed_homework(self.student, tests=15)
        with self._freeze_today():
            response = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        leftovers = response.data['leftovers']
        self.assertTrue(leftovers)
        self.assertEqual(sum(x['remaining_tests'] for x in leftovers), 5)
        self.assertEqual(response.data['summary']['leftover_tests'], 5)

    def test_same_week_does_not_overwrite(self):
        self._seed_homework(self.student, tests=4)
        with self._freeze_today():
            first = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
            second = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertTrue(second.data['already_exists'])
        self.assertEqual(StudyProgram.objects.filter(student=self.student).count(), 1)

    def test_same_template_two_students(self):
        self._seed_homework(self.student, tests=10)
        self._seed_homework(self.other, tests=10)
        with self._freeze_today():
            a = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
            b = self.client.post(GENERATE_URL, {
                'student_id': self.other.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual(b.status_code, 201, b.data)
        self.assertEqual(a.data['days'][0]['planned_tests'], 2)
        self.assertEqual(b.data['days'][0]['planned_tests'], 2)

    def test_generate_uses_selected_week_only(self):
        self._seed_homework(self.student, tests=10)
        week_b = date(2026, 9, 21)
        ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Hafta B ödevi',
            status='ASSIGNED',
            assigned_date=timezone.make_aware(datetime(2026, 9, 21, 9, 0)),
            due_date=timezone.make_aware(datetime(2026, 9, 28, 18, 0)),
            is_active=True,
        )
        with self._freeze_today():
            a = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
            b = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': week_b.isoformat(),
                'template_id': self.template.id,
            }, format='json')
        self.assertEqual(a.status_code, 201, a.data)
        self.assertEqual(a.data['week_start'], '2026-09-14')
        self.assertTrue(all(d['day_date'] >= '2026-09-14' and d['day_date'] <= '2026-09-20' for d in a.data['days']))
        self.assertEqual(a.data['summary']['tests']['planned'], 10)
        self.assertEqual(b.status_code, 201, b.data)
        self.assertEqual(b.data['week_start'], '2026-09-21')
        self.assertTrue(all(d['day_date'] >= '2026-09-21' and d['day_date'] <= '2026-09-27' for d in b.data['days']))
        self.assertEqual(b.data['summary']['tests']['planned'], 0)

    def test_preview_does_not_persist(self):
        self._seed_homework(self.student, tests=10)
        url = f'{TEMPLATES_URL}{self.template.id}/preview/'
        with self._freeze_today():
            response = self.client.post(url, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
            }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('10 test', response.data['label'])
        self.assertEqual(StudyProgram.objects.count(), 0)

    def test_regenerate_locks_past_days(self):
        self._seed_homework(self.student, tests=10)
        with self._freeze_today():
            created = self.client.post(GENERATE_URL, {
                'student_id': self.student.id,
                'week_start': self.week_start.isoformat(),
                'template_id': self.template.id,
            }, format='json')
        self.assertEqual(created.status_code, 201)
        program_id = created.data['id']
        monday_tests = created.data['days'][0]['planned_tests']
        with self._freeze_today(date(2026, 9, 16)), patch(
            'apps.coaching.study_plans.views.timezone.localdate',
            return_value=date(2026, 9, 16),
        ):
            response = self.client.post(
                f'{PROGRAMS_URL}{program_id}/regenerate/',
                {'lock_past': True},
                format='json',
            )
        self.assertEqual(response.status_code, 200, response.data)
        monday = next(d for d in response.data['days'] if d['day_date'] == '2026-09-14')
        self.assertTrue(monday['is_locked'])
        self.assertEqual(monday['planned_tests'], monday_tests)

    def test_generate_requires_student_access(self):
        outsider = User.objects.create_user(
            username='plan_out', email='plan_out@test.com', password='testpass123',
        )
        other = APIClient()
        other.force_authenticate(user=outsider)
        other.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        other.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        response = other.post(GENERATE_URL, {
            'student_id': self.student.id,
            'week_start': self.week_start.isoformat(),
            'template_id': self.template.id,
        }, format='json')
        self.assertEqual(response.status_code, 403)
