"""
URL Configuration
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import redirect
from django.views.generic import RedirectView
import views as backend_views

urlpatterns = [
    path('', lambda request: redirect(settings.FRONTEND_URL, permanent=False)),
    path('dashboard/', lambda request: redirect(f"{settings.FRONTEND_URL}/dashboard", permanent=False)),
    path('admin/', admin.site.urls),
    path('accounts/login/', RedirectView.as_view(url='/admin/login/', permanent=False)),
    
    # Auth URLs
    path('auth/', include('apps.auth_custom.urls')),
    
    # App URLs
    path('ogrenciler/yeni-kayit', lambda request: redirect(f"{settings.FRONTEND_URL}/ogrenciler/yeni-kayit", permanent=False)),
    path('kurum-yonetimi/api/', include('apps.kurum.api_urls')),
    path('kurum-yonetimi/', lambda request: redirect(f"{settings.FRONTEND_URL}/kurum-yonetimi/kurumlar", permanent=False)),
    path('kurum-yonetimi/<path:rest>/', lambda request, rest: redirect(f"{settings.FRONTEND_URL}/kurum-yonetimi/{rest}", permanent=False)),
    path('egitim-tanimlari/api/', include('apps.egitim_tanimlari.api_urls')),
    path('egitim-tanimlari/', lambda request: redirect(f"{settings.FRONTEND_URL}/egitim-tanimlari", permanent=False)),
    path('egitim-tanimlari/<path:rest>/', lambda request, rest: redirect(f"{settings.FRONTEND_URL}/egitim-tanimlari/{rest}", permanent=False)),
    path('egitim-paketleri/api/', include('apps.egitim_paketleri.api_urls')),
    path('egitim-paketleri/', lambda request: redirect(f"{settings.FRONTEND_URL}/egitim-paketleri", permanent=False)),
    path('egitim-paketleri/<path:rest>/', lambda request, rest: redirect(f"{settings.FRONTEND_URL}/egitim-paketleri/{rest}", permanent=False)),
    path('ogrenciler/api/', include('apps.ogrenci.api_urls')),
    path('api/legacy/index/', backend_views.legacy_index_api),
    path('api/legacy/dashboard/', backend_views.legacy_dashboard_api),
    path('ogrenciler/', lambda request: redirect(f"{settings.FRONTEND_URL}/ogrenciler", permanent=False)),
    path('ogrenciler/<path:rest>/', lambda request, rest: redirect(f"{settings.FRONTEND_URL}/ogrenciler/{rest}", permanent=False)),
    path('api/ogrenci-kayit/', include('apps.ogrenci_kayit.urls')),
    path('api/kimlik/', include('apps.kimlik.interfaces.urls')),
    
    # Personel URLs
    path('personel/', include('apps.personel.interfaces.urls')),
    path('personel/api/sozlesmeler/', include('apps.personel.interfaces.sozlesme_urls')),
    path('personel-tanimlari/', lambda request: redirect(f"{settings.FRONTEND_URL}/personel", permanent=False)),
    
    # Oda URLs - Fiziksel mekan yönetimi
    path('odalar/', include('apps.oda.urls')),
    
    # Sınıf URLs - Akademik organizasyon
    path('siniflar/', include('apps.sinif.urls')),
    
    # Rol Yönetimi URLs - Birimlerden tamamen bağımsız
    path('roller/', include('apps.roller.urls')),
    
    # Term (Eğitim Dönemleri) URLs
    path('api/terms/', include('apps.term.urls')),
    
    # Academic (Akademik Planlama) URLs
    path('api/academic/', include('apps.academic.urls')),
    
    # Coaching (Koçluk Yönetimi) URLs
    path('api/coaching/', include('apps.coaching.api.urls')),
    
    # Manuel Ödev Atama URLs
    path('api/coaching/manual-assignments/', include('apps.coaching.assignment_manual.urls')),
    
    # Çalışma Programı URLs
    path('api/coaching/study-program/', include('apps.coaching.study_program.urls')),
    
    # Ölçme ve Değerlendirme URLs
    path('api/coaching/olcme-degerlendirme/', include('apps.coaching.olcme_degerlendirme.urls')),
    
    # Resources (Kaynak Kütüphanesi) URLs
    path('api/resources/', include('apps.resources.urls')),
    
    # Student Resources (Öğrenci Kaynak Havuzu) URLs
    path('api/student-resources/', include('apps.student_resources.urls')),
    
    # Kütüphane (Etüt Salonu Yönetimi) URLs
    path('kutuphane/api/', include('apps.kutuphane.api_urls')),

    # Takvim (Merkezi Takvim Yönetimi) URLs
    path('takvim/api/', include('apps.takvim.api_urls')),

    # Görev Yönetimi URLs
    path('gorev/api/', include('apps.gorev.api_urls')),

    # Finans Tanımları URLs
    path('finans/api/', include('apps.finans.api_urls')),

    # Ödeme Takip URLs
    path('odeme-takip/api/', include('apps.odeme_takip.api_urls')),

    # İletişim Merkezi (WhatsApp)
    path('api/communication/', include('apps.communication.api_urls')),
    path('api/communication/webhook/', include('apps.communication.webhook_urls')),

    # Kurumsal Web Sitesi
    path('website/api/', include('apps.website.api_urls')),
    path('website-yonetimi/api/', include('apps.website.admin_api_urls')),
    path('website-yonetimi/', lambda request: redirect(f"{settings.FRONTEND_URL}/website-yonetimi", permanent=False)),

    # Platform yedekleme (super admin)
    path('yedekleme/api/', include('apps.yedekleme.interfaces.urls')),
    path('yedekleme/', lambda request: redirect(f"{settings.FRONTEND_URL}/admin/yedekleme", permanent=False)),

    # Sistem Yönetimi (System Center)
    path('sistem-yonetimi/api/', include('apps.sistem_yonetimi.interfaces.urls')),
    path('sistem-yonetimi/', lambda request: redirect(f"{settings.FRONTEND_URL}/admin/sistem-yonetimi", permanent=False)),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
