from django.urls import path
from .interfaces import views

app_name = 'sinif'

urlpatterns = [
    # API endpoints
    path('api/', views.sinif_list_api, name='list'),
    path('api/aktif-donem/', views.sinif_aktif_donem_api, name='aktif_donem'),
    path('api/export/', views.sinif_list_export_api, name='export'),
    path('api/roster-export/', views.sinif_roster_export_api, name='roster_export'),
    path('api/create/', views.sinif_create_api, name='create'),
    path('api/<int:sinif_id>/', views.sinif_detail_api, name='detail'),
    path('api/<int:sinif_id>/atanmamis-ogrenciler/', views.sinif_atanmamis_ogrenciler_api, name='atanmamis_ogrenciler'),
    path('api/<int:sinif_id>/ogrenci-ata/', views.sinif_ogrenci_ata_api, name='ogrenci_ata'),
    path('api/<int:sinif_id>/ogrenci-cikar/', views.sinif_ogrenci_cikar_api, name='ogrenci_cikar'),
    path('api/<int:sinif_id>/update/', views.sinif_update_api, name='update'),
    path('api/<int:sinif_id>/delete/', views.sinif_delete_api, name='delete'),
]
