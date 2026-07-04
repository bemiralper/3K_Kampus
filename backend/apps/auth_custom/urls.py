"""
Authentication URLs
"""
from django.urls import path
from .interfaces.views import login_api, logout_api, me_api, change_password_api

app_name = 'auth_custom'

urlpatterns = [
    path('api/login/', login_api, name='login'),
    path('api/logout/', logout_api, name='logout'),
    path('api/me/', me_api, name='me'),
    path('api/change-password/', change_password_api, name='change-password'),
]
