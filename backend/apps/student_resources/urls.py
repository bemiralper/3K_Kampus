"""
Öğrenci Kaynak Havuzu - URLs
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudentResourceAssignmentViewSet, ResourcePurchaseListViewSet

router = DefaultRouter()
router.register('assignments', StudentResourceAssignmentViewSet, basename='student-resource-assignment')
router.register('purchase-lists', ResourcePurchaseListViewSet, basename='purchase-list')

urlpatterns = [
    path('', include(router.urls)),
]
