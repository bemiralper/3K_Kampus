from django.urls import path

from apps.kimlik.interfaces.views import KimlikConflictReportView, KimlikResolveView

urlpatterns = [
    path('resolve/', KimlikResolveView.as_view(), name='kimlik-resolve'),
    path('conflicts/', KimlikConflictReportView.as_view(), name='kimlik-conflicts'),
]
