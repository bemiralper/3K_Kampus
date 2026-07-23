from django.urls import path

from apps.sistem_yonetimi.interfaces import views

urlpatterns = [
    path('dashboard/', views.dashboard_view, name='sistem-dashboard'),
    path('health/', views.health_view, name='sistem-health'),
    path('alerts/', views.alerts_view, name='sistem-alerts'),
    path('services/', views.services_view, name='sistem-services'),
    path('logs/sources/', views.log_sources_view, name='sistem-log-sources'),
    path('logs/', views.logs_view, name='sistem-logs'),
    path('logs/download/', views.logs_download_view, name='sistem-logs-download'),
    path('errors/', views.errors_view, name='sistem-errors'),
    path('errors/<int:error_id>/', views.error_detail_view, name='sistem-error-detail'),
    path('jobs/', views.jobs_view, name='sistem-jobs'),
    path('jobs/runs/<int:run_id>/', views.job_run_view, name='sistem-job-run'),
    path('audit/', views.audit_view, name='sistem-audit'),
    path('timeline/', views.timeline_view, name='sistem-timeline'),
    path('performance/', views.performance_view, name='sistem-performance'),
    path('storage/', views.storage_view, name='sistem-storage'),
    path('settings/', views.settings_view, name='sistem-settings'),
    path('maintenance/', views.maintenance_view, name='sistem-maintenance'),
]
