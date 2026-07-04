"""
Rol Yönetimi URL Configuration
"""
from django.urls import path
from . import views

app_name = 'roller'

urlpatterns = [
    # Roller API
    path('api/roles/', views.role_list_api, name='role-list'),
    path('api/roles/create/', views.role_create_api, name='role-create'),
    path('api/roles/<int:pk>/', views.role_detail_api, name='role-detail'),
    path('api/roles/<int:pk>/restore/', views.role_restore_api, name='role-restore'),
    path('api/roles/stats/', views.role_stats_api, name='role-stats'),
    
    # Yetkiler API
    path('api/permissions/', views.permission_list_api, name='permission-list'),
]
