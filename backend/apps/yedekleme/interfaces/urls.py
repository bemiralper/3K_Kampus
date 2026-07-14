from django.urls import path

from apps.yedekleme.interfaces import views

urlpatterns = [
    path('dashboard/', views.dashboard_view, name='yedekleme-dashboard'),
    path('resources/', views.resources_view, name='yedekleme-resources'),
    path('resources/sync/', views.resources_sync_view, name='yedekleme-resources-sync'),
    path('resources/<int:resource_id>/', views.resource_detail_view, name='yedekleme-resource-detail'),
    path('resources/<int:resource_id>/deactivate/', views.resource_deactivate_view, name='yedekleme-resource-deactivate'),
    path('backups/', views.backups_view, name='yedekleme-backups'),
    path('backups/upload/', views.backup_upload_view, name='yedekleme-backup-upload'),
    path('backups/<int:artifact_id>/', views.backup_detail_view, name='yedekleme-backup-detail'),
    path('backups/<int:artifact_id>/preview/', views.backup_preview_view, name='yedekleme-backup-preview'),
    path('backups/<int:artifact_id>/download/', views.backup_download_view, name='yedekleme-backup-download'),
    path('backups/<int:artifact_id>/verify/', views.backup_verify_view, name='yedekleme-backup-verify'),
    path('backups/<int:artifact_id>/analyze/', views.backup_analyze_view, name='yedekleme-backup-analyze'),
    path('backups/<int:artifact_id>/dry-run/', views.backup_dry_run_view, name='yedekleme-backup-dry-run'),
    path('backups/<int:artifact_id>/restore/', views.backup_restore_view, name='yedekleme-backup-restore'),
    path('backups/<int:artifact_id>/delete/', views.backup_delete_view, name='yedekleme-backup-delete'),
    path('schedule/', views.schedule_view, name='yedekleme-schedule'),
    path('schedule/run/', views.schedule_run_now_view, name='yedekleme-schedule-run'),
    path('settings/', views.settings_view, name='yedekleme-settings'),
    path('logs/', views.logs_view, name='yedekleme-logs'),
    path('jobs/cleanup-stale/', views.jobs_cleanup_stale_view, name='yedekleme-jobs-cleanup-stale'),
    path('jobs/<int:job_id>/cancel/', views.job_cancel_view, name='yedekleme-job-cancel'),
    path('jobs/<int:job_id>/', views.job_detail_view, name='yedekleme-job'),
    path('purge/', views.purge_view, name='yedekleme-purge'),
]
