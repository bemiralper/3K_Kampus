"""
Personel URL Configuration
"""
from django.urls import path
from apps.personel.interfaces import views

app_name = 'personel'

urlpatterns = [
    # Personel Tanımları (Yıldan Bağımsız)
    path('', views.personel_listesi, name='personel_listesi'),
    
    # API Endpoints
    path('api/list/', views.personel_list_api, name='personel_list_api'),
    path('api/stats/', views.personel_stats_api, name='personel_stats_api'),
    path('api/create/', views.personel_create_api, name='personel_create_api'),
    path('api/<int:pk>/', views.personel_detail_api, name='personel_detail_api'),
    path('api/<int:pk>/full/', views.personel_full_detail_api, name='personel_full_detail_api'),
    path('api/<int:pk>/update/', views.personel_update_api, name='personel_update_api'),
    path('api/<int:pk>/delete/', views.personel_delete_api, name='personel_delete_api'),
    path('api/<int:pk>/toggle-active/', views.personel_toggle_active_api, name='personel_toggle_active_api'),
    path('api/<int:pk>/create-user-account/', views.personel_create_user_account_api, name='personel_create_user_account_api'),
    path('api/<int:pk>/create-user/', views.personel_create_user_api, name='personel_create_user_api'),
    path('api/<int:pk>/sync-user-role/', views.personel_sync_user_role_api, name='personel_sync_user_role_api'),
    path('api/<int:pk>/reset-password/', views.personel_reset_password_api, name='personel_reset_password_api'),
    path('api/<int:pk>/log-activity/', views.personel_log_activity_api, name='personel_log_activity_api'),
    path('api/<int:pk>/upload-foto/', views.personel_upload_foto_api, name='personel_upload_foto_api'),
    path('api/<int:pk>/delete-foto/', views.personel_delete_foto_api, name='personel_delete_foto_api'),
    
    # Rol API
    path('api/roller/', views.personel_rol_list_api, name='personel_rol_list_api'),
    
    # Görevlendirme API (Yıl Bazlı)
    path('api/gorevlendirmeler/', views.gorevlendirme_list_api, name='gorevlendirme_list_api'),
    path('api/gorevlendirme/create/', views.gorevlendirme_create_api, name='gorevlendirme_create_api'),
    path('api/gorevlendirme/<int:pk>/', views.gorevlendirme_detail_api, name='gorevlendirme_detail_api'),
    path('api/gorevlendirme/helper-data/', views.gorevlendirme_helper_data_api, name='gorevlendirme_helper_data_api'),
    
    # Koç API
    path('api/koclar/', views.koc_listesi_api, name='koc_listesi_api'),

    # Kurum / şube erişimi & finans yetkili adayları
    path('api/my-kurumlar/', views.my_kurumlar_api, name='my_kurumlar_api'),
    path('api/my-subeler/', views.my_subeler_api, name='my_subeler_api'),
    path('api/finans-yetkililer/', views.finans_yetkili_personel_api, name='finans_yetkili_personel_api'),
]
