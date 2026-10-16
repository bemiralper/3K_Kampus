from django.urls import path

from . import file_views, views

urlpatterns = [
    path('dosyalar/', file_views.api_gorev_dosya_collection, name='gorev_dosya_collection'),
    path('dosyalar/disardan/', file_views.api_gorev_dosya_remote, name='gorev_dosya_remote'),
    path('dosyalar/<uuid:pk>/', file_views.api_gorev_dosya_detail, name='gorev_dosya_detail'),
    path('gorevler/', views.api_gorev_list_create, name='gorev_list_create'),
    path('gorevler/toplu-sil/', views.api_gorev_bulk_delete, name='gorev_bulk_delete'),
    path('gorevler/<uuid:pk>/', views.api_gorev_detail, name='gorev_detail'),
    path('gorevler/<uuid:pk>/pdf/', views.api_gorev_pdf, name='gorev_pdf'),
    path('atamalar/', views.api_atama_list, name='atama_list'),
    path('atamalar/filtre-secenekleri/', views.api_atama_filter_options, name='atama_filter_options'),
    path('atamalar/<uuid:pk>/', views.api_atama_detail, name='atama_detail'),
    path('tipler/', views.api_gorev_tipler, name='gorev_tipler'),
    path('tipler/seed/', views.api_gorev_tipler_seed, name='gorev_tipler_seed'),
    path('dashboard-ozet/', views.api_dashboard_ozet, name='gorev_dashboard_ozet'),
    path('analitik/', views.api_analitik, name='gorev_analitik'),
    path('takvim/', views.api_takvim, name='gorev_takvim'),
    path('tekrar-sablonlari/', views.api_tekrar_sablonlari, name='gorev_tekrar_sablonlari'),
    path('tekrar-sablonlari/<uuid:pk>/', views.api_tekrar_sablon_detail, name='gorev_tekrar_sablon_detail'),
]
