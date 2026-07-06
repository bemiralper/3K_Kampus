"""
Ödeme Takip API URL'leri
"""
from django.urls import path

from .interfaces.api_views.sozlesme_views import (
    sozlesme_list,
    sozlesme_create,
    sozlesme_detail,
    sozlesme_update,
    sozlesme_delete,
    sozlesme_status_change,
    sozlesme_status_revert,
    sozlesme_indirim_add,
    sozlesme_kalem_ekle,
    sozlesme_kalem_cikar,
    indirim_approve,
    indirim_reject,
    odeme_sekilleri,
    indirim_turleri,
)
from .interfaces.api_views.taksit_views import (
    taksit_list,
    taksit_update,
    taksit_plani_olustur,
    vadesi_gecenler,
    vadesi_gelecekler,
)
from .interfaces.api_views.tahsilat_views import (
    tahsilat_list,
    tahsilat_create,
    tahsilat_cancel,
    tahsilat_iade,
    tahsilat_makbuz,
    tahsilat_mahsup,
)
from .interfaces.api_views.rapor_views import (
    dashboard_ozet,
    ogrenci_risk_skorlari,
)
from .interfaces.api_views.ogrenci_paket_views import (
    ogrenci_paketleri,
)
from .interfaces.api_views.fesih_views import (
    fesih_hesapla,
    fesih_onayla,
    fesih_detay,
    fesih_nedenleri,
)
from .interfaces.api_views.notify_views import (
    sozlesme_notify_preview,
    sozlesme_notify_send,
    tahsilat_notify_preview,
    tahsilat_notify_send,
)
from .interfaces.api_views.kalem_secenekleri_views import (
    kalem_secenekleri,
    kalem_turleri,
)

app_name = 'odeme_takip'

urlpatterns = [
    # Sözleşme CRUD
    path('sozlesmeler/', sozlesme_list, name='sozlesme-list'),
    path('sozlesmeler/create/', sozlesme_create, name='sozlesme-create'),
    path('sozlesmeler/<int:pk>/', sozlesme_detail, name='sozlesme-detail'),
    path('sozlesmeler/<int:pk>/update/', sozlesme_update, name='sozlesme-update'),
    path('sozlesmeler/<int:pk>/delete/', sozlesme_delete, name='sozlesme-delete'),
    path('sozlesmeler/<int:pk>/status/', sozlesme_status_change, name='sozlesme-status'),
    path('sozlesmeler/<int:pk>/status/revert/', sozlesme_status_revert, name='sozlesme-status-revert'),

    path('sozlesmeler/<int:pk>/notify-preview/', sozlesme_notify_preview, name='sozlesme-notify-preview'),
    path('sozlesmeler/<int:pk>/notify-send/', sozlesme_notify_send, name='sozlesme-notify-send'),

    # Kalem ekleme/çıkarma
    path('sozlesmeler/<int:pk>/kalem-ekle/', sozlesme_kalem_ekle, name='sozlesme-kalem-ekle'),
    path('kalemler/<int:pk>/cikar/', sozlesme_kalem_cikar, name='sozlesme-kalem-cikar'),

    # İndirim
    path('sozlesmeler/<int:pk>/indirimler/', sozlesme_indirim_add, name='sozlesme-indirim-add'),
    path('indirimler/<int:pk>/approve/', indirim_approve, name='indirim-approve'),
    path('indirimler/<int:pk>/reject/', indirim_reject, name='indirim-reject'),

    # Taksit
    path('sozlesmeler/<int:sozlesme_id>/taksitler/', taksit_list, name='taksit-list'),
    path('sozlesmeler/<int:sozlesme_id>/taksit-plani/', taksit_plani_olustur, name='taksit-plani-olustur'),
    path('taksitler/<int:pk>/update/', taksit_update, name='taksit-update'),
    path('taksitler/vadesi-gecenler/', vadesi_gecenler, name='vadesi-gecenler'),
    path('taksitler/vadesi-gelecekler/', vadesi_gelecekler, name='vadesi-gelecekler'),

    # Tahsilat
    path('tahsilatlar/', tahsilat_list, name='tahsilat-list'),
    path('tahsilatlar/create/', tahsilat_create, name='tahsilat-create'),
    path('tahsilatlar/<int:pk>/cancel/', tahsilat_cancel, name='tahsilat-cancel'),
    path('tahsilatlar/iade/', tahsilat_iade, name='tahsilat-iade'),
    path('tahsilatlar/<int:pk>/makbuz/', tahsilat_makbuz, name='tahsilat-makbuz'),
    path('tahsilatlar/mahsup/', tahsilat_mahsup, name='tahsilat-mahsup'),

    path('tahsilatlar/<int:pk>/notify-preview/', tahsilat_notify_preview, name='tahsilat-notify-preview'),
    path('tahsilatlar/<int:pk>/notify-send/', tahsilat_notify_send, name='tahsilat-notify-send'),

    # Parametrik
    path('odeme-sekilleri/', odeme_sekilleri, name='odeme-sekilleri'),
    path('indirim-turleri/', indirim_turleri, name='indirim-turleri'),
    path('kalem-secenekleri/', kalem_secenekleri, name='kalem-secenekleri'),
    path('kalem-turleri/', kalem_turleri, name='kalem-turleri'),

    # Rapor / Dashboard
    path('dashboard/', dashboard_ozet, name='dashboard'),
    path('risk-skorlari/', ogrenci_risk_skorlari, name='risk-skorlari'),

    # Öğrenci Paketleri (sözleşme oluşturma için)
    path('ogrenci/<int:ogrenci_id>/paketler/', ogrenci_paketleri, name='ogrenci-paketleri'),

    # Fesih
    path('sozlesmeler/<int:pk>/fesih/hesapla/', fesih_hesapla, name='fesih-hesapla'),
    path('sozlesmeler/<int:pk>/fesih/onayla/', fesih_onayla, name='fesih-onayla'),
    path('sozlesmeler/<int:pk>/fesih/', fesih_detay, name='fesih-detay'),
    path('fesih-nedenleri/', fesih_nedenleri, name='fesih-nedenleri'),
]
