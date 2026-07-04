from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.coaching.models import CoachProfile, CoachStudentAssignment
from apps.coaching.services.coach_change import (
    CoachChangeError,
    change_primary_coach,
    get_student_assignment_history,
)
from apps.kurum.domain.models import Kurum
from apps.ogrenci.domain.models import Ogrenci
from apps.personel.domain.models import Personel
from apps.sube.domain.models import Sube

User = get_user_model()


class CoachChangeServiceTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='Test Kurum', kod='TST')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='MRK')
        self.ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ali',
            soyad='Veli',
            aktif_mi=True,
        )
        self.old_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Eski',
            soyad='Koç',
            tc_kimlik_no='11111111111',
        )
        self.new_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Yeni',
            soyad='Koç',
            tc_kimlik_no='22222222222',
        )
        self.old_coach = CoachProfile.objects.create(
            teacher=self.old_personel,
            capacity=10,
            is_active=True,
            is_coach=True,
        )
        self.new_coach = CoachProfile.objects.create(
            teacher=self.new_personel,
            capacity=10,
            is_active=True,
            is_coach=True,
        )
        self.assignment = CoachStudentAssignment.objects.create(
            coach=self.old_coach,
            student=self.ogrenci,
            start_date=date(2026, 1, 1),
            is_primary=True,
        )

    def test_change_primary_coach_ends_old_and_creates_new(self):
        result = change_primary_coach(
            student_id=self.ogrenci.id,
            new_coach_id=self.new_coach.id,
            transfer_date=date(2026, 6, 1),
        )

        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.end_date, date(2026, 6, 1))
        self.assertEqual(result.new_assignment.coach_id, self.new_coach.id)
        self.assertEqual(result.new_assignment.start_date, date(2026, 6, 1))
        self.assertIsNone(result.new_assignment.end_date)

        active = CoachStudentAssignment.objects.filter(
            student=self.ogrenci,
            is_primary=True,
            end_date__isnull=True,
        )
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.first().coach_id, self.new_coach.id)

    def test_change_to_same_coach_raises(self):
        with self.assertRaises(CoachChangeError) as ctx:
            change_primary_coach(
                student_id=self.ogrenci.id,
                new_coach_id=self.old_coach.id,
            )
        self.assertEqual(ctx.exception.code, 'already_assigned')

    def test_student_assignment_history_includes_both(self):
        change_primary_coach(
            student_id=self.ogrenci.id,
            new_coach_id=self.new_coach.id,
        )
        history = list(get_student_assignment_history(self.ogrenci.id))
        self.assertEqual(len(history), 2)
        coach_ids = {item.coach_id for item in history}
        self.assertEqual(coach_ids, {self.old_coach.id, self.new_coach.id})

    def test_capacity_full_blocks_change(self):
        full_personel = Personel.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Dolu',
            soyad='Koç',
            tc_kimlik_no='33333333333',
        )
        full_coach = CoachProfile.objects.create(
            teacher=full_personel,
            capacity=1,
            is_active=True,
            is_coach=True,
        )
        other_ogrenci = Ogrenci.objects.create(
            kurum=self.kurum,
            sube=self.sube,
            ad='Ayşe',
            soyad='Test',
            aktif_mi=True,
        )
        CoachStudentAssignment.objects.create(
            coach=full_coach,
            student=other_ogrenci,
            start_date=date.today(),
            is_primary=True,
        )

        with self.assertRaises(CoachChangeError) as ctx:
            change_primary_coach(
                student_id=self.ogrenci.id,
                new_coach_id=full_coach.id,
            )
        self.assertEqual(ctx.exception.code, 'capacity_full')
