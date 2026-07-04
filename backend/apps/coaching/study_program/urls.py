"""
Çalışma Programı - URLs
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WeeklyProgramViewSet,
    ProgramBlockViewSet,
    ProgramDayViewSet,
    DailyFeedbackViewSet,
    BadgeViewSet,
)

router = DefaultRouter()
router.register(r'programs', WeeklyProgramViewSet, basename='weekly-program')
router.register(r'days', ProgramDayViewSet, basename='program-day')
router.register(r'blocks', ProgramBlockViewSet, basename='program-block')
router.register(r'feedbacks', DailyFeedbackViewSet, basename='daily-feedback')
router.register(r'badges', BadgeViewSet, basename='badge')

app_name = 'study_program'

urlpatterns = [
    path('', include(router.urls)),
]
