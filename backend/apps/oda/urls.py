from django.urls import path
from .interfaces import views

app_name = 'oda'

urlpatterns = [
    # API endpoints
    path('api/', views.oda_list_api, name='list'),
    path('api/create/', views.oda_create_api, name='create'),
    path('api/turler/', views.oda_turleri_api, name='turler'),
    path('api/<int:oda_id>/', views.oda_detail_api, name='detail'),
    path('api/<int:oda_id>/update/', views.oda_update_api, name='update'),
    path('api/<int:oda_id>/delete/', views.oda_delete_api, name='delete'),
]
