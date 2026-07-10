from django.urls import path

from apps.yedekleme.interfaces import views

urlpatterns = [
    path('dashboard/', views.dashboard_view, name='yedekleme-dashboard'),
    path('artifacts/', views.artifact_list_view, name='yedekleme-artifacts'),
    path('artifacts/create/', views.artifact_create_view, name='yedekleme-artifact-create'),
    path('artifacts/upload/', views.artifact_upload_view, name='yedekleme-artifact-upload'),
    path('artifacts/<int:artifact_id>/download/', views.artifact_download_view, name='yedekleme-artifact-download'),
    path('artifacts/<int:artifact_id>/validate/', views.artifact_validate_view, name='yedekleme-artifact-validate'),
    path('artifacts/<int:artifact_id>/restore/', views.artifact_restore_view, name='yedekleme-artifact-restore'),
    path('artifacts/<int:artifact_id>/delete/', views.artifact_delete_view, name='yedekleme-artifact-delete'),
    path('schedule/', views.schedule_view, name='yedekleme-schedule'),
    path('logs/', views.operation_log_view, name='yedekleme-logs'),
]
