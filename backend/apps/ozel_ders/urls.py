from django.urls import path

from apps.ozel_ders.interfaces import views

urlpatterns = [
    path('programlar/', views.program_list_create, name='ozel-ders-programlar'),
    path('programlar/sync/', views.program_sync, name='ozel-ders-programlar-sync'),
    path('programlar/<int:program_id>/', views.program_detail, name='ozel-ders-program-detail'),
    path('programlar/<int:program_id>/slots/', views.slot_list_create, name='ozel-ders-slots'),
    path('programlar/<int:program_id>/materialize/', views.materialize, name='ozel-ders-materialize'),
    path('slots/swap/', views.slot_swap, name='ozel-ders-slots-swap'),
    path('slots/<int:slot_id>/', views.slot_detail, name='ozel-ders-slot-detail'),

    path('oturumlar/', views.oturum_list_create, name='ozel-ders-oturumlar'),
    path('oturumlar/<int:oturum_id>/', views.oturum_detail, name='ozel-ders-oturum-detail'),
    path('oturumlar/<int:oturum_id>/durum/', views.oturum_set_durum, name='ozel-ders-oturum-durum'),
    path('oturumlar/<int:oturum_id>/telafi/', views.oturum_telafi, name='ozel-ders-oturum-telafi'),
    path('oturumlar/<int:oturum_id>/ogretmen/', views.oturum_change_teacher, name='ozel-ders-oturum-ogretmen'),

    path('hakedis/', views.hakedis_list, name='ozel-ders-hakedis'),
    path('hakedis/<int:hakedis_id>/onayla/', views.hakedis_approve, name='ozel-ders-hakedis-onayla'),
    path('hakedis/<int:hakedis_id>/iptal/', views.hakedis_cancel, name='ozel-ders-hakedis-iptal'),
    path('hakedis/bordro-aktar/', views.hakedis_bordro_aktar, name='ozel-ders-hakedis-bordro'),
    path('hakedis/bordro/<int:aylik_hakedis_id>/', views.hakedis_for_bordro, name='ozel-ders-hakedis-bordro-list'),

    path('premium-paketler/<int:premium_paket_id>/kota/', views.premium_kota, name='ozel-ders-premium-kota'),
    path(
        'premium-paketler/<int:premium_paket_id>/kota/suggest/',
        views.premium_kota_suggest,
        name='ozel-ders-premium-kota-suggest',
    ),

    path('ucret-kurallari/seed/', views.seed_ucret_kurallari, name='ozel-ders-ucret-seed'),

    path('tatiller/', views.tatil_list, name='ozel-ders-tatiller'),
    path('resmi-tatiller/', views.resmi_tatil_list_sync, name='ozel-ders-resmi-tatiller'),
    path('resmi-tatiller/karar/', views.resmi_tatil_karar, name='ozel-ders-resmi-tatil-karar'),

    path('ogrenci/<int:ogrenci_id>/ozet/', views.ogrenci_ozet, name='ozel-ders-ogrenci-ozet'),
]
