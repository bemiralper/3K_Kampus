"""
Finans Modülü API URL Tanımları
"""
from django.urls import path

from apps.finans.interfaces.views.payment_method_views import (
    OdemeYontemiListCreateView,
    OdemeYontemiDetailView,
    OdemeYontemiToggleView,
    OdemeYontemiDropdownView,
)
from apps.finans.interfaces.views.financial_account_views import (
    MaliHesapListCreateView,
    MaliHesapDetailView,
    MaliHesapToggleView,
    MaliHesapDropdownView,
    MaliHesapAgacView,
    MaliHesapDetayView,
)
from apps.finans.interfaces.views.mali_hesap_yetkilisi_views import (
    MaliHesapYetkilisiListCreateView,
    MaliHesapYetkilisiDetailView,
)
from apps.finans.interfaces.views.dashboard_views import FinansDashboardView, DashboardOverviewView
from apps.finans.interfaces.views.gider_kategorisi_views import (
    GiderKategorisiTreeView,
    GiderKategorisiListCreateView,
    GiderKategorisiDetailView,
    GiderKategorisiToggleView,
    GiderKategorisiDropdownView,
    GiderKategorisiSeedView,
)
from apps.finans.interfaces.views.bakiye_hareketi_views import (
    BakiyeHareketiListView,
    BakiyeHareketiDetailView,
    BakiyeHareketiOzetView,
)
from apps.finans.interfaces.views.donem_bakiye_views import (
    DonemBakiyeListView,
    DonemBakiyeDetailView,
    DonemAcView,
    DonemKapatView,
    DonemDevretView,
    YillarArasiKarsilastirmaView,
    BakiyeYenidenHesaplaView,
)
from apps.finans.interfaces.views.rapor_views import (
    GelirGiderRaporView,
    TahsilatAnalizView,
    BorcYaslandirmaView,
    DonemRaporView,
)
from apps.finans.interfaces.views.cari_export_views import CariTabExportView
from apps.finans.interfaces.views.cari_hesap_views import (
    CariHesapListCreateView,
    CariHesapDetailView,
    CariHesapToggleView,
    CariHesapDropdownView,
    CariHesapRaporListView,
    CariRaporExportView,
    CariHesapCariOzetView,
    CariHareketListView,
    CariDosyaListCreateView,
    CariDosyaDeleteView,
)
from apps.finans.interfaces.views.gelir_kategorisi_views import (
    GelirKategorisiTreeView,
    GelirKategorisiListCreateView,
    GelirKategorisiDetailView,
    GelirKategorisiToggleView,
    GelirKategorisiSeedView,
)
from apps.finans.interfaces.views.gelir_views import (
    GelirKaydiListCreateView,
    GelirKaydiDetailView,
    GelirOnaylaView,
    GelirIptalView,
    GelirOzetView,
)
from apps.finans.interfaces.views.gider_views import (
    GiderKaydiListCreateView,
    GiderKaydiDetailView,
    GiderOnayaGonderView,
    GiderOnaylaView,
    GiderIptalView,
    GiderTaksitListView,
    GiderOzetView,
    GecikenTaksitlerView,
    YaklasanVadelerView,
)
from apps.finans.interfaces.views.gider_odeme_views import (
    GiderOdemeListCreateView,
    GiderOdemeIptalView,
    SonOdemelerView,
)
from apps.finans.interfaces.views.gelir_tahsilat_views import (
    GelirTahsilatListCreateView,
    GelirTahsilatIptalView,
)
from apps.finans.interfaces.views.cari_odeme_views import CariSerbestOdemeView, CariSerbestOdemeIptalView
from apps.finans.interfaces.views.hesap_transferi_views import HesapTransferiListCreateView
from apps.finans.interfaces.views.gun_sonu_views import (
    GunSonuView,
    GunSonuWhatsappPreviewView,
    GunSonuWhatsappSendView,
)
from apps.finans.interfaces.views.para_hareketi_views import ParaHareketleriListView
from apps.finans.interfaces.views.expansion_views import (
    OverduePaymentsView,
    OverduePaymentDetailView,
    PeriodSummaryView,
    PeriodDetailsView,
    PeriodReportExportView,
    OverdueReminderPreviewView,
    OverdueReminderSendView,
    FinansSlugReportView,
)
from apps.finans.interfaces.views.cek_senet_views import (
    CekSenetListView,
    CekSenetDetailView,
    CekSenetTransitionView,
    CekSenetTahsilView,
    CekSenetOdeView,
)

app_name = 'finans'

urlpatterns = [
    # ═══ Dashboard ══════════════════════════════
    path(
        'dashboard/',
        FinansDashboardView.as_view(),
        name='finans-dashboard',
    ),
    path(
        'dashboard/overview/',
        DashboardOverviewView.as_view(),
        name='finans-dashboard-overview',
    ),

    # ═══ Ödeme Yöntemleri ═══════════════════════
    path(
        'odeme-yontemleri/',
        OdemeYontemiListCreateView.as_view(),
        name='odeme-yontemi-list-create',
    ),
    path(
        'odeme-yontemleri/dropdown/',
        OdemeYontemiDropdownView.as_view(),
        name='odeme-yontemi-dropdown',
    ),
    path(
        'odeme-yontemleri/<int:pk>/',
        OdemeYontemiDetailView.as_view(),
        name='odeme-yontemi-detail',
    ),
    path(
        'odeme-yontemleri/<int:pk>/toggle/',
        OdemeYontemiToggleView.as_view(),
        name='odeme-yontemi-toggle',
    ),

    # ═══ Mali Hesaplar ══════════════════════════
    path(
        'mali-hesaplar/',
        MaliHesapListCreateView.as_view(),
        name='mali-hesap-list-create',
    ),
    path(
        'mali-hesaplar/dropdown/',
        MaliHesapDropdownView.as_view(),
        name='mali-hesap-dropdown',
    ),
    path(
        'mali-hesaplar/agac/',
        MaliHesapAgacView.as_view(),
        name='mali-hesap-agac',
    ),
    path(
        'mali-hesaplar/<int:pk>/',
        MaliHesapDetailView.as_view(),
        name='mali-hesap-detail',
    ),
    path(
        'mali-hesaplar/<int:pk>/detay/',
        MaliHesapDetayView.as_view(),
        name='mali-hesap-detay',
    ),
    path(
        'mali-hesaplar/<int:pk>/toggle/',
        MaliHesapToggleView.as_view(),
        name='mali-hesap-toggle',
    ),
    path(
        'mali-hesaplar/<int:mali_hesap_id>/yetkililer/',
        MaliHesapYetkilisiListCreateView.as_view(),
        name='mali-hesap-yetkili-list-create',
    ),
    path(
        'yetkililer/<int:pk>/',
        MaliHesapYetkilisiDetailView.as_view(),
        name='mali-hesap-yetkili-detail',
    ),

    # ═══ Gider Kategorileri ═════════════════════
    path(
        'gider-kategorileri/',
        GiderKategorisiListCreateView.as_view(),
        name='gider-kategorisi-list-create',
    ),
    path(
        'gider-kategorileri/tree/',
        GiderKategorisiTreeView.as_view(),
        name='gider-kategorisi-tree',
    ),
    path(
        'gider-kategorileri/dropdown/',
        GiderKategorisiDropdownView.as_view(),
        name='gider-kategorisi-dropdown',
    ),
    path(
        'gider-kategorileri/seed/',
        GiderKategorisiSeedView.as_view(),
        name='gider-kategorisi-seed',
    ),
    path(
        'gider-kategorileri/<int:pk>/',
        GiderKategorisiDetailView.as_view(),
        name='gider-kategorisi-detail',
    ),
    path(
        'gider-kategorileri/<int:pk>/toggle/',
        GiderKategorisiToggleView.as_view(),
        name='gider-kategorisi-toggle',
    ),

    # ═══ Bakiye Hareketleri ═════════════════════
    path(
        'bakiye-hareketleri/',
        BakiyeHareketiListView.as_view(),
        name='bakiye-hareketi-list',
    ),
    path(
        'bakiye-hareketleri/ozet/',
        BakiyeHareketiOzetView.as_view(),
        name='bakiye-hareketi-ozet',
    ),
    path(
        'bakiye-hareketleri/<int:pk>/',
        BakiyeHareketiDetailView.as_view(),
        name='bakiye-hareketi-detail',
    ),

    # ═══ Dönem Bakiye ═══════════════════════════
    path(
        'donem-bakiye/',
        DonemBakiyeListView.as_view(),
        name='donem-bakiye-list',
    ),
    path(
        'donem-bakiye/ac/',
        DonemAcView.as_view(),
        name='donem-bakiye-ac',
    ),
    path(
        'donem-bakiye/kapat/',
        DonemKapatView.as_view(),
        name='donem-bakiye-kapat',
    ),
    path(
        'donem-bakiye/devret/',
        DonemDevretView.as_view(),
        name='donem-bakiye-devret',
    ),
    path(
        'donem-bakiye/karsilastirma/',
        YillarArasiKarsilastirmaView.as_view(),
        name='donem-bakiye-karsilastirma',
    ),
    path(
        'donem-bakiye/yeniden-hesapla/',
        BakiyeYenidenHesaplaView.as_view(),
        name='donem-bakiye-yeniden-hesapla',
    ),
    path(
        'donem-bakiye/<int:pk>/',
        DonemBakiyeDetailView.as_view(),
        name='donem-bakiye-detail',
    ),

    # ═══ Raporlar ═══════════════════════════════
    path(
        'raporlar/gelir-gider/',
        GelirGiderRaporView.as_view(),
        name='rapor-gelir-gider',
    ),
    path(
        'raporlar/tahsilat-analiz/',
        TahsilatAnalizView.as_view(),
        name='rapor-tahsilat-analiz',
    ),
    path(
        'raporlar/borc-yaslandirma/',
        BorcYaslandirmaView.as_view(),
        name='rapor-borc-yaslandirma',
    ),
    path(
        'raporlar/donem/',
        DonemRaporView.as_view(),
        name='rapor-donem',
    ),

    # ═══ Cari Hesaplar ══════════════════════════
    path(
        'cari-hesaplar/',
        CariHesapListCreateView.as_view(),
        name='cari-hesap-list-create',
    ),
    path(
        'cari-hesaplar/dropdown/',
        CariHesapDropdownView.as_view(),
        name='cari-hesap-dropdown',
    ),
    path(
        'cari-hesaplar/rapor/',
        CariHesapRaporListView.as_view(),
        name='cari-hesap-rapor-list',
    ),
    path(
        'cari-hesaplar/rapor/export/',
        CariRaporExportView.as_view(),
        name='cari-rapor-export',
    ),
    path(
        'cari-hesaplar/<int:pk>/',
        CariHesapDetailView.as_view(),
        name='cari-hesap-detail',
    ),
    path(
        'cari-hesaplar/<int:pk>/toggle/',
        CariHesapToggleView.as_view(),
        name='cari-hesap-toggle',
    ),
    path(
        'cari-hesaplar/<int:pk>/ozet/',
        CariHesapCariOzetView.as_view(),
        name='cari-hesap-ozet',
    ),
    path(
        'cari-hesaplar/<int:pk>/hareketler/',
        CariHareketListView.as_view(),
        name='cari-hareket-list',
    ),
    path(
        'cari-hesaplar/<int:pk>/export/',
        CariTabExportView.as_view(),
        name='cari-tab-export',
    ),
    path(
        'cari-hesaplar/<int:pk>/dosyalar/',
        CariDosyaListCreateView.as_view(),
        name='cari-dosya-list-create',
    ),
    path(
        'cari-hesaplar/<int:pk>/dosyalar/<int:dosya_id>/',
        CariDosyaDeleteView.as_view(),
        name='cari-dosya-delete',
    ),

    # ═══ Gelir Kategorileri ═════════════════════
    path(
        'gelir-kategorileri/',
        GelirKategorisiListCreateView.as_view(),
        name='gelir-kategorisi-list-create',
    ),
    path(
        'gelir-kategorileri/tree/',
        GelirKategorisiTreeView.as_view(),
        name='gelir-kategorisi-tree',
    ),
    path(
        'gelir-kategorileri/seed/',
        GelirKategorisiSeedView.as_view(),
        name='gelir-kategorisi-seed',
    ),
    path(
        'gelir-kategorileri/<int:pk>/',
        GelirKategorisiDetailView.as_view(),
        name='gelir-kategorisi-detail',
    ),
    path(
        'gelir-kategorileri/<int:pk>/toggle/',
        GelirKategorisiToggleView.as_view(),
        name='gelir-kategorisi-toggle',
    ),

    # ═══ Gelir Kayıtları ═══════════════════════
    path(
        'gelirler/',
        GelirKaydiListCreateView.as_view(),
        name='gelir-list-create',
    ),
    path(
        'gelirler/ozet/',
        GelirOzetView.as_view(),
        name='gelir-ozet',
    ),
    path(
        'gelirler/<int:pk>/',
        GelirKaydiDetailView.as_view(),
        name='gelir-detail',
    ),
    path(
        'gelirler/<int:pk>/onayla/',
        GelirOnaylaView.as_view(),
        name='gelir-onayla',
    ),
    path(
        'gelirler/<int:pk>/iptal/',
        GelirIptalView.as_view(),
        name='gelir-iptal',
    ),

    # ═══ Gelir Tahsilatları ════════════════════
    path(
        'gelirler/<int:gelir_id>/tahsilatlar/',
        GelirTahsilatListCreateView.as_view(),
        name='gelir-tahsilat-list-create',
    ),
    path(
        'gelir-tahsilatlar/<int:pk>/iptal/',
        GelirTahsilatIptalView.as_view(),
        name='gelir-tahsilat-iptal',
    ),

    # ═══ Gider Kayıtları ═══════════════════════
    path(
        'giderler/',
        GiderKaydiListCreateView.as_view(),
        name='gider-list-create',
    ),
    path(
        'giderler/ozet/',
        GiderOzetView.as_view(),
        name='gider-ozet',
    ),
    path(
        'giderler/geciken-taksitler/',
        GecikenTaksitlerView.as_view(),
        name='gider-geciken-taksitler',
    ),
    path(
        'giderler/yaklasan-vadeler/',
        YaklasanVadelerView.as_view(),
        name='gider-yaklasan-vadeler',
    ),
    path(
        'giderler/<int:pk>/',
        GiderKaydiDetailView.as_view(),
        name='gider-detail',
    ),
    path(
        'giderler/<int:pk>/onaya-gonder/',
        GiderOnayaGonderView.as_view(),
        name='gider-onaya-gonder',
    ),
    path(
        'giderler/<int:pk>/onayla/',
        GiderOnaylaView.as_view(),
        name='gider-onayla',
    ),
    path(
        'giderler/<int:pk>/iptal/',
        GiderIptalView.as_view(),
        name='gider-iptal',
    ),
    path(
        'giderler/<int:pk>/taksitler/',
        GiderTaksitListView.as_view(),
        name='gider-taksitler',
    ),

    # ═══ Gider Ödemeleri ════════════════════════
    path(
        'giderler/<int:gider_id>/odemeler/',
        GiderOdemeListCreateView.as_view(),
        name='gider-odeme-list-create',
    ),
    path(
        'gider-odemeler/<int:pk>/iptal/',
        GiderOdemeIptalView.as_view(),
        name='gider-odeme-iptal',
    ),
    path(
        'gider-odemeler/son/',
        SonOdemelerView.as_view(),
        name='gider-odeme-son',
    ),

    # ═══ Cari Serbest Ödeme ═════════════════════
    path(
        'cari-odemeler/serbest/',
        CariSerbestOdemeView.as_view(),
        name='cari-serbest-odeme',
    ),
    path(
        'cari-odemeler/<int:cari_hareket_id>/iptal/',
        CariSerbestOdemeIptalView.as_view(),
        name='cari-serbest-odeme-iptal',
    ),

    # ═══ Hesap Transferi (Virman / Bankaya-Kasaya) ═══
    path(
        'hesap-transferi/',
        HesapTransferiListCreateView.as_view(),
        name='hesap-transferi-list-create',
    ),

    # ═══ Gün Sonu ═══════════════════════════════
    path(
        'gun-sonu/',
        GunSonuView.as_view(),
        name='gun-sonu',
    ),
    path(
        'gun-sonu/whatsapp/preview/',
        GunSonuWhatsappPreviewView.as_view(),
        name='gun-sonu-whatsapp-preview',
    ),
    path(
        'gun-sonu/whatsapp/send/',
        GunSonuWhatsappSendView.as_view(),
        name='gun-sonu-whatsapp-send',
    ),

    # ═══ Para Hareketleri (Birleşik) ═══════════════
    path(
        'para-hareketleri/',
        ParaHareketleriListView.as_view(),
        name='para-hareketleri-list',
    ),

    # ═══ Finans Modülü Genişletme (Faz 0–4) ═══════
    path(
        'overdue-payments/',
        OverduePaymentsView.as_view(),
        name='overdue-payments',
    ),
    path(
        'overdue-payments/<int:taksit_id>/',
        OverduePaymentDetailView.as_view(),
        name='overdue-payment-detail',
    ),
    path(
        'period-summary/',
        PeriodSummaryView.as_view(),
        name='period-summary',
    ),
    path(
        'period-details/',
        PeriodDetailsView.as_view(),
        name='period-details',
    ),
    path(
        'period-report/',
        PeriodReportExportView.as_view(),
        name='period-report',
    ),
    path(
        'overdue-reminders/preview/',
        OverdueReminderPreviewView.as_view(),
        name='overdue-reminders-preview',
    ),
    path(
        'overdue-reminders/send/',
        OverdueReminderSendView.as_view(),
        name='overdue-reminders-send',
    ),
    path(
        'reports/<slug:slug>/',
        FinansSlugReportView.as_view(),
        name='finans-report-slug',
    ),

    # ═══ Çek / Senet Portföy ═══════════════════════
    path(
        'cek-senet/',
        CekSenetListView.as_view(),
        name='cek-senet-list',
    ),
    path(
        'cek-senet/<int:pk>/',
        CekSenetDetailView.as_view(),
        name='cek-senet-detail',
    ),
    path(
        'cek-senet/<int:pk>/transition/',
        CekSenetTransitionView.as_view(),
        name='cek-senet-transition',
    ),
    path(
        'cek-senet/<int:pk>/tahsil/',
        CekSenetTahsilView.as_view(),
        name='cek-senet-tahsil',
    ),
    path(
        'cek-senet/<int:pk>/ode/',
        CekSenetOdeView.as_view(),
        name='cek-senet-ode',
    ),
]
