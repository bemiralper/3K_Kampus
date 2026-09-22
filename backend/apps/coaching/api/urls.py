"""
Coaching API URLs
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.coaching.api.views import CoachViewSet, AssignmentViewSet
from apps.coaching.api.coach_student_views import (
    CoachBirthdayListView,
    CoachStudentExportView,
    CoachStudentListView,
    CoachStudentProfileView,
    CoachStudentRiskReportView,
)
from apps.coaching.api.attendance_followup_views import (
    AttendanceFollowupAnalysisView,
    AttendanceFollowupStudentView,
    AttendanceFollowupView,
    AttendanceThresholdView,
)
from apps.coaching.api.risk_report_views import (
    CoachRiskReportDetailView,
    CoachRiskReportListView,
)
from apps.coaching.api.gorusme_views import (
    GorusmeListCreateView,
    GorusmeDetailView,
    GorusmeDurumView,
    GorusmeAksiyonListCreateView,
    GorusmeAksiyonDetailView,
    GorusmeHatirlatmaListCreateView,
    GorusmeHatirlatmaDeleteView,
    GorusmeOzetView,
    GorusmeExportView,
    GorusmeKullaniciBilgiView,
)


# Router
router = DefaultRouter()
router.register(r'coaches', CoachViewSet, basename='coach')
router.register(r'assignments', AssignmentViewSet, basename='assignment')

urlpatterns = [
    path('', include(router.urls)),
    path('birthdays/', CoachBirthdayListView.as_view(), name='coach-birthdays'),
    path('students/', CoachStudentListView.as_view(), name='coach-student-list'),
    path('students/export/', CoachStudentExportView.as_view(), name='coach-student-export'),
    path('students/<int:student_id>/profile/', CoachStudentProfileView.as_view(), name='coach-student-profile'),
    path('students/<int:student_id>/risk-report/', CoachStudentRiskReportView.as_view(), name='coach-student-risk-report'),
    path('risk-reports/', CoachRiskReportListView.as_view(), name='coach-risk-report-list'),
    path('risk-reports/<int:event_id>/', CoachRiskReportDetailView.as_view(), name='coach-risk-report-detail'),
    path('attendance-followup/', AttendanceFollowupView.as_view(), name='coach-attendance-followup'),
    path('attendance-followup/analysis/', AttendanceFollowupAnalysisView.as_view(), name='coach-attendance-followup-analysis'),
    path(
        'attendance-followup/students/<int:student_id>/',
        AttendanceFollowupStudentView.as_view(),
        name='coach-attendance-followup-student',
    ),
    path('attendance-thresholds/', AttendanceThresholdView.as_view(), name='coach-attendance-thresholds'),
    path('intelligence/', include('apps.coaching.intelligence.api.urls')),
    path('predictive/', include('apps.coaching.predictive.api.urls')),

    # ─── Görüşme Yönetimi ────────────────────────────────────
    path('gorusmeler/', GorusmeListCreateView.as_view(), name='gorusme-list-create'),
    path('gorusmeler/ozet/', GorusmeOzetView.as_view(), name='gorusme-ozet'),
    path('gorusmeler/export/', GorusmeExportView.as_view(), name='gorusme-export'),
    path('gorusmeler/kullanici-bilgi/', GorusmeKullaniciBilgiView.as_view(), name='gorusme-kullanici-bilgi'),
    path('gorusmeler/<int:pk>/', GorusmeDetailView.as_view(), name='gorusme-detail'),
    path('gorusmeler/<int:pk>/durum/', GorusmeDurumView.as_view(), name='gorusme-durum'),
    path('gorusmeler/<int:gorusme_id>/aksiyonlar/', GorusmeAksiyonListCreateView.as_view(), name='gorusme-aksiyon-list-create'),
    path('aksiyonlar/<int:pk>/', GorusmeAksiyonDetailView.as_view(), name='gorusme-aksiyon-detail'),
    path('gorusmeler/<int:gorusme_id>/hatirlatmalar/', GorusmeHatirlatmaListCreateView.as_view(), name='gorusme-hatirlatma-create'),
    path('hatirlatmalar/<int:pk>/', GorusmeHatirlatmaDeleteView.as_view(), name='gorusme-hatirlatma-delete'),
]
