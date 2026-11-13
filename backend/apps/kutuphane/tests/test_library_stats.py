"""Salon masa sayıları atama geçmişinden şişmemeli."""
from datetime import date

from django.test import TestCase

from apps.kurum.domain.models import Kurum
from apps.kutuphane.application.service import LibraryService
from apps.kutuphane.domain.models import (
    AssignmentStatus,
    Library,
    Seat,
    SeatAssignment,
    SeatStatus,
)
from apps.sube.domain.models import Sube


class LibrarySeatStatsTest(TestCase):
    def setUp(self):
        self.kurum = Kurum.objects.create(ad='İstatistik Kurum', kod='ISTK')
        self.sube = Sube.objects.create(kurum=self.kurum, ad='Merkez', kod='ISTK-M')
        self.library = Library.objects.create(
            kurum_id=self.kurum.id,
            sube_id=self.sube.id,
            ad='Kütüphane-1',
            kod='KTP-01',
            kapasite=3,
        )
        self.occupied = Seat.objects.create(
            library=self.library, masa_no='1', durum=SeatStatus.OCCUPIED,
        )
        self.was_assigned = Seat.objects.create(
            library=self.library, masa_no='2', durum=SeatStatus.AVAILABLE,
        )
        self.empty = Seat.objects.create(
            library=self.library, masa_no='3', durum=SeatStatus.AVAILABLE,
        )
        self.deleted = Seat.objects.create(
            library=self.library, masa_no='4', durum=SeatStatus.OCCUPIED, is_deleted=True,
        )

        self._assign(self.occupied, AssignmentStatus.ACTIVE, ogrenci_id=1)
        self._assign(self.occupied, AssignmentStatus.ENDED, ogrenci_id=2)
        self._assign(self.occupied, AssignmentStatus.ENDED, ogrenci_id=3)
        self._assign(self.was_assigned, AssignmentStatus.ENDED, ogrenci_id=4)
        self._assign(self.was_assigned, AssignmentStatus.ENDED, ogrenci_id=5)
        self._assign(self.deleted, AssignmentStatus.ACTIVE, ogrenci_id=6)

    def _assign(self, seat, durum, ogrenci_id):
        SeatAssignment.objects.create(
            library=self.library,
            seat=seat,
            ogrenci_id=ogrenci_id,
            baslangic_tarihi=date(2026, 1, 1),
            durum=durum,
        )

    def test_seat_counts_ignore_assignment_history(self):
        stats = LibraryService().get_dashboard_stats(self.kurum.id, self.sube.id)
        salon = stats['salonlar'][0]

        self.assertEqual(salon['toplam_masa'], 3)
        self.assertEqual(salon['dolu_masa'], 1)
        self.assertEqual(salon['bos_masa'], 2)
        self.assertEqual(salon['aktif_atama'], 1)
        self.assertEqual(salon['kapasite'], 3)
        self.assertEqual(salon['doluluk_orani'], 33.3)

        self.assertEqual(stats['toplam_masa'], 3)
        self.assertEqual(stats['dolu_masa'], 1)
        self.assertEqual(stats['aktif_atama'], 1)
        self.assertEqual(stats['toplam_kapasite'], 3)
