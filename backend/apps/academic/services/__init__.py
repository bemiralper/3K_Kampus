"""
Academic Services
"""

from .slot_generator import SlotGenerator
from .class_lesson_plan_service import ClassLessonPlanService, ClassLessonPlanValidationError
from .lesson_teacher_pool_service import LessonTeacherPoolService, LessonTeacherPoolValidationError
from .class_lesson_teacher_assignment_service import ClassLessonTeacherAssignmentService, ClassLessonTeacherAssignmentValidationError

__all__ = [
    'SlotGenerator',
    'ClassLessonPlanService',
    'ClassLessonPlanValidationError',
    'LessonTeacherPoolService',
    'LessonTeacherPoolValidationError',
    'ClassLessonTeacherAssignmentService',
    'ClassLessonTeacherAssignmentValidationError',
]
