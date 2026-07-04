"""
Predictive API URLs
"""
from django.urls import path

from .views import (
    PredictiveDashboardView,
    StudentScoresView,
    StudentWeeklyPlanView,
    CoachMatchView,
    HighRiskView,
    RunPredictiveCycleView,
)

urlpatterns = [
    path('dashboard/', PredictiveDashboardView.as_view(), name='predictive-dashboard'),
    path('student/<int:student_id>/scores/', StudentScoresView.as_view(), name='student-scores'),
    path('student/<int:student_id>/weekly-plan/', StudentWeeklyPlanView.as_view(), name='student-weekly-plan'),
    path('coach-match/<int:student_id>/', CoachMatchView.as_view(), name='coach-match'),
    path('high-risk/', HighRiskView.as_view(), name='high-risk'),
    path('run-cycle/', RunPredictiveCycleView.as_view(), name='run-cycle'),
]
