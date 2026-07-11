"""
Personel Sözleşmeleri — URL Yapılandırması
"""
from django.urls import path
from apps.personel.interfaces import sozlesme_views as v

app_name = 'personel_sozlesme'

urlpatterns = [
    # ── Sözleşmeler ──
    path('', v.api_sozlesme_list_create, name='sozlesme_list_create'),
    path('stats/', v.api_sozlesme_stats, name='sozlesme_stats'),
    path('helper-data/', v.api_sozlesme_helper_data, name='sozlesme_helper_data'),
    path('<int:pk>/', v.api_sozlesme_detail, name='sozlesme_detail'),
    path('<int:pk>/durum/', v.api_sozlesme_durum, name='sozlesme_durum'),
    path('<int:pk>/taslak/', v.api_sozlesme_taslak, name='sozlesme_taslak'),
    path('<int:pk>/print-token/', v.api_sozlesme_print_token, name='sozlesme_print_token'),
    path('<int:pk>/print-data/', v.api_sozlesme_print_data, name='sozlesme_print_data'),
    path('<int:pk>/pdf/', v.api_sozlesme_pdf, name='sozlesme_pdf'),
    path('preview-hesap/', v.api_sozlesme_preview_hesap, name='sozlesme_preview_hesap'),

    # ── Hakedişler ──
    path('hakedis/', v.api_hakedis_list_create, name='hakedis_list_create'),
    path('hakedis/stats/', v.api_hakedis_stats, name='hakedis_stats'),
    path('hakedis/toplu-olustur/', v.api_hakedis_toplu_olustur, name='hakedis_toplu_olustur'),
    path('hakedis/toplu-onayla/', v.api_hakedis_toplu_onayla, name='hakedis_toplu_onayla'),
    path('hakedis/toplu-odendi/', v.api_hakedis_toplu_odendi, name='hakedis_toplu_odendi'),
    path('hakedis/<int:pk>/', v.api_hakedis_detail, name='hakedis_detail'),
    path('hakedis/<int:pk>/onayla/', v.api_hakedis_onayla, name='hakedis_onayla'),
    path('hakedis/<int:pk>/odendi/', v.api_hakedis_odendi, name='hakedis_odendi'),

    # ── Avanslar ──
    path('avans/', v.api_avans_list_create, name='avans_list_create'),
    path('avans/<int:pk>/', v.api_avans_detail, name='avans_detail'),

    # ── PDF Export ──
    path('hakedis/<int:pk>/pdf/', v.api_bordro_pdf_tekil, name='bordro_pdf_tekil'),
    path('hakedis/pdf-toplu/', v.api_bordro_pdf_toplu, name='bordro_pdf_toplu'),

    # ── Personel Detay ──
    path('personel/<int:personel_id>/odeme-gecmisi/', v.api_personel_odeme_gecmisi, name='personel_odeme_gecmisi'),

    # ── Raporlar ──
    path('rapor/yillik/', v.api_rapor_yillik, name='rapor_yillik'),

    # ── Finans Entegrasyonu ──
    path('finans/gider-kaydet/', v.api_maas_gider_kaydet, name='maas_gider_kaydet'),
    path('finans/gider-kategorileri/', v.api_gider_kategorileri, name='gider_kategorileri'),
]
