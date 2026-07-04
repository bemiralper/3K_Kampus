"""
Egitim Paketleri URL Configuration
"""
from django.urls import path
from apps.egitim_paketleri.interfaces import views

app_name = 'egitim_paketleri'

urlpatterns = [
    # Ana sayfa
    path('', views.paketler, name='paketler'),
    
    # Grup Dersi CRUD
    path('grup-dersi/create/', views.grup_dersi_create, name='grup_dersi_create'),
    path('grup-dersi/<int:pk>/edit/', views.grup_dersi_edit, name='grup_dersi_edit'),
    path('grup-dersi/<int:pk>/delete/', views.grup_dersi_delete, name='grup_dersi_delete'),
    path('api/grup-dersi/<int:pk>/', views.grup_dersi_api, name='grup_dersi_api'),
    
    # Özel Ders CRUD
    path('ozel-ders/create/', views.ozel_ders_create, name='ozel_ders_create'),
    path('ozel-ders/<int:pk>/edit/', views.ozel_ders_edit, name='ozel_ders_edit'),
    path('ozel-ders/<int:pk>/delete/', views.ozel_ders_delete, name='ozel_ders_delete'),
    path('api/ozel-ders/<int:pk>/', views.ozel_ders_api, name='ozel_ders_api'),
    
    # Deneme CRUD
    path('deneme/create/', views.deneme_create, name='deneme_create'),
    path('deneme/<int:pk>/edit/', views.deneme_edit, name='deneme_edit'),
    path('deneme/<int:pk>/delete/', views.deneme_delete, name='deneme_delete'),
    path('api/deneme/<int:pk>/', views.deneme_api, name='deneme_api'),
    
    # API: Dersler by Seviye/Alan
    path('api/dersler/', views.dersler_by_seviye_alan, name='dersler_by_seviye_alan'),
    
    # API: Alanlar by Seviyeler (ortak alanlar)
    path('api/alanlar/', views.alanlar_by_seviyeler, name='alanlar_by_seviyeler'),
]
