"""Egitim Paketleri API URL Configuration"""
from django.urls import path
from apps.egitim_paketleri.interfaces import views, api_views

app_name = "egitim_paketleri_api"

urlpatterns = [
    path("legacy/paketler/", views.legacy_paketler_api, name="legacy_paketler_api"),
    path("grup-dersi/<int:pk>/", views.grup_dersi_api, name="grup_dersi_api"),
    path("ozel-ders/<int:pk>/", views.ozel_ders_api, name="ozel_ders_api"),
    path("deneme/<int:pk>/", views.deneme_api, name="deneme_api"),
    path("dersler/", views.dersler_by_seviye_alan, name="dersler_by_seviye_alan"),
    path("alanlar/", views.alanlar_by_seviyeler, name="alanlar_by_seviyeler"),
    
    # REST API Endpoints for CRUD
    path("grup-dersleri/", api_views.GrupDersiListCreateView.as_view(), name="grup_dersleri_list_create"),
    path("grup-dersleri/<int:pk>/", api_views.GrupDersiDetailView.as_view(), name="grup_dersleri_detail"),
    path("ozel-dersler/", api_views.OzelDersListCreateView.as_view(), name="ozel_dersler_list_create"),
    path("ozel-dersler/<int:pk>/", api_views.OzelDersDetailView.as_view(), name="ozel_dersler_detail"),
    path("denemeler/", api_views.DenemeListCreateView.as_view(), name="denemeler_list_create"),
    path("denemeler/<int:pk>/", api_views.DenemeDetailView.as_view(), name="denemeler_detail"),
    path("ek-hizmetler/", api_views.EkHizmetListCreateView.as_view(), name="ek_hizmetler_list_create"),
    path("ek-hizmetler/<int:pk>/", api_views.EkHizmetDetailView.as_view(), name="ek_hizmetler_detail"),
    path("premium-paketler/", api_views.PremiumPaketListCreateView.as_view(), name="premium_paketler_list_create"),
    path("premium-paketler/<int:pk>/", api_views.PremiumPaketDetailView.as_view(), name="premium_paketler_detail"),
    path("yayin-paketleri/", api_views.YayinPaketiListCreateView.as_view(), name="yayin_paketleri_list_create"),
    path("yayin-paketleri/<int:pk>/", api_views.YayinPaketiDetailView.as_view(), name="yayin_paketleri_detail"),
    path("referans-veriler/", api_views.ReferansVerilerView.as_view(), name="referans_veriler"),
    
    # Ek Hizmet Satış Endpoints
    path("ek-hizmet-satis/", api_views.EkHizmetSatisView.as_view(), name="ek_hizmet_satis"),
    path("ek-hizmet-satis/<int:pk>/iptal/", api_views.EkHizmetSatisIptalView.as_view(), name="ek_hizmet_satis_iptal"),
    path("ek-hizmet-satis/ogrenci/<int:ogrenci_id>/", api_views.OgrenciEkHizmetListView.as_view(), name="ogrenci_ek_hizmetler"),
    path("ek-hizmet-satis/ogrenci/<int:ogrenci_id>/uygun/", api_views.UygunEkHizmetlerView.as_view(), name="uygun_ek_hizmetler"),
    path("ek-hizmet-satis/ogrenci/<int:ogrenci_id>/uygun-deneme-paketleri/", api_views.UygunDenemePaketleriView.as_view(), name="uygun_deneme_paketleri"),
    path("ek-hizmet-satis/ogrenci-ara/", api_views.OgrenciAraView.as_view(), name="ogrenci_ara"),
]
