from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.coaching.assignment_manual.models import (
    AssignmentLesson,
    AssignmentTask,
    ManualAssignment,
)
from apps.coaching.study_program.models import ProgramBlock, ProgramDay, WeeklyProgram
from apps.coaching.study_program.services import auto_distribute, move_block, sync_program_date_range
from apps.egitim_tanimlari.models import Ders
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class AutoDistributeEqualTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Dağıt Kurum', kod='DAG')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ece', soyad='Demir', aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_dist', email='coach_dist@test.com', password='testpass123',
        )
        self.ders = Ders.objects.create(kurum=self.kurum, sube=self.sube, ad='Matematik', kod='MAT')
        self.week_start = date(2026, 10, 16)
        self.week_end = date(2026, 10, 22)
        self.program = WeeklyProgram.objects.create(
            student=self.student,
            coach=self.coach,
            week_start=self.week_start,
            week_end=self.week_end,
        )
        for i in range(7):
            d = self.week_start + timedelta(days=i)
            ProgramDay.objects.create(program=self.program, day_date=d, weekday=d.weekday())

        assigned = timezone.make_aware(datetime(2026, 10, 15, 12, 0))
        due = timezone.make_aware(datetime(2026, 10, 22, 23, 59))
        self.assignment = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Ekim Haftası',
            status='ASSIGNED',
            assigned_date=assigned,
            due_date=due,
            is_active=True,
        )
        self.old = ManualAssignment.objects.create(
            coach=self.coach,
            student=self.student,
            title='Eylül Haftası',
            status='OVERDUE',
            assigned_date=timezone.make_aware(datetime(2026, 9, 24, 12, 0)),
            due_date=timezone.make_aware(datetime(2026, 10, 1, 23, 59)),
            is_active=True,
        )

    def _lesson(self, topic, questions, order=0):
        lesson = AssignmentLesson.objects.create(
            assignment=self.assignment,
            lesson=self.ders,
            topic_name=topic,
            order=order,
        )
        per = questions // 2
        rest = questions - per
        AssignmentTask.objects.create(
            lesson_block=lesson, task_type='SOLVE_TEST', title=f'{topic} A',
            question_count=per, order=0,
        )
        AssignmentTask.objects.create(
            lesson_block=lesson, task_type='SOLVE_TEST', title=f'{topic} B',
            question_count=rest, order=1,
        )
        return lesson

    def test_question_metric_splits_each_topic_across_every_day(self):
        self._lesson('Konu A', 100, order=0)
        self._lesson('Konu B', 50, order=1)
        result = auto_distribute(self.program, assignment_ids=[self.assignment.id, self.old.id], metric='question')
        self.assertEqual(result['study_days'], 7)
        self.assertEqual(result['distributed'], 14)
        self.assertEqual(sum(result['per_day']), 150)

        by_topic = {}
        for block in ProgramBlock.objects.filter(day__program=self.program):
            by_topic.setdefault(block.topic_name, []).append(block.question_count)
        self.assertEqual(sorted(by_topic['Konu A']), sorted([15, 15, 14, 14, 14, 14, 14]))
        self.assertEqual(sorted(by_topic['Konu B']), sorted([8, 7, 7, 7, 7, 7, 7]))

        control = self.program.days.get(day_date=self.week_end)
        self.assertEqual(control.blocks.count(), 2)
        self.assertFalse(
            ProgramBlock.objects.filter(day__program=self.program, source_assignment=self.old).exists()
        )

    def test_forty_seven_questions_land_on_every_day_including_control(self):
        self._lesson('Doğruda Açı', 47, order=0)
        result = auto_distribute(self.program, assignment_ids=[self.assignment.id], metric='question')
        self.assertEqual(result['distributed'], 7)
        counts = []
        for day in self.program.days.order_by('day_date'):
            block = day.blocks.get()
            self.assertEqual(block.topic_name, 'Doğruda Açı')
            counts.append(block.question_count)
        self.assertEqual(counts, [7, 7, 7, 7, 7, 6, 6])
        self.assertEqual(sum(counts), 47)

    def test_eight_days_include_the_assignment_day_and_the_control_day(self):
        sync_program_date_range(self.program, date(2026, 10, 15), self.week_end)
        self._lesson('Doğruda Açı', 47, order=0)
        result = auto_distribute(self.program, assignment_ids=[self.assignment.id], metric='question')
        self.assertEqual(result['study_days'], 8)
        self.assertEqual(result['distributed'], 8)
        days = list(self.program.days.order_by('day_date'))
        self.assertEqual(days[0].day_date, date(2026, 10, 15))
        self.assertEqual(days[-1].day_date, self.week_end)
        counts = [day.blocks.get().question_count for day in days]
        self.assertEqual(counts, [6, 6, 6, 6, 6, 6, 6, 5])
        self.assertEqual(sum(counts), 47)

    def test_selected_days_receive_the_homework_and_the_rest_stay_empty(self):
        self._lesson('Doğruda Açı', 47, order=0)
        days = list(self.program.days.order_by('day_date'))
        chosen = [days[0].id, days[2].id, days[-1].id]
        result = auto_distribute(
            self.program,
            assignment_ids=[self.assignment.id],
            metric='question',
            day_ids=chosen,
        )
        self.assertEqual(result['study_days'], 3)
        self.assertEqual(result['distributed'], 3)
        filled = []
        for day in days:
            blocks = list(day.blocks.all())
            if day.id in chosen:
                self.assertEqual(len(blocks), 1)
                filled.append(blocks[0].question_count)
            else:
                self.assertEqual(blocks, [])
        self.assertEqual(sum(filled), 47)

    def test_move_merges_same_topic_on_target_day(self):
        lesson = self._lesson('Doğruda Açı', 47, order=0)
        days = list(self.program.days.order_by('day_date'))
        kept = ProgramBlock.objects.create(
            day=days[1],
            source_assignment=self.assignment,
            source_lesson=lesson,
            topic_name='Doğruda Açı',
            title='Doğruda Açı (2/7)',
            question_count=6,
        )
        moved = ProgramBlock.objects.create(
            day=days[0],
            source_assignment=self.assignment,
            source_lesson=lesson,
            topic_name='Doğruda Açı',
            title='Doğruda Açı (1/7)',
            question_count=7,
        )
        result = move_block(moved, days[1])
        self.assertTrue(result['merged'])
        self.assertFalse(ProgramBlock.objects.filter(pk=moved.pk).exists())
        kept.refresh_from_db()
        self.assertEqual(kept.question_count, 13)
        self.assertEqual(kept.title, 'Doğruda Açı')
        self.assertEqual(days[1].blocks.count(), 1)
        self.assertEqual(days[0].blocks.count(), 0)

    def test_test_metric_keeps_tests_whole(self):
        self._lesson('Konu A', 100, order=0)  # 2 test, 50+50
        self._lesson('Konu B', 40, order=1)   # 2 test, 20+20
        result = auto_distribute(self.program, assignment_ids=[self.assignment.id], metric='test')
        blocks = list(ProgramBlock.objects.filter(day__program=self.program))
        self.assertEqual(result['distributed'], 4)
        self.assertEqual(len(blocks), 4)
        self.assertEqual(sum(b.question_count for b in blocks), 140)
        self.assertEqual(sorted(b.question_count for b in blocks), [20, 20, 50, 50])
        topics = {b.topic_name for b in blocks}
        self.assertEqual(topics, {'Konu A', 'Konu B'})

    def test_reset_response_does_not_keep_deleted_blocks(self):
        day = self.program.days.order_by('day_date').first()
        ProgramBlock.objects.create(
            day=day,
            source_assignment=self.assignment,
            topic_name='Doğruda Açı',
            title='Doğruda Açı',
            question_count=7,
        )
        client = APIClient()
        client.force_authenticate(user=self.coach)
        client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        response = client.post(f'/api/coaching/study-program/programs/{self.program.id}/reset/')
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload['deleted'], 1)
        self.assertEqual(payload['program']['total_block_count'], 0)
        returned_blocks = [
            block
            for day_row in payload['program']['days']
            for block in day_row['blocks']
        ]
        self.assertEqual(returned_blocks, [])
        self.assertFalse(ProgramBlock.objects.filter(day__program=self.program).exists())
