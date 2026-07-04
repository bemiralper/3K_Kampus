"""
Coaching Intelligence API URLs
"""
from django.urls import path
from .views import (
    IntelligenceDashboardView,
    CoachMetricsView,
    StudentTimelineView,
    RiskListView,
    RunIntelligenceCycleView,
)

urlpatterns = [
    path('dashboard/', IntelligenceDashboardView.as_view(), name='intelligence-dashboard'),
    path('coach/<int:coach_id>/metrics/', CoachMetricsView.as_view(), name='coach-metrics'),
    path('student/<int:student_id>/timeline/', StudentTimelineView.as_view(), name='student-timeline'),
    path('risk-list/', RiskListView.as_view(), name='risk-list'),
    path('run-cycle/', RunIntelligenceCycleView.as_view(), name='run-cycle'),
]
