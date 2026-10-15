from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.coaching.study_program.models import ProgramBlock, ProgramDay, WeeklyProgram
from apps.coaching.study_program.services import sync_program_date_range
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.sube.domain.models import Sube

User = get_user_model()


class SyncProgramDateRangeTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='SP Sync', kod='SPS')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.student = Ogrenci.objects.create(
            kurum=self.kurum, sube=self.sube, ad='Ayşe', soyad='Yılmaz', aktif_mi=True,
        )
        self.coach = User.objects.create_superuser(
            username='coach_sync', email='coach_sync@test.com', password='testpass123',
        )
        self.week_start = date(2026, 3, 2)  # Pazartesi
        self.week_end = date(2026, 3, 8)
        self.program = WeeklyProgram.objects.create(
            student=self.student,
            coach=self.coach,
            week_start=self.week_start,
            week_end=self.week_end,
        )
        for i in range(7):
            d = self.week_start + timedelta(days=i)
            ProgramDay.objects.create(program=self.program, day_date=d, weekday=d.weekday())

    def test_non_seven_day_range_rejected(self):
        with self.assertRaises(ValidationError):
            sync_program_date_range(self.program, self.week_start, date(2026, 3, 10))
        self.program.refresh_from_db()
        self.assertEqual(self.program.week_end, self.week_end)
        self.assertEqual(self.program.days.count(), 7)

    def test_shift_keeps_seven_days(self):
        new_start = date(2026, 3, 9)
        new_end = date(2026, 3, 15)
        result = sync_program_date_range(self.program, new_start, new_end)
        self.program.refresh_from_db()
        days = list(self.program.days.order_by('day_date').values_list('day_date', flat=True))
        self.assertEqual(days[0], new_start)
        self.assertEqual(days[-1], new_end)
        self.assertEqual(len(days), 7)
        self.assertEqual(result['day_count'], 7)

    def test_shrink_with_blocks_requires_force(self):
        last = self.program.days.get(day_date=self.week_end)
        ProgramBlock.objects.create(day=last, title='Blok', question_count=10)
        new_start = date(2026, 3, 1)
        new_end = date(2026, 3, 7)
        with self.assertRaises(ValidationError):
            sync_program_date_range(self.program, new_start, new_end)
        sync_program_date_range(
            self.program, new_start, new_end, force_remove_blocks=True,
        )
        self.program.refresh_from_db()
        self.assertEqual(self.program.days.count(), 7)
        self.assertFalse(ProgramBlock.objects.filter(day__program=self.program).exists())

    def test_patch_api_rejects_non_seven_days(self):
        client = APIClient()
        client.force_authenticate(user=self.coach)
        client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        res = client.patch(
            f'/api/coaching/study-program/programs/{self.program.id}/',
            {'week_end': '2026-03-12'},
            format='json',
        )
        self.assertEqual(res.status_code, 400)

    def test_patch_api_shifts_seven_day_window(self):
        client = APIClient()
        client.force_authenticate(user=self.coach)
        client.defaults['HTTP_X_KURUM_ID'] = str(self.kurum.id)
        client.defaults['HTTP_X_SUBE_ID'] = str(self.sube.id)
        res = client.patch(
            f'/api/coaching/study-program/programs/{self.program.id}/',
            {'week_start': '2026-03-09', 'week_end': '2026-03-15'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['week_start'], '2026-03-09')
        self.assertEqual(res.data['week_end'], '2026-03-15')
        day_dates = [d['day_date'] for d in res.data['days']]
        self.assertEqual(day_dates, sorted(day_dates))
        self.assertEqual(len(day_dates), 7)
