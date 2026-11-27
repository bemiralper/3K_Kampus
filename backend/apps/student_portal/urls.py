from django.urls import path

from . import views

app_name = 'student_portal'

urlpatterns = [
    path('bootstrap/', views.student_bootstrap_api, name='bootstrap'),
    path('me/', views.student_me_api, name='me'),
    path('preferences/', views.student_preferences_api, name='preferences'),
    path('password/', views.student_first_password_api, name='password'),
    path('home/', views.student_home_api, name='home'),
    path('search/', views.student_command_palette_api, name='search'),
    path('schedule/', views.student_schedule_api, name='schedule'),
    path('courses/', views.student_courses_api, name='courses'),
    path('notes/<int:note_id>/preview/', views.student_note_preview_api, name='note_preview'),
    path('notes/<int:note_id>/preview/pages/<int:page_no>/', views.student_note_preview_page_api, name='note_preview_page'),
    path('notes/<int:note_id>/open/', views.student_note_open_api, name='note_open'),
    path('campus/', views.student_campus_api, name='campus'),
    path('study-program/', views.student_study_program_api, name='study_program'),
    path('study-program/blocks/<int:block_id>/complete/', views.student_study_block_complete_api, name='study_block_complete'),
    path('study-program/days/<int:day_id>/feedback/', views.student_study_day_feedback_api, name='study_day_feedback'),
    path('assignments/', views.student_assignments_api, name='assignments'),
    path('assignments/<int:assignment_id>/', views.student_assignment_detail_api, name='assignment_detail'),
    path('assignments/<int:assignment_id>/note/', views.student_assignment_note_api, name='assignment_note'),
    path('assignments/<int:assignment_id>/pdf/', views.student_assignment_pdf_api, name='assignment_pdf'),
    path('assignments/tasks/<int:task_id>/', views.student_assignment_task_api, name='assignment_task_update'),
    path('achievements/', views.student_achievements_api, name='achievements'),
    path('achievements/preferences/', views.student_achievements_preferences_api, name='achievements_preferences'),
    path('coach-achievements/<int:student_id>/', views.coach_student_achievements_api, name='coach_achievements'),
    path('exams/', views.student_exams_api, name='exams'),
    path('exams/<int:exam_id>/', views.student_exam_detail_api, name='exam_detail'),
    path('exams/<int:exam_id>/karne-pdf/', views.student_exam_karne_pdf_api, name='exam_karne_pdf'),
    path('messages/', views.student_messages_api, name='messages'),
    path('announcements/', views.student_announcements_api, name='announcements'),
    path('announcements/read/', views.student_announcements_read_api, name='announcements_read'),
    path('coach-threads/<int:student_id>/', views.coach_portal_thread_api, name='coach_portal_thread'),
]
