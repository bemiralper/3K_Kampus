"""Kurum API URL Configuration"""
from django.urls import path
from apps.kurum import views
from apps.kurum.interfaces import demo_views

app_name = "kurum_api"

urlpatterns = [
    path("legacy/kurumlar/", views.legacy_kurum_tanimlar_api, name="legacy_kurum_tanimlar_api"),
    
    # Kurum JSON API
    path("kurum/", views.api_kurum_list_create, name="api_kurum_list_create"),
    path("kurum/<int:pk>/", views.api_kurum_detail, name="api_kurum_detail"),
    path("branding/<str:kod>/", views.api_kurum_branding_public, name="api_kurum_branding_public"),
    path("kurum/<int:pk>/branding/login-logo/", views.api_kurum_branding_login_logo, name="api_kurum_branding_login_logo"),
    path("kurum/<int:pk>/branding/app-logo/", views.api_kurum_branding_app_logo, name="api_kurum_branding_app_logo"),
    path("kurum/<int:pk>/branding/favicon/", views.api_kurum_branding_favicon, name="api_kurum_branding_favicon"),
    
    # Şube JSON API
    path("sube/", views.api_sube_list_create, name="api_sube_list_create"),
    path("sube/<int:pk>/", views.api_sube_detail, name="api_sube_detail"),
    path("sube/<int:pk>/branding/login-logo/", views.api_sube_branding_login_logo, name="api_sube_branding_login_logo"),
    path("sube/<int:pk>/branding/app-logo/", views.api_sube_branding_app_logo, name="api_sube_branding_app_logo"),
    path("sube/<int:pk>/branding/favicon/", views.api_sube_branding_favicon, name="api_sube_branding_favicon"),
    
    # Eğitim Yılı JSON API
    path("egitim-yili/", views.api_egitim_yili_list_create, name="api_egitim_yili_list_create"),
    path("egitim-yili/<int:pk>/", views.api_egitim_yili_detail, name="api_egitim_yili_detail"),
    
    # Delete info endpoints
    path("kurum/<int:pk>/delete-info/", views.api_kurum_delete_info, name="api_kurum_delete_info"),
    path("sube/<int:pk>/delete-info/", views.api_sube_delete_info, name="api_sube_delete_info"),
    path("egitim-yili/<int:pk>/delete-info/", views.api_egitim_yili_delete_info, name="api_egitim_yili_delete_info"),
    
    # Kurum şubeleri
    path("kurum/<int:kurum_id>/subeler/", views.api_kurum_subeler, name="api_kurum_subeler"),
    
    # Active Context API
    path("context/set/", views.api_set_active_context, name="api_set_context"),
    path("context/get/", views.api_get_active_context, name="api_get_context"),

    # Öğrenci kayıt tanımları
    path("kayit-turleri/", views.api_kayit_turleri_list_create, name="api_kayit_turleri_list_create"),
    path("kayit-turleri/seed/", views.api_kayit_turleri_seed, name="api_kayit_turleri_seed"),
    path("kayit-turleri/<int:pk>/", views.api_kayit_turleri_detail, name="api_kayit_turleri_detail"),

    # Demo veri yönetimi
    path("demo/status/", demo_views.demo_status_view, name="api_demo_status"),
    path("demo/seed/", demo_views.demo_seed_view, name="api_demo_seed"),
    path("demo/purge/", demo_views.demo_purge_view, name="api_demo_purge"),
    path("demo/reset/", demo_views.demo_reset_view, name="api_demo_reset"),
    path("demo/environment/", demo_views.demo_environment_view, name="api_demo_environment"),
]
