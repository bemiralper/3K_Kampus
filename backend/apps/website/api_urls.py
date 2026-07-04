from django.urls import path
from apps.website import views

app_name = 'website_api'

urlpatterns = [
    path('public/<str:kod>/', views.api_public_landing, name='public_landing'),
    path('public/<str:kod>/duyurular/<slug:slug>/', views.api_public_duyuru_detail, name='public_duyuru'),
    path('public/<str:kod>/yasal/<str:tur>/', views.api_public_yasal_detail, name='public_yasal'),
    path('public/<str:kod>/iletisim/', views.api_public_iletisim, name='public_iletisim'),
]
