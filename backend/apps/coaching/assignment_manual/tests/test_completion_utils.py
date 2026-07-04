from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.completion_utils import (
    build_report_summary_counts,
    compute_weighted_completion_percent,
    effective_task_completion_percent,
)
from apps.coaching.assignment_manual.models import AssignmentLesson, AssignmentTask, ManualAssignment
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class CompletionUtilsTest(TestCase):
    def setUp(self):
        kurum = Kurum.objects.create(ad='K', kod='K')
        sube = Sube.objects.create(kurum=kurum, ad='S', kod='S')
        self.student = Ogrenci.objects.create(
            kurum=kurum, sube=sube, ad='A', soyad='B', aktif_mi=True,
        )
        self.assignment = ManualAssignment.objects.create(
            student=self.student,
            title='Ödev',
            status='ASSIGNED',
            due_date=timezone.now() + timezone.timedelta(days=7),
        )
        self.lesson = AssignmentLesson.objects.create(assignment=self.assignment, order=0)

    def _task(self, **kwargs):
        return AssignmentTask.objects.create(lesson_block=self.lesson, **kwargs)

    def test_partial_task_never_counts_as_100(self):
        task = self._task(
            task_type='SOLVE_TEST',
            title='G',
            completion_status='PARTIAL',
            task_completion_percent=100,
        )
        self.assertEqual(effective_task_completion_percent(task), 90)

    def test_weighted_with_partial_and_done(self):
        self._task(
            task_type='SOLVE_TEST', title='A', order=0,
            completion_status='PARTIAL', task_completion_percent=60,
        )
        self._task(
            task_type='SOLVE_TEST', title='B', order=1,
            completion_status='DONE', task_completion_percent=100,
        )
        tasks = AssignmentTask.objects.filter(lesson_block__assignment=self.assignment)
        self.assertEqual(compute_weighted_completion_percent(tasks), 80)

    def test_report_summary_not_binary_done_ratio(self):
        self._task(
            task_type='SOLVE_TEST', title='A', order=0,
            completion_status='PARTIAL', task_completion_percent=50,
        )
        self._task(
            task_type='SOLVE_TEST', title='B', order=1,
            completion_status='PENDING', task_completion_percent=0,
        )
        tasks = AssignmentTask.objects.filter(lesson_block__assignment=self.assignment)
        summary = build_report_summary_counts(tasks)
        self.assertEqual(summary['done_tasks'], 0)
        self.assertEqual(summary['partial_tasks'], 1)
        self.assertEqual(summary['task_completion_percent'], 25)
        self.assertNotEqual(summary['task_completion_percent'], 0)

    def test_assignment_outcome_stats(self):
        from apps.coaching.assignment_manual.completion_utils import build_assignment_outcome_stats

        a_full = ManualAssignment.objects.create(
            student=self.student, title='Tam', status='ASSIGNED',
            due_date=timezone.now() + timezone.timedelta(days=7),
        )
        l_full = AssignmentLesson.objects.create(assignment=a_full, order=0)
        AssignmentTask.objects.create(
            lesson_block=l_full, task_type='SOLVE_TEST', title='G', order=0,
            completion_status='DONE', task_completion_percent=100,
        )

        a_partial = ManualAssignment.objects.create(
            student=self.student, title='Eksik', status='ASSIGNED',
            due_date=timezone.now() + timezone.timedelta(days=7),
        )
        l_partial = AssignmentLesson.objects.create(assignment=a_partial, order=0)
        AssignmentTask.objects.create(
            lesson_block=l_partial, task_type='SOLVE_TEST', title='G', order=0,
            completion_status='PARTIAL', task_completion_percent=60,
        )

        a_not_brought = ManualAssignment.objects.create(
            student=self.student, title='Getirmedi', status='ASSIGNED',
            due_date=timezone.now() + timezone.timedelta(days=7),
            non_submission_reason='NOT_BROUGHT',
        )

        assignments = [a_full, a_partial, a_not_brought, self.assignment]
        tasks_map = {}
        for a in assignments:
            tasks_map[a.id] = list(
                AssignmentTask.objects.filter(lesson_block__assignment=a)
            )

        stats = build_assignment_outcome_stats(assignments, tasks_map)
        self.assertEqual(stats['full_assignments'], 1)
        self.assertEqual(stats['partial_assignments'], 1)
        self.assertEqual(stats['not_brought_assignments'], 1)
        self.assertEqual(stats['pending_evaluations'], 1)
        self.assertEqual(stats['evaluated_assignments'], 3)
