"""
Academic Views
"""

from .schedule_template import (
    schedule_template_list_api,
    schedule_template_create_api,
    schedule_template_detail_api,
    schedule_template_update_api,
    schedule_template_delete_api,
    schedule_template_copy_api,
    schedule_template_usage_api,
    schedule_template_export_api,
)
from .timeslot import (
    timeslot_list_api,
    timeslot_create_api,
    timeslot_bulk_create_api,
    timeslot_bulk_delete_api,
    timeslot_detail_api,
    timeslot_update_api,
    timeslot_delete_api,
    timeslot_reorder_api,
    timeslot_by_template_api,
    # Slot Generator
    timeslot_generate_preview_api,
    timeslot_generate_create_api,
    timeslot_bulk_shift_api,
    timeslot_bulk_duration_api,
)
from .teacher_availability import (
    teacher_availability_teachers_api,
    teacher_availability_detail_api,
    teacher_availability_grid_api,
    teacher_availability_save_api,
    teacher_availability_temp_delete_api,
)
from .weekly_cycle import (
    weekly_cycle_list_api,
    weekly_cycle_create_api,
    weekly_cycle_detail_api,
    weekly_cycle_update_api,
    weekly_cycle_delete_api,
    weekly_cycle_copy_api,
    weekly_cycle_usage_api,
    weekly_cycle_plan_save_api,
    weekly_day_list_api,
    weekly_day_create_api,
    weekly_day_detail_api,
    weekly_day_update_api,
    weekly_day_delete_api,
    weekly_day_create_defaults_api,
)
from .program_grid import (
    grid_generate_preview_api,
    grid_generate_create_api,
    grid_matrix_api,
    grid_clear_api,
    program_grid_cell_list_api,
    program_grid_cell_detail_api,
    program_grid_cell_update_api,
    program_grid_cell_bulk_update_api,
)
from .class_lesson_plan import (
    active_academic_year_api,
    class_lesson_plan_list_api,
    class_lesson_plan_detail_api,
    class_lesson_plan_create_api,
    class_lesson_plan_update_api,
    class_lesson_plan_delete_api,
)
from .lesson_teacher_pool import (
    lesson_teacher_pool_list_api,
    lesson_teacher_pool_detail_api,
    lesson_teacher_pool_create_api,
    lesson_teacher_pool_update_api,
    lesson_teacher_pool_delete_api,
)
from .class_lesson_teacher_assignment import (
    teacher_roles_api,
    class_lesson_teacher_assignment_list_api,
    class_lesson_teacher_assignment_detail_api,
    class_lesson_teacher_assignment_create_api,
    class_lesson_teacher_assignment_update_api,
    class_lesson_teacher_assignment_delete_api,
)
from .schedule_view import (
    class_schedule_api,
    teacher_schedule_api,
    student_schedule_api,
    room_schedule_api,
    daily_flow_api,
)
from .schedule_version import (
    version_list_api as schedule_version_list_api,
    version_create_api as schedule_version_create_api,
    version_detail_api as schedule_version_detail_api,
    version_update_api as schedule_version_update_api,
    version_delete_api as schedule_version_delete_api,
    version_activate_api as schedule_version_activate_api,
    version_duplicate_api as schedule_version_duplicate_api,
    version_lock_api as schedule_version_lock_api,
    version_unlock_api as schedule_version_unlock_api,
)

__all__ = [
    # Schedule Template
    'schedule_template_list_api',
    'schedule_template_create_api',
    'schedule_template_detail_api',
    'schedule_template_update_api',
    'schedule_template_delete_api',
    'schedule_template_copy_api',
    'schedule_template_usage_api',
    'schedule_template_export_api',
    # TimeSlot
    'timeslot_list_api',
    'timeslot_create_api',
    'timeslot_bulk_create_api',
    'timeslot_bulk_delete_api',
    'timeslot_bulk_shift_api',
    'timeslot_bulk_duration_api',
    'timeslot_detail_api',
    'timeslot_update_api',
    'timeslot_delete_api',
    'timeslot_reorder_api',
    'timeslot_by_template_api',
    # Slot Generator
    'timeslot_generate_preview_api',
    'timeslot_generate_create_api',
    # Weekly Cycle
    'weekly_cycle_list_api',
    'weekly_cycle_create_api',
    'weekly_cycle_detail_api',
    'weekly_cycle_update_api',
    'weekly_cycle_delete_api',
    'weekly_cycle_copy_api',
    'weekly_cycle_usage_api',
    'weekly_cycle_plan_save_api',
    'weekly_day_list_api',
    'weekly_day_create_api',
    'weekly_day_detail_api',
    'weekly_day_update_api',
    'weekly_day_delete_api',
    'weekly_day_create_defaults_api',
    # Program Grid
    'grid_generate_preview_api',
    'grid_generate_create_api',
    'grid_matrix_api',
    'grid_clear_api',
    'program_grid_cell_list_api',
    'program_grid_cell_detail_api',
    'program_grid_cell_update_api',
    'program_grid_cell_bulk_update_api',
    # Class Lesson Plan
    'active_academic_year_api',
    'class_lesson_plan_list_api',
    'class_lesson_plan_detail_api',
    'class_lesson_plan_create_api',
    'class_lesson_plan_update_api',
    'class_lesson_plan_delete_api',
    # Lesson Teacher Pool
    'lesson_teacher_pool_list_api',
    'lesson_teacher_pool_detail_api',
    'lesson_teacher_pool_create_api',
    'lesson_teacher_pool_update_api',
    'lesson_teacher_pool_delete_api',
    # Class Lesson Teacher Assignment
    'teacher_roles_api',
    'class_lesson_teacher_assignment_list_api',
    'class_lesson_teacher_assignment_detail_api',
    'class_lesson_teacher_assignment_create_api',
    'class_lesson_teacher_assignment_update_api',
    'class_lesson_teacher_assignment_delete_api',
    # Schedule View (Perspectives)
    'class_schedule_api',
    'teacher_schedule_api',
    'student_schedule_api',
    'room_schedule_api',
    'daily_flow_api',
    # Schedule Version Management
    'schedule_version_list_api',
    'schedule_version_create_api',
    'schedule_version_detail_api',
    'schedule_version_update_api',
    'schedule_version_delete_api',
    'schedule_version_activate_api',
    'schedule_version_duplicate_api',
    'schedule_version_lock_api',
    'schedule_version_unlock_api',
    # Teacher Availability
    'teacher_availability_teachers_api',
    'teacher_availability_detail_api',
    'teacher_availability_grid_api',
    'teacher_availability_save_api',
    'teacher_availability_temp_delete_api',
]
