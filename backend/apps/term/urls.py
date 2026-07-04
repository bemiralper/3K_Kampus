"""
Term URL Configuration
"""
from django.urls import path
from apps.term.interfaces import views

app_name = 'term'

urlpatterns = [
    path('active-year/', views.active_year_api, name='active_year'),
    path('', views.term_list_api, name='list'),
    path('create/', views.term_create_api, name='create'),
    path('<int:term_id>/', views.term_detail_api, name='detail'),
    path('<int:term_id>/update/', views.term_update_api, name='update'),
]
