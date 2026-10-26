from django.urls import path

from .views import change_password_api, context_api, logout_api, me_api, refresh_api, token_api

app_name = 'mobile_identity'

urlpatterns = [
    path('auth/token/', token_api, name='token'),
    path('auth/token/refresh/', refresh_api, name='token-refresh'),
    path('auth/logout/', logout_api, name='logout'),
    path('auth/change-password/', change_password_api, name='change-password'),
    path('context/', context_api, name='context'),
    path('me/', me_api, name='me'),
]
