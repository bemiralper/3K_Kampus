from django.urls import path
from .interfaces import views

app_name = 'sinif'

urlpatterns = [
    # API endpoints
    path('api/', views.sinif_list_api, name='list'),
    path('api/create/', views.sinif_create_api, name='create'),
    path('api/<int:sinif_id>/', views.sinif_detail_api, name='detail'),
    path('api/<int:sinif_id>/update/', views.sinif_update_api, name='update'),
    path('api/<int:sinif_id>/delete/', views.sinif_delete_api, name='delete'),
]
