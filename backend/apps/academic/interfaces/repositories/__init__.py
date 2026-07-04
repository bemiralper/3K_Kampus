"""
Academic Repositories
"""
from apps.academic.interfaces.repositories.class_lesson_plan_repository import ClassLessonPlanRepository
from apps.academic.interfaces.repositories.lesson_teacher_pool_repository import LessonTeacherPoolRepository
from apps.academic.interfaces.repositories.class_lesson_teacher_assignment_repository import ClassLessonTeacherAssignmentRepository

__all__ = [
    'ClassLessonPlanRepository',
    'LessonTeacherPoolRepository',
    'ClassLessonTeacherAssignmentRepository',
]
