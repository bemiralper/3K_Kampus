"""Public write routes must not bypass evaluation, ownership or tenant scope."""
from django.utils import timezone
from . import test_control_lock as fixtures
from django.test import TestCase
from apps.coaching.assignment_manual.models import ManualAssignment, AssignmentLesson, AssignmentTask
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

BASE = '/api/coaching/manual-assignments/'


class AssignmentWriteBoundaryTests(TestCase):
    setUp = fixtures.AssignmentControlLockTest.setUp

    def test_standard_task_writes_are_disabled_even_for_admin(self):
        for user in [self.coach, self.admin]:
            self.client.force_authenticate(user=user)
            for method in ['patch', 'put', 'delete']:
                with self.subTest(user=user.pk, method=method):
                    response = getattr(self.client, method)(f'{BASE}tasks/{self.task.pk}/',
                        {'completion_status': 'PENDING', 'task_completion_percent': 0}, format='json')
                    self.assertEqual(response.status_code, 405, response.content)
        self.task.refresh_from_db()
        self.assignment.refresh_from_db()
        self.assertEqual(self.task.completion_status, 'DONE')
        self.assertEqual(self.assignment.completion_percent, 100)

    def test_standard_lesson_writes_are_disabled(self):
        for method in ['patch', 'put', 'delete']:
            response = getattr(self.client, method)(f'{BASE}lessons/{self.lesson.pk}/',
                {'order': 5}, format='json')
            self.assertEqual(response.status_code, 405, response.content)
        self.assertTrue(AssignmentLesson.objects.filter(pk=self.lesson.pk).exists())

    def test_cannot_inject_task_or_lesson_into_foreign_assignment(self):
        student = Ogrenci.objects.create(kurum=self.student.kurum, sube=self.student.sube,
                                        ad='Other', soyad='Student')
        foreign = ManualAssignment.objects.create(student=student, coach=self.admin,
                                                title='Foreign', due_date=timezone.now())
        block = AssignmentLesson.objects.create(assignment=foreign, order=0)
        for path, payload in [('tasks/', {'lesson_block': block.pk, 'task_type': 'SOLVE_TEST', 'title': 'Injected'}),
                              ('lessons/', {'assignment': foreign.pk, 'order': 0})]:
            response = self.client.post(BASE + path, payload, format='json')
            self.assertEqual(response.status_code, 405, response.content)
        self.assertFalse(AssignmentTask.objects.filter(lesson_block=block).exists())
        self.assertEqual(foreign.lessons.count(), 1)

    def test_task_and_lesson_lists_use_selected_branch_and_hide_deleted(self):
        self.client.force_authenticate(user=self.admin)
        sube = Sube.objects.create(kurum=self.student.kurum, ad='Other', kod='OTH')
        other = Ogrenci.objects.create(kurum=self.student.kurum, sube=sube, ad='Other', soyad='Branch')
        assignment = ManualAssignment.objects.create(student=other, coach=self.admin,
                                                    title='Other branch', due_date=timezone.now())
        lesson = AssignmentLesson.objects.create(assignment=assignment, order=0)
        task = AssignmentTask.objects.create(lesson_block=lesson, title='Hidden', task_type='SOLVE_TEST', order=0)
        for path, hidden in [('tasks/', task.pk), ('lessons/', lesson.pk)]:
            response = self.client.get(BASE + path)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertNotIn(hidden, [item['id'] for item in response.json()])
        self.assignment.is_active = False
        self.assignment.save(update_fields=['is_active'])
        self.assertEqual(self.client.get(BASE + 'tasks/').json(), [])
        self.assertEqual(self.client.get(BASE + 'lessons/').json(), [])

    def test_sidebar_count_matches_selected_branch_stats(self):
        self.client.force_authenticate(user=self.admin)
        sube = Sube.objects.create(kurum=self.student.kurum, ad='Other', kod='OT')
        other = Ogrenci.objects.create(kurum=self.student.kurum, sube=sube, ad='Other', soyad='Branch')
        ManualAssignment.objects.create(student=other, coach=self.admin, title='Today',
                                        status='ASSIGNED', due_date=timezone.now())
        stats = self.client.get(BASE + 'assignments/stats/').json()['data']
        badge = self.client.get(BASE + 'assignments/kontrol_badge/').json()['data']
        self.assertEqual(stats['due_today'], 0)
        self.assertEqual(badge['count'], stats['due_today'])
