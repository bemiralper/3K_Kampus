from django.urls import path
from apps.website import views
from apps.website.interfaces import v2_views as v2

app_name = 'website_api'

urlpatterns = [
    path('public/<str:kod>/', views.api_public_landing, name='public_landing'),
    path('public/<str:kod>/duyurular/<slug:slug>/', views.api_public_duyuru_detail, name='public_duyuru'),
    path('public/<str:kod>/yasal/<str:tur>/', views.api_public_yasal_detail, name='public_yasal'),
    path('public/<str:kod>/iletisim/', views.api_public_iletisim, name='public_iletisim'),
    # CMS v2 public
    path('public/<str:kod>/v2/page/', v2.api_public_v2_page, {'slug': 'home'}, name='public_v2_home'),
    path('public/<str:kod>/v2/page/<slug:slug>/', v2.api_public_v2_page, name='public_v2_page'),
    path('public/<str:kod>/v2/forms/<slug:slug>/submit/', v2.api_public_v2_form_submit, name='public_v2_form'),
    path('public/<str:kod>/v2/robots.txt', v2.api_public_v2_robots, name='public_v2_robots'),
    path('public/<str:kod>/v2/sitemap-pages/', v2.api_public_v2_sitemap_pages, name='public_v2_sitemap'),
]
