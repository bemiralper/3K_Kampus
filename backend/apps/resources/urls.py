"""
Resources URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BookTypeViewSet,
    ResourceBookViewSet,
    ResourceUnitViewSet,
    ResourceTopicViewSet,
    ResourceContentViewSet
)

router = DefaultRouter()
router.register(r'book-types', BookTypeViewSet, basename='book-type')
router.register(r'books', ResourceBookViewSet, basename='resource-book')
router.register(r'units', ResourceUnitViewSet, basename='resource-unit')
router.register(r'topics', ResourceTopicViewSet, basename='resource-topic')
router.register(r'contents', ResourceContentViewSet, basename='resource-content')

urlpatterns = [
    path('', include(router.urls)),
]
