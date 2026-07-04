"""
Manuel Ödev Atama - URLs
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ManualAssignmentViewSet,
    AssignmentLessonViewSet,
    AssignmentTaskViewSet,
    AssignmentPackageViewSet,
)

router = DefaultRouter()
router.register(r'assignments', ManualAssignmentViewSet, basename='manual-assignment')
router.register(r'lessons', AssignmentLessonViewSet, basename='assignment-lesson')
router.register(r'tasks', AssignmentTaskViewSet, basename='assignment-task')
router.register(r'packages', AssignmentPackageViewSet, basename='assignment-package')

app_name = 'assignment_manual'

urlpatterns = [
    path('', include(router.urls)),
]
