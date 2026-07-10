"""Okul API URL Configuration"""
from django.urls import path

from apps.okul.interfaces import json_api

app_name = 'okul_api'

urlpatterns = [
    path('', json_api.okul_list_create_api, name='okul_list_create_api'),
    path('autocomplete/', json_api.okul_autocomplete_api, name='okul_autocomplete_api'),
    path('<int:okul_id>/', json_api.okul_detail_api, name='okul_detail_api'),
    path('<int:okul_id>/delete-info/', json_api.okul_delete_info_api, name='okul_delete_info_api'),
]
