"""
Academic URLs
"""

from django.urls import path
from apps.academic.interfaces.views import (
    # Schedule Template
    schedule_template_list_api,
    schedule_template_create_api,
    schedule_template_detail_api,
    schedule_template_update_api,
    schedule_template_delete_api,
    # TimeSlot
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
    # Weekly Cycle
    weekly_cycle_list_api,
    weekly_cycle_create_api,
    weekly_cycle_detail_api,
    weekly_cycle_update_api,
    weekly_cycle_delete_api,
    weekly_day_list_api,
    weekly_day_create_api,
    weekly_day_detail_api,
    weekly_day_update_api,
    weekly_day_delete_api,
    weekly_day_create_defaults_api,
    # Program Grid
    grid_generate_preview_api,
    grid_generate_create_api,
    grid_matrix_api,
    grid_clear_api,
    program_grid_cell_list_api,
    program_grid_cell_detail_api,
    program_grid_cell_update_api,
    program_grid_cell_bulk_update_api,
)
from apps.academic.interfaces.views.class_lesson_plan import (
    active_academic_year_api,
    class_lesson_plan_list_api,
    class_lesson_plan_detail_api,
    class_lesson_plan_create_api,
    class_lesson_plan_update_api,
    class_lesson_plan_delete_api,
    class_lesson_plan_summary_api,
)
from apps.academic.interfaces.views.lesson_teacher_pool import (
    lesson_teacher_pool_list_api,
    lesson_teacher_pool_detail_api,
    lesson_teacher_pool_create_api,
    lesson_teacher_pool_update_api,
    lesson_teacher_pool_delete_api,
)
from apps.academic.interfaces.views.class_lesson_teacher_assignment import (
    teacher_roles_api,
    class_lesson_teacher_assignment_list_api,
    class_lesson_teacher_assignment_detail_api,
    class_lesson_teacher_assignment_create_api,
    class_lesson_teacher_assignment_update_api,
    class_lesson_teacher_assignment_delete_api,
)
from apps.academic.interfaces.views.classroom_group import (
    classroom_group_list_api,
    classroom_group_create_api,
    classroom_group_detail_api,
    classroom_group_update_api,
    classroom_group_delete_api,
)
from apps.academic.interfaces.views.student_class_placement import (
    student_class_placement_list_api,
    student_class_placement_create_api,
    student_class_placement_detail_api,
    student_class_placement_update_api,
    student_class_placement_delete_api,
    placement_types_api,
    bulk_assign_api,
)
from apps.academic.interfaces.views.scheduler import (
    run_preview,
    run_execute,
    reset_grid,
    list_runs,
    get_run_detail,
)
from apps.academic.interfaces.views.schedule_view import (
    class_schedule_api,
    teacher_schedule_api,
    student_schedule_api,
    room_schedule_api,
    daily_flow_api,
)
from apps.academic.interfaces.views.schedule_version import (
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

app_name = 'academic'

urlpatterns = [
    # Schedule Template endpoints
    path('schedule-templates/', schedule_template_list_api, name='schedule-template-list'),
    path('schedule-templates/create/', schedule_template_create_api, name='schedule-template-create'),
    path('schedule-templates/<int:template_id>/', schedule_template_detail_api, name='schedule-template-detail'),
    path('schedule-templates/<int:template_id>/update/', schedule_template_update_api, name='schedule-template-update'),
    path('schedule-templates/<int:template_id>/delete/', schedule_template_delete_api, name='schedule-template-delete'),
    path('schedule-templates/<int:template_id>/timeslots/', timeslot_by_template_api, name='schedule-template-timeslots'),
    path('schedule-templates/<int:template_id>/timeslots/bulk-delete/', timeslot_bulk_delete_api, name='timeslot-bulk-delete'),
    
    # TimeSlot endpoints
    path('timeslots/', timeslot_list_api, name='timeslot-list'),
    path('timeslots/create/', timeslot_create_api, name='timeslot-create'),
    path('timeslots/bulk-create/', timeslot_bulk_create_api, name='timeslot-bulk-create'),
    path('timeslots/reorder/', timeslot_reorder_api, name='timeslot-reorder'),
    path('timeslots/<int:timeslot_id>/', timeslot_detail_api, name='timeslot-detail'),
    path('timeslots/<int:timeslot_id>/update/', timeslot_update_api, name='timeslot-update'),
    path('timeslots/<int:timeslot_id>/delete/', timeslot_delete_api, name='timeslot-delete'),
    
    # Slot Generator endpoints
    path('timeslots/generate-preview/', timeslot_generate_preview_api, name='timeslot-generate-preview'),
    path('timeslots/generate-create/', timeslot_generate_create_api, name='timeslot-generate-create'),
    
    # Weekly Cycle endpoints
    path('weekly-cycles/', weekly_cycle_list_api, name='weekly-cycle-list'),
    path('weekly-cycles/create/', weekly_cycle_create_api, name='weekly-cycle-create'),
    path('weekly-cycles/<int:pk>/', weekly_cycle_detail_api, name='weekly-cycle-detail'),
    path('weekly-cycles/<int:pk>/update/', weekly_cycle_update_api, name='weekly-cycle-update'),
    path('weekly-cycles/<int:pk>/delete/', weekly_cycle_delete_api, name='weekly-cycle-delete'),
    path('weekly-cycles/<int:cycle_pk>/create-defaults/', weekly_day_create_defaults_api, name='weekly-day-create-defaults'),
    
    # Weekly Day endpoints
    path('weekly-days/', weekly_day_list_api, name='weekly-day-list'),
    path('weekly-days/create/', weekly_day_create_api, name='weekly-day-create'),
    path('weekly-days/<int:pk>/', weekly_day_detail_api, name='weekly-day-detail'),
    path('weekly-days/<int:pk>/update/', weekly_day_update_api, name='weekly-day-update'),
    path('weekly-days/<int:pk>/delete/', weekly_day_delete_api, name='weekly-day-delete'),
    
    # Program Grid endpoints
    path('program-grid/generate-preview/', grid_generate_preview_api, name='grid-generate-preview'),
    path('program-grid/generate-create/', grid_generate_create_api, name='grid-generate-create'),
    path('program-grid/cycles/<int:cycle_pk>/matrix/', grid_matrix_api, name='grid-matrix'),
    path('program-grid/cycles/<int:cycle_pk>/clear/', grid_clear_api, name='grid-clear'),
    path('program-grid/cells/', program_grid_cell_list_api, name='program-grid-cell-list'),
    path('program-grid/cells/<int:pk>/', program_grid_cell_detail_api, name='program-grid-cell-detail'),
    path('program-grid/cells/<int:pk>/update/', program_grid_cell_update_api, name='program-grid-cell-update'),
    path('program-grid/cells/bulk-update/', program_grid_cell_bulk_update_api, name='program-grid-cell-bulk-update'),
    
    # Class Lesson Plan endpoints
    path('class-lesson-plan/', class_lesson_plan_list_api, name='class-lesson-plan-list'),
    path('class-lesson-plan/active-year/', active_academic_year_api, name='active-academic-year'),
    path('class-lesson-plan/create/', class_lesson_plan_create_api, name='class-lesson-plan-create'),
    path('class-lesson-plan/<int:plan_id>/', class_lesson_plan_detail_api, name='class-lesson-plan-detail'),
    path('class-lesson-plan/<int:plan_id>/update/', class_lesson_plan_update_api, name='class-lesson-plan-update'),
    path('class-lesson-plan/<int:plan_id>/delete/', class_lesson_plan_delete_api, name='class-lesson-plan-delete'),
    path('class-lesson-plan/summary/<int:classroom_id>/<int:term_id>/', class_lesson_plan_summary_api, name='class-lesson-plan-summary'),
    
    # Lesson Teacher Pool endpoints (Branş Öğretmen Havuzu)
    path('lesson-teacher-pool/', lesson_teacher_pool_list_api, name='lesson-teacher-pool-list'),
    path('lesson-teacher-pool/create/', lesson_teacher_pool_create_api, name='lesson-teacher-pool-create'),
    path('lesson-teacher-pool/<int:pool_id>/', lesson_teacher_pool_detail_api, name='lesson-teacher-pool-detail'),
    path('lesson-teacher-pool/<int:pool_id>/update/', lesson_teacher_pool_update_api, name='lesson-teacher-pool-update'),
    path('lesson-teacher-pool/<int:pool_id>/delete/', lesson_teacher_pool_delete_api, name='lesson-teacher-pool-delete'),
    
    # Class Lesson Teacher Assignment endpoints (Sınıf Ders Öğretmen Ataması)
    path('class-lesson-teachers/', class_lesson_teacher_assignment_list_api, name='class-lesson-teachers-list'),
    path('class-lesson-teachers/roles/', teacher_roles_api, name='teacher-roles'),
    path('class-lesson-teachers/create/', class_lesson_teacher_assignment_create_api, name='class-lesson-teachers-create'),
    path('class-lesson-teachers/<int:assignment_id>/', class_lesson_teacher_assignment_detail_api, name='class-lesson-teachers-detail'),
    path('class-lesson-teachers/<int:assignment_id>/update/', class_lesson_teacher_assignment_update_api, name='class-lesson-teachers-update'),
    path('class-lesson-teachers/<int:assignment_id>/delete/', class_lesson_teacher_assignment_delete_api, name='class-lesson-teachers-delete'),
    
    # Classroom Group endpoints (Sınıf Alt Grupları)
    path('classroom-groups/', classroom_group_list_api, name='classroom-group-list'),
    path('classroom-groups/create/', classroom_group_create_api, name='classroom-group-create'),
    path('classroom-groups/<int:group_id>/', classroom_group_detail_api, name='classroom-group-detail'),
    path('classroom-groups/<int:group_id>/update/', classroom_group_update_api, name='classroom-group-update'),
    path('classroom-groups/<int:group_id>/delete/', classroom_group_delete_api, name='classroom-group-delete'),
    
    # Student Class Placement endpoints (Öğrenci Sınıf Yerleşimi)
    path('student-class-placements/', student_class_placement_list_api, name='student-class-placement-list'),
    path('student-class-placements/placement-types/', placement_types_api, name='placement-types'),
    path('student-class-placements/bulk-assign/', bulk_assign_api, name='student-class-placement-bulk-assign'),
    path('student-class-placements/create/', student_class_placement_create_api, name='student-class-placement-create'),
    path('student-class-placements/<int:placement_id>/', student_class_placement_detail_api, name='student-class-placement-detail'),
    path('student-class-placements/<int:placement_id>/update/', student_class_placement_update_api, name='student-class-placement-update'),
    path('student-class-placements/<int:placement_id>/delete/', student_class_placement_delete_api, name='student-class-placement-delete'),
    
    # Scheduler endpoints (Ders Programı Motoru)
    path('scheduler/run-preview/', run_preview, name='scheduler-run-preview'),
    path('scheduler/run-execute/', run_execute, name='scheduler-run-execute'),
    path('scheduler/reset-grid/', reset_grid, name='scheduler-reset-grid'),
    path('scheduler/runs/', list_runs, name='scheduler-runs'),
    path('scheduler/runs/<int:run_id>/', get_run_detail, name='scheduler-run-detail'),
    
    # Schedule View endpoints (Program Görüntüleme - Farklı Perspektifler)
    path('schedule/class/', class_schedule_api, name='schedule-class'),
    path('schedule/teacher/', teacher_schedule_api, name='schedule-teacher'),
    path('schedule/student/', student_schedule_api, name='schedule-student'),
    path('schedule/room/', room_schedule_api, name='schedule-room'),
    path('schedule/daily-flow/', daily_flow_api, name='schedule-daily-flow'),
    
    # Schedule Version endpoints (Program Versiyonu Yönetimi)
    path('schedule/versions/', schedule_version_list_api, name='schedule-version-list'),
    path('schedule/versions/create/', schedule_version_create_api, name='schedule-version-create'),
    path('schedule/versions/<int:pk>/', schedule_version_detail_api, name='schedule-version-detail'),
    path('schedule/versions/<int:pk>/update/', schedule_version_update_api, name='schedule-version-update'),
    path('schedule/versions/<int:pk>/delete/', schedule_version_delete_api, name='schedule-version-delete'),
    path('schedule/versions/<int:pk>/activate/', schedule_version_activate_api, name='schedule-version-activate'),
    path('schedule/versions/<int:pk>/duplicate/', schedule_version_duplicate_api, name='schedule-version-duplicate'),
    path('schedule/versions/<int:pk>/lock/', schedule_version_lock_api, name='schedule-version-lock'),
    path('schedule/versions/<int:pk>/unlock/', schedule_version_unlock_api, name='schedule-version-unlock'),
]
