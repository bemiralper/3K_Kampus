from django.urls import path

from apps.dashboard.interfaces.views import AdminDashboardView

urlpatterns = [
    path('', AdminDashboardView.as_view(), name='admin-dashboard'),
]
