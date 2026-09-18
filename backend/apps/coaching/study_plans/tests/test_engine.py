from datetime import date, datetime, timedelta

from django.test import TestCase
from django.utils import timezone

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.coaching.study_plans.engine import (
    StudyPlanError,
    build_draft,
    locked_day_plans,
    persist_draft,
    remaining_units_after_lock,
    split_even,
)
from apps.coaching.study_plans.models import StudyProgram, StudyTemplate
from apps.coaching.study_plans.services import ensure_builtin_templates
from apps.egitim_tanimlari.models import Ders
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube


class SplitHelpersTest(TestCase):
    def test_ten_over_five(self):
        self.assertEqual(split_even(10, 5), [2, 2, 2, 2, 2])

    def test_hundred_over_five(self):
        self.assertEqual(split_even(100, 5), [20, 20, 20, 20, 20])


class StudyPlanEngineTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Plan Kurum', kod='PLK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ali', soyad='Veli', aktif_mi=True,
        )
        self.ders = Ders.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT',
        )
        ensure_builtin_templates(self.kurum)
        self.template = StudyTemplate.objects.get(kurum=self.kurum, name='Standart')
        self.week_start = date(2026, 9, 14)  # Pazartesi
        self.today = date(2026, 9, 14)

    def _create_tests(self, count, questions_each=10, title='10 Test Ödevi'):
        assignment = ManualAssignment.objects.create(
            student=self.student,
            title=title,
            status='ASSIGNED',
            assigned_date=timezone.make_aware(datetime(2026, 9, 14, 9, 0)),
            due_date=timezone.make_aware(datetime(2026, 9, 21, 18, 0)),
            is_active=True,
            priority='MEDIUM',
        )
        lesson = AssignmentLesson.objects.create(
            assignment=assignment,
            lesson=self.ders,
            topic_name='Fonksiyonlar',
        )
        for i in range(count):
            AssignmentTask.objects.create(
                lesson_block=lesson,
                task_type=AssignmentTask.TaskType.SOLVE_TEST,
                title=f'Test {i + 1}',
                question_count=questions_each,
                estimated_duration_minutes=12,
                order=i,
            )
        return assignment

    def test_ten_tests_split_across_five_days(self):
        self._create_tests(10, questions_each=10)
        draft = build_draft(
            student_id=self.student.id,
            week_start=self.week_start,
            template=self.template,
            today=self.today,
            lock_past=False,
        )
        shares = [sum(s['planned_tests'] for s in d.slots) for d in draft.days]
        self.assertEqual(shares, [2, 2, 2, 2, 2])
        questions = [sum(s['planned_questions'] for s in d.slots) for d in draft.days]
        self.assertEqual(questions, [20, 20, 20, 20, 20])
        self.assertEqual(draft.leftovers, [])

    def test_hundred_questions_by_question(self):
        assignment = ManualAssignment.objects.create(
            student=self.student,
            title='100 Soru',
            status='ASSIGNED',
            assigned_date=timezone.make_aware(datetime(2026, 9, 14, 9, 0)),
            due_date=timezone.make_aware(datetime(2026, 9, 21, 18, 0)),
            is_active=True,
        )
        lesson = AssignmentLesson.objects.create(assignment=assignment, lesson=self.ders)
        AssignmentTask.objects.create(
            lesson_block=lesson,
            task_type=AssignmentTask.TaskType.REVIEW_TOPIC,
            title='Soru bankası',
            question_count=100,
            estimated_duration_minutes=100,
        )
        self.template.strategy = 'BY_QUESTION'
        self.template.save(update_fields=['strategy'])
        draft = build_draft(
            student_id=self.student.id,
            week_start=self.week_start,
            template=self.template,
            today=self.today,
            lock_past=False,
        )
        questions = [sum(s['planned_questions'] for s in d.slots) for d in draft.days]
        self.assertEqual(questions, [20, 20, 20, 20, 20])

    def test_over_cap_goes_to_leftover(self):
        self._create_tests(15, questions_each=10, title='15 Test')
        draft = build_draft(
            student_id=self.student.id,
            week_start=self.week_start,
            template=self.template,
            today=self.today,
            lock_past=False,
        )
        placed = sum(s['planned_tests'] for d in draft.days for s in d.slots)
        leftover_tests = sum(item.remaining_tests for item in draft.leftovers)
        self.assertEqual(placed, 10)
        self.assertEqual(leftover_tests, 5)
        self.assertTrue(draft.overflow_sources >= 1)

    def test_midweek_regenerate_locks_past_days(self):
        self._create_tests(10)
        draft = build_draft(
            student_id=self.student.id,
            week_start=self.week_start,
            template=self.template,
            today=self.today,
            lock_past=False,
        )
        program = persist_draft(
            student=self.student,
            coach=None,
            template=self.template,
            draft=draft,
        )
        monday = program.days.get(day_date=self.week_start)
        monday_tests = monday.planned_tests
        wednesday = date(2026, 9, 16)
        locked = locked_day_plans(program, wednesday)
        self.assertEqual(len(locked), 2)
        remaining = remaining_units_after_lock(draft.units, locked)
        remaining_tests = sum(u.tests for u in remaining)
        self.assertEqual(remaining_tests, 6)

        redraft = build_draft(
            student_id=self.student.id,
            week_start=self.week_start,
            template=self.template,
            today=wednesday,
            lock_past=True,
            locked_days=locked,
        )
        from apps.coaching.study_plans.engine import distribute_units
        open_days = [d for d in redraft.days if not d.is_locked]
        for day in open_days:
            day.slots = []
            day.remaining_tests = day.cap_tests
            day.remaining_questions = day.cap_questions
            day.remaining_minutes = day.cap_minutes
            day.remaining_slots = day.cap_slots
        redraft.units = remaining
        redraft.leftovers = distribute_units(
            remaining, redraft.days, self.template.strategy, True,
        )
        persist_draft(
            student=self.student,
            coach=None,
            template=self.template,
            draft=redraft,
            program=program,
            keep_day_ids={monday.id, program.days.get(day_date=self.week_start + timedelta(days=1)).id},
        )
        monday.refresh_from_db()
        self.assertEqual(monday.planned_tests, monday_tests)
        future = program.days.filter(day_date__gte=wednesday)
        self.assertTrue(future.exists())

    def test_no_eligible_days_errors(self):
        self.template.active_weekdays = []
        self.template.save(update_fields=['active_weekdays'])
        with self.assertRaises(StudyPlanError):
            build_draft(
                student_id=self.student.id,
                week_start=self.week_start,
                template=self.template,
                today=self.today,
                lock_past=False,
            )

    def test_same_student_week_unique(self):
        self._create_tests(4)
        draft = build_draft(
            student_id=self.student.id,
            week_start=self.week_start,
            template=self.template,
            today=self.today,
            lock_past=False,
        )
        persist_draft(student=self.student, coach=None, template=self.template, draft=draft)
        with self.assertRaises(Exception):
            persist_draft(student=self.student, coach=None, template=self.template, draft=draft)
        self.assertEqual(StudyProgram.objects.filter(student=self.student).count(), 1)

    def _hw(self, title, assigned, due, tests=9, questions_each=10):
        assignment = ManualAssignment.objects.create(
            student=self.student,
            title=title,
            status='ASSIGNED',
            assigned_date=timezone.make_aware(datetime.combine(assigned, datetime.min.time().replace(hour=9))),
            due_date=timezone.make_aware(datetime.combine(due, datetime.min.time().replace(hour=18))),
            is_active=True,
        )
        lesson = AssignmentLesson.objects.create(
            assignment=assignment, lesson=self.ders, topic_name=title,
        )
        for i in range(tests):
            AssignmentTask.objects.create(
                lesson_block=lesson,
                task_type=AssignmentTask.TaskType.SOLVE_TEST,
                title=f'{title} {i + 1}',
                question_count=questions_each,
                estimated_duration_minutes=12,
                order=i,
            )
        return assignment

    def test_other_week_homework_not_ingested(self):
        self._hw('Hafta A ödevi', date(2026, 9, 14), date(2026, 9, 21), tests=10)
        self._hw('Hafta B ödevi', date(2026, 9, 21), date(2026, 9, 28), tests=10)
        week_a = build_draft(
            student_id=self.student.id,
            week_start=date(2026, 9, 14),
            template=self.template,
            today=date(2026, 9, 14),
            lock_past=False,
        )
        week_b = build_draft(
            student_id=self.student.id,
            week_start=date(2026, 9, 21),
            template=self.template,
            today=date(2026, 9, 14),
            lock_past=False,
        )
        self.assertEqual({u.title for u in week_a.units}, {'Hafta A ödevi'})
        self.assertEqual({u.title for u in week_b.units}, {'Hafta B ödevi'})
        self.assertTrue(all(date(2026, 9, 14) <= d.day_date <= date(2026, 9, 20) for d in week_a.days))
        self.assertTrue(all(date(2026, 9, 21) <= d.day_date <= date(2026, 9, 27) for d in week_b.days))
        self.assertEqual(sum(u.tests for u in week_a.units), 10)
        self.assertEqual(sum(u.tests for u in week_b.units), 10)

    def test_three_week_homework_sliced_per_selected_week(self):
        self._hw('Üç haftalık', date(2026, 9, 1), date(2026, 9, 21), tests=9)
        shares = []
        for start in (date(2026, 8, 31), date(2026, 9, 7), date(2026, 9, 14)):
            draft = build_draft(
                student_id=self.student.id,
                week_start=start,
                template=self.template,
                today=date(2026, 8, 31),
                lock_past=False,
            )
            shares.append(sum(u.tests for u in draft.units))
            self.assertTrue(all(start <= d.day_date <= start + timedelta(days=6) for d in draft.days))
        self.assertEqual(shares, [3, 3, 3])
        other = build_draft(
            student_id=self.student.id,
            week_start=date(2026, 9, 21),
            template=self.template,
            today=date(2026, 8, 31),
            lock_past=False,
        )
        self.assertEqual(sum(u.tests for u in other.units), 0)

    def test_three_week_homework_sliced_across_separate_lessons(self):
        """Canlı ödev gibi: 9 ders × 1 test, 3 haftaya 3+3+3 — hepsi ilk haftaya yığılmasın."""
        assignment = ManualAssignment.objects.create(
            student=self.student,
            title='Üç haftalık ayrı dersler',
            status='ASSIGNED',
            assigned_date=timezone.make_aware(datetime(2026, 9, 1, 9, 0)),
            due_date=timezone.make_aware(datetime(2026, 9, 21, 18, 0)),
            is_active=True,
        )
        for i in range(9):
            lesson = AssignmentLesson.objects.create(
                assignment=assignment, lesson=self.ders, topic_name=f'Ders {i + 1}',
            )
            AssignmentTask.objects.create(
                lesson_block=lesson,
                task_type=AssignmentTask.TaskType.SOLVE_TEST,
                title=f'Test {i + 1}',
                question_count=10,
                estimated_duration_minutes=12,
                order=i,
            )
        shares = []
        for start in (date(2026, 8, 31), date(2026, 9, 7), date(2026, 9, 14)):
            draft = build_draft(
                student_id=self.student.id,
                week_start=start,
                template=self.template,
                today=date(2026, 8, 31),
                lock_past=False,
            )
            shares.append(sum(u.tests for u in draft.units))
            self.assertTrue(all(start <= d.day_date <= start + timedelta(days=6) for d in draft.days))
        self.assertEqual(shares, [3, 3, 3])

    def test_sunday_assign_stays_on_following_week(self):
        """Pazar verilen '2. hafta' ödevi önceki Pazartesi haftasına dökülmez."""
        self._hw('Eylül 2. Hafta', date(2026, 9, 13), date(2026, 9, 20), tests=10)
        week_prev = build_draft(
            student_id=self.student.id,
            week_start=date(2026, 9, 7),
            template=self.template,
            today=date(2026, 9, 7),
            lock_past=False,
        )
        week_work = build_draft(
            student_id=self.student.id,
            week_start=date(2026, 9, 14),
            template=self.template,
            today=date(2026, 9, 7),
            lock_past=False,
        )
        self.assertEqual(sum(u.tests for u in week_prev.units), 0)
        self.assertEqual(sum(u.tests for u in week_work.units), 10)
        self.assertEqual([d.day_date for d in week_work.days], [
            date(2026, 9, 14), date(2026, 9, 15), date(2026, 9, 16),
            date(2026, 9, 17), date(2026, 9, 18),
        ])
