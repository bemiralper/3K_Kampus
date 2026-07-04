"""
Egitim Tanimlari URLs
"""
from django.urls import path
from apps.egitim_tanimlari.interfaces import views

app_name = 'egitim_tanimlari'

urlpatterns = [
    # Main page
    path('', views.tanimlar, name='tanimlar'),
    
    # Sinif Seviyesi
    path('sinif-seviyesi/create/', views.sinif_seviyesi_create, name='sinif_seviyesi_create'),
    path('sinif-seviyesi/<int:seviye_id>/edit/', views.sinif_seviyesi_edit, name='sinif_seviyesi_edit'),
    path('sinif-seviyesi/<int:seviye_id>/delete/', views.sinif_seviyesi_delete, name='sinif_seviyesi_delete'),
    
    # Alan
    path('alan/create/', views.alan_create, name='alan_create'),
    path('alan/<int:alan_id>/edit/', views.alan_edit, name='alan_edit'),
    path('alan/<int:alan_id>/delete/', views.alan_delete, name='alan_delete'),
    
    # Ders
    path('ders/create/', views.ders_create, name='ders_create'),
    path('ders/<int:ders_id>/edit/', views.ders_edit, name='ders_edit'),
    path('ders/<int:ders_id>/delete/', views.ders_delete, name='ders_delete'),
    
    # Brans
    path('brans/create/', views.brans_create, name='brans_create'),
    path('brans/<int:brans_id>/edit/', views.brans_edit, name='brans_edit'),
    path('brans/<int:brans_id>/delete/', views.brans_delete, name='brans_delete'),
    
    # API Endpoints (for AJAX)
    path('api/sinif-seviyeleri/', views.sinif_seviyeleri_list_api, name='sinif_seviyeleri_list_api'),
    path('api/dersler/', views.dersler_list_api, name='dersler_list_api'),
    path('api/sinif-seviyesi/<int:seviye_id>/', views.sinif_seviyesi_api, name='sinif_seviyesi_api'),
    path('api/alan/<int:alan_id>/', views.alan_api, name='alan_api'),
    path('api/ders/<int:ders_id>/', views.ders_api, name='ders_api'),
    path('api/brans/<int:brans_id>/', views.brans_api, name='brans_api'),
]
