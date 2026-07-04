"""
Ogrenci URL Configuration
"""
from django.urls import path
from apps.ogrenci.interfaces import views

app_name = 'ogrenci'

urlpatterns = [
    # Ana sayfa - Öğrenci listesi
    path('', views.ogrenci_listesi, name='ogrenci_listesi'),
    
    # Detay ve Düzenleme
    path('<int:pk>/', views.ogrenci_detay, name='ogrenci_detay'),
    path('<int:pk>/duzenle/', views.ogrenci_duzenle, name='ogrenci_duzenle'),
    path('<int:pk>/sil/', views.ogrenci_delete, name='ogrenci_delete'),
    
    # API - Artık api_urls.py'de tanımlı
    path('api/<int:pk>/', views.ogrenci_api, name='ogrenci_api'),
    path('api/search/', views.ogrenci_search_api, name='ogrenci_search_api'),
]
