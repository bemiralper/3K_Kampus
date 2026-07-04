"""
Kurum URLs
"""
from django.urls import path
from apps.kurum import views

app_name = 'kurum'

urlpatterns = [
    # Main TAB page
    path('kurumlar/', views.kurum_tanimlar, name='kurum_tanimlar'),
    
    # Kurum CRUD
    path('kurum/create/', views.kurum_create, name='kurum_create'),
    path('kurum/<int:kurum_id>/update/', views.kurum_update, name='kurum_update'),
    path('kurum/<int:kurum_id>/delete/', views.kurum_delete, name='kurum_delete'),
    
    # Sube CRUD
    path('sube/create/', views.sube_create, name='sube_create'),
    path('sube/<int:sube_id>/update/', views.sube_update, name='sube_update'),
    path('sube/<int:sube_id>/delete/', views.sube_delete, name='sube_delete'),
    
    # EgitimYili CRUD
    path('egitim-yili/create/', views.egitim_yili_create, name='egitim_yili_create'),
    path('egitim-yili/<int:egitim_yili_id>/update/', views.egitim_yili_update, name='egitim_yili_update'),
    path('egitim-yili/<int:egitim_yili_id>/delete/', views.egitim_yili_delete, name='egitim_yili_delete'),
    
    # API endpoints
    path('api/kurum/<int:pk>/', views.api_kurum_detail, name='api_kurum_detail'),
    path('api/sube/<int:pk>/', views.api_sube_detail, name='api_sube_detail'),
    path('api/egitim-yili/<int:pk>/', views.api_egitim_yili_detail, name='api_egitim_yili_detail'),
    path('api/kurum/<int:kurum_id>/subeler/', views.api_kurum_subeler, name='api_kurum_subeler'),
]
