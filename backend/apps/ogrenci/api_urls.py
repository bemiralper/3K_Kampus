"""Ogrenci API URL Configuration"""
from django.urls import path
from apps.ogrenci.interfaces import views

app_name = "ogrenci_api"

urlpatterns = [
    path("list/", views.ogrenci_list_api, name="ogrenci_list_api"),
    path("export/", views.ogrenci_list_export_api, name="ogrenci_list_export_api"),
    path("filter-options/", views.ogrenci_filter_options_api, name="ogrenci_filter_options_api"),
    path("<int:pk>/", views.ogrenci_api, name="ogrenci_api"),
    path("<int:pk>/akademik/", views.ogrenci_akademik_api, name="ogrenci_akademik_api"),
    path("<int:pk>/delete/", views.ogrenci_delete_api, name="ogrenci_delete_api"),
    path("<int:pk>/finans-ozet/", views.ogrenci_finans_ozet_api, name="ogrenci_finans_ozet_api"),
    path("search/", views.ogrenci_search_api, name="ogrenci_search_api"),
    # Veli CRUD
    path("<int:pk>/veliler/", views.ogrenci_veliler_api, name="ogrenci_veliler_api"),
    path("<int:pk>/veliler/<int:veli_id>/", views.ogrenci_veli_detail_api, name="ogrenci_veli_detail_api"),
    # Adres CRUD
    path("<int:pk>/adresler/", views.ogrenci_adresler_api, name="ogrenci_adresler_api"),
    path("<int:pk>/adresler/<int:adres_id>/", views.ogrenci_adres_detail_api, name="ogrenci_adres_detail_api"),
    # Profil Fotoğrafı
    path("<int:pk>/profil-foto/", views.ogrenci_profil_foto_api, name="ogrenci_profil_foto_api"),
    # Seçenekler
    path("kayit-turleri/", views.kayit_turleri_api, name="kayit_turleri_api"),
    path("cinsiyet-secenekleri/", views.cinsiyet_secenekleri_api, name="cinsiyet_secenekleri_api"),
]
