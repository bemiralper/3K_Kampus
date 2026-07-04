"""Egitim Tanimlari API URL Configuration"""
from django.urls import path
from apps.egitim_tanimlari.interfaces import json_api

app_name = "egitim_tanimlari_api"

urlpatterns = [
    path("legacy/tanimlar/", json_api.legacy_tanimlar_api, name="legacy_tanimlar_api"),
    path("sinif-seviyeleri/", json_api.sinif_seviyeleri_list_api, name="sinif_seviyeleri_list_api"),
    path("sinif-seviyesi/", json_api.sinif_seviyesi_list_create_api, name="sinif_seviyesi_list_create_api"),
    path("sinif-seviyesi/<int:seviye_id>/", json_api.sinif_seviyesi_detail_api, name="sinif_seviyesi_detail_api"),
    path("sinif-seviyesi/<int:seviye_id>/delete-info/", json_api.sinif_seviyesi_delete_info_api, name="sinif_seviyesi_delete_info_api"),
    path("alan/", json_api.alan_list_create_api, name="alan_list_create_api"),
    path("alan/<int:alan_id>/", json_api.alan_detail_api, name="alan_detail_api"),
    path("alan/<int:alan_id>/delete-info/", json_api.alan_delete_info_api, name="alan_delete_info_api"),
    path("ders/", json_api.ders_list_create_api, name="ders_list_create_api"),
    path("ders/<int:ders_id>/", json_api.ders_detail_api, name="ders_detail_api"),
    path("ders/<int:ders_id>/delete-info/", json_api.ders_delete_info_api, name="ders_delete_info_api"),
    path("brans/", json_api.brans_list_create_api, name="brans_list_create_api"),
    path("brans/<int:brans_id>/", json_api.brans_detail_api, name="brans_detail_api"),
    path("brans/<int:brans_id>/delete-info/", json_api.brans_delete_info_api, name="brans_delete_info_api"),
]
