from django.urls import include, path
from apps.website import views

app_name = 'website_admin_api'

urlpatterns = [
    path('landing/', views.api_admin_landing_data, name='admin_landing'),
    path('seed-defaults/', views.api_admin_seed_defaults, name='admin_seed_defaults'),
    path('settings/', views.api_admin_settings, name='admin_settings'),
    path('social-links/', views.api_admin_social_links, name='admin_social_links'),
    path('social-links/<int:pk>/', views.api_admin_social_link_detail, name='admin_social_link_detail'),
    path('footer-links/', views.api_admin_footer_links, name='admin_footer_links'),
    path('footer-links/<int:pk>/', views.api_admin_footer_link_detail, name='admin_footer_link_detail'),
    path('hero-slides/', views.api_admin_hero_slides, name='admin_hero_slides'),
    path('hero-slides/<int:pk>/', views.api_admin_hero_slide_detail, name='admin_hero_slide_detail'),
    path('hero-slides/<int:pk>/upload/', views.api_admin_hero_slide_upload, name='admin_hero_slide_upload'),
    path('duyurular/', views.api_admin_duyurular, name='admin_duyurular'),
    path('duyurular/<int:pk>/', views.api_admin_duyuru_detail, name='admin_duyuru_detail'),
    path('duyurular/<int:pk>/upload/', views.api_admin_duyuru_upload, name='admin_duyuru_upload'),
    path('sinav-takvim/', views.api_admin_sinav_takvim, name='admin_sinav_takvim'),
    path('sinav-takvim/<int:pk>/', views.api_admin_sinav_detail, name='admin_sinav_detail'),
    path('sinav-takvim/<int:pk>/upload/', views.api_admin_sinav_upload, name='admin_sinav_upload'),
    path('neden-kartlari/', views.api_admin_neden_kartlari, name='admin_neden_kartlari'),
    path('neden-kartlari/<int:pk>/', views.api_admin_neden_kart_detail, name='admin_neden_kart_detail'),
    path('basari-istatistikleri/', views.api_admin_basari_istatistikleri, name='admin_basari'),
    path('basari-istatistikleri/<int:pk>/', views.api_admin_basari_detail, name='admin_basari_detail'),
    path('yorumlar/', views.api_admin_yorumlar, name='admin_yorumlar'),
    path('yorumlar/<int:pk>/', views.api_admin_yorum_detail, name='admin_yorum_detail'),
    path('sss/', views.api_admin_sss, name='admin_sss'),
    path('sss/<int:pk>/', views.api_admin_sss_detail, name='admin_sss_detail'),
    path('yasal-metinler/', views.api_admin_yasal_metinler, name='admin_yasal'),
    path('yasal-metinler/<int:pk>/', views.api_admin_yasal_detail, name='admin_yasal_detail'),
    path('iletisim-mesajlari/', views.api_admin_iletisim_mesajlari, name='admin_iletisim'),
    path('iletisim-mesajlari/<int:pk>/', views.api_admin_iletisim_mesaj_detail, name='admin_iletisim_detail'),
    # CMS v2 Page Builder
    path('v2/', include('apps.website.v2_admin_urls')),
]
