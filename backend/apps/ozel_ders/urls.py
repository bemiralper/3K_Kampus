from django.urls import path

from apps.ozel_ders.interfaces import views

urlpatterns = [
    path('meta/', views.meta, name='ozel-ders-meta'),
    path('programlar/', views.program_list_create, name='ozel-ders-programlar'),
    path('programlar/sync/', views.program_sync, name='ozel-ders-programlar-sync'),
    path('programlar/<int:program_id>/', views.program_detail, name='ozel-ders-program-detail'),
    path('programlar/<int:program_id>/slots/', views.slot_list_create, name='ozel-ders-slots'),
    path('programlar/<int:program_id>/materialize/', views.materialize, name='ozel-ders-materialize'),
    path('slots/swap/', views.slot_swap, name='ozel-ders-slots-swap'),
    path('slots/<int:slot_id>/', views.slot_detail, name='ozel-ders-slot-detail'),
    path('slots/<int:slot_id>/erken-bitir/', views.slot_end_early, name='ozel-ders-slot-erken-bitir'),

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
    path(
        'ogrenci/<int:ogrenci_id>/ozet-donem/',
        views.ogrenci_ozet_donem,
        name='ozel-ders-ogrenci-ozet-donem',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/haftalik-program/pdf/',
        views.ogrenci_haftalik_program_pdf,
        name='ozel-ders-ogrenci-haftalik-pdf',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/haftalik-program/onizleme/',
        views.ogrenci_haftalik_program_onizleme,
        name='ozel-ders-ogrenci-haftalik-onizleme',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/haftalik-program/gonder/',
        views.ogrenci_haftalik_program_gonder,
        name='ozel-ders-ogrenci-haftalik-gonder',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders-ozeti/pdf/',
        views.ogrenci_ders_ozeti_pdf,
        name='ozel-ders-ogrenci-ders-ozeti-pdf',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders-ozeti/onizleme/',
        views.ogrenci_ders_ozeti_onizleme,
        name='ozel-ders-ogrenci-ders-ozeti-onizleme',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders-ozeti/gonder/',
        views.ogrenci_ders_ozeti_gonder,
        name='ozel-ders-ogrenci-ders-ozeti-gonder',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders/<int:ders_id>/gecmis/',
        views.ogrenci_ders_gecmis,
        name='ozel-ders-ogrenci-ders-gecmis',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders/<int:ders_id>/gecmis/pdf/',
        views.ogrenci_ders_gecmis_pdf,
        name='ozel-ders-ogrenci-ders-gecmis-pdf',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders/<int:ders_id>/gecmis/onizleme/',
        views.ogrenci_ders_gecmis_onizleme,
        name='ozel-ders-ogrenci-ders-gecmis-onizleme',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders/<int:ders_id>/gecmis/gonder/',
        views.ogrenci_ders_gecmis_gonder,
        name='ozel-ders-ogrenci-ders-gecmis-gonder',
    ),
    path(
        'ogrenci/<int:ogrenci_id>/ders/<int:ders_id>/gecmis/tatil/',
        views.ogrenci_ders_gecmis_tatil,
        name='ozel-ders-ogrenci-ders-gecmis-tatil',
    ),
]
