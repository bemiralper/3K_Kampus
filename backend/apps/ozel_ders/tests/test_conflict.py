from datetime import time

from django.test import SimpleTestCase

from apps.ozel_ders.services.conflict_service import validate_slot_window
from apps.ozel_ders.services.errors import OzelDersError


class ConflictHelperTests(SimpleTestCase):
    def test_validate_slot_window_ok(self):
        validate_slot_window(time(10, 0), time(11, 0))

    def test_validate_slot_window_bad(self):
        with self.assertRaises(OzelDersError):
            validate_slot_window(time(11, 0), time(10, 0))
