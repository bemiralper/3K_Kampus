"""
Academic Models
Django'nun modelleri algılaması için domain'den import ediyoruz.
"""

from apps.academic.domain.schedule_template import ScheduleTemplate
from apps.academic.domain.timeslot import TimeSlot, SlotType
from apps.academic.domain.weekly_cycle import WeeklyCycle
from apps.academic.domain.weekly_day import WeeklyDay, DayOfWeek
from apps.academic.domain.program_grid_cell import ProgramGridCell, CellStatus
from apps.academic.domain.class_lesson_plan import ClassLessonPlan
from apps.academic.domain.teacher_availability import (
    TeacherAvailabilitySet,
    TeacherAvailabilityCalendar,
    TeacherAvailabilityCell,
    AvailabilityKind,
    SlotAvailabilityStatus,
)

__all__ = [
    'ScheduleTemplate',
    'TimeSlot',
    'SlotType',
    'WeeklyCycle',
    'WeeklyDay',
    'DayOfWeek',
    'ProgramGridCell',
    'CellStatus',
    'ClassLessonPlan',
    'TeacherAvailabilitySet',
    'TeacherAvailabilityCalendar',
    'TeacherAvailabilityCell',
    'AvailabilityKind',
    'SlotAvailabilityStatus',
]
