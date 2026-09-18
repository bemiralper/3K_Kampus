from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import StudyPlanSourceViewSet, StudyProgramViewSet, StudyTemplateViewSet

router = DefaultRouter()
router.register(r'templates', StudyTemplateViewSet, basename='study-plan-template')
router.register(r'programs', StudyProgramViewSet, basename='study-plan-program')
router.register(r'sources', StudyPlanSourceViewSet, basename='study-plan-source')

app_name = 'study_plans'

urlpatterns = [
    path('', include(router.urls)),
]
