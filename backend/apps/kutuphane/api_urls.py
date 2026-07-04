"""Kütüphane API URL Configuration"""
from django.urls import path
from apps.kutuphane import views

app_name = "kutuphane_api"

urlpatterns = [
    # Dashboard
    path("dashboard/", views.api_dashboard, name="dashboard"),

    # Tüm Atamalar (salon-bağımsız)
    path("atamalar/", views.api_all_assignments, name="all_assignments"),

    # Öğrenci Kaynak Genel Görünümü
    path("ogrenci-kaynaklar/", views.api_student_resource_overview, name="ogrenci_kaynaklar"),

    # Library (Salon) CRUD
    path("salon/", views.api_library_list_create, name="salon_list_create"),
    path("salon/<uuid:pk>/", views.api_library_detail, name="salon_detail"),
    path("salon/<uuid:pk>/durum/", views.api_library_status, name="salon_status"),

    # Seats (Masa)
    path("salon/<uuid:library_id>/masa/", views.api_seat_list_create, name="masa_list_create"),
    path("salon/<uuid:library_id>/masa/toplu/", views.api_seat_bulk_create, name="masa_bulk_create"),
    path("salon/<uuid:library_id>/masa/<uuid:pk>/", views.api_seat_detail, name="masa_detail"),
    path("salon/<uuid:library_id>/masa/<uuid:pk>/durum/", views.api_seat_status, name="masa_status"),

    # Lockers (Dolap) — Kurum bazlı (kütüphaneden bağımsız)
    path("dolap/", views.api_locker_list_create, name="dolap_list_create"),
    path("dolap/<uuid:pk>/", views.api_locker_detail, name="dolap_detail"),

    # Session Definitions (Oturum Tanımı)
    path("salon/<uuid:library_id>/oturum-tanimi/", views.api_session_def_list_create, name="oturum_tanimi_list_create"),
    path("salon/<uuid:library_id>/oturum-tanimi/<uuid:pk>/", views.api_session_def_detail, name="oturum_tanimi_detail"),

    # Şube Ders Programı
    path("ders-programi/", views.api_ders_programi_list_create, name="ders_programi_list_create"),
    path("ders-programi/<uuid:pk>/", views.api_ders_programi_detail, name="ders_programi_detail"),
    path("subeler/", views.api_subeler_with_program, name="subeler_with_program"),

    # Öğrenci İzinleri
    path("izinler/degistir/", views.api_ogrenci_izin_replace, name="izin_replace"),
    path("izinler/", views.api_ogrenci_izin_list_create, name="izin_list_create"),
    path("izinler/<uuid:pk>/", views.api_ogrenci_izin_detail, name="izin_detail"),

    # Seat Assignments (Masa Ataması)
    path("salon/<uuid:library_id>/masa-atama/", views.api_seat_assignment_list_create, name="masa_atama_list_create"),
    path("salon/<uuid:library_id>/masa-atama/<uuid:pk>/sonlandir/", views.api_seat_assignment_end, name="masa_atama_end"),

    # Locker Assignments (Dolap Ataması) — Kurum bazlı
    path("dolap-atama/", views.api_locker_assignment_list_create, name="dolap_atama_list_create"),
    path("dolap-atama/<uuid:pk>/sonlandir/", views.api_locker_assignment_end, name="dolap_atama_end"),
    path("dolap-atama/<uuid:pk>/anahtar/", views.api_locker_assignment_toggle_key, name="dolap_atama_toggle_key"),

    # Attendance (Yoklama)
    path("salon/<uuid:library_id>/yoklama/", views.api_attendance_sessions, name="yoklama_sessions"),
    path("salon/<uuid:library_id>/yoklama/<uuid:pk>/", views.api_attendance_session_detail, name="yoklama_session_detail"),
    path("salon/<uuid:library_id>/yoklama/<uuid:pk>/kapat/", views.api_attendance_close, name="yoklama_close"),
    path("salon/<uuid:library_id>/yoklama/<uuid:pk>/ac/", views.api_attendance_reopen, name="yoklama_reopen"),
    path("salon/<uuid:library_id>/yoklama/<uuid:session_id>/kayit/", views.api_attendance_records, name="yoklama_records"),
    path("salon/<uuid:library_id>/yoklama/<uuid:session_id>/bildirim-durumu/", views.api_attendance_notify_status, name="yoklama_bildirim_durumu"),
    path("salon/<uuid:library_id>/yoklama/<uuid:session_id>/bildirim-onizleme/", views.api_attendance_notify_preview, name="yoklama_bildirim_onizleme"),
    path("salon/<uuid:library_id>/yoklama/<uuid:session_id>/bildirim-gonder/", views.api_attendance_notify_send, name="yoklama_bildirim_gonder"),
    path("yoklama-bildirim-ayarlari/", views.api_attendance_notify_config, name="yoklama_bildirim_ayarlari"),

    # Gelişmiş Yoklama (Ders Bazlı)
    path("salon/<uuid:library_id>/yoklama/ders-bazli-ac/", views.api_attendance_open_lessons, name="yoklama_ders_bazli_ac"),
    path("salon/<uuid:library_id>/yoklama-kagidi/", views.api_attendance_sheet_data, name="yoklama_kagidi"),
    path("salon/<uuid:library_id>/yoklama-ozet/", views.api_attendance_weekly_summary, name="yoklama_ozet"),

    # Temporary Seating (Geçici Oturma)
    path("salon/<uuid:library_id>/gecici-oturma/", views.api_temporary_seating_list_create, name="gecici_oturma_list_create"),
    path("salon/<uuid:library_id>/gecici-oturma/<uuid:pk>/sonlandir/", views.api_temporary_seating_end, name="gecici_oturma_end"),

    # Audit Logs
    path("salon/<uuid:library_id>/loglar/", views.api_audit_logs, name="audit_logs"),

    # Analytics (Kapasite & Analitik)
    path("analitik/", views.api_global_analytics, name="global_analytics"),
    path("salon/<uuid:library_id>/analitik/", views.api_analytics, name="salon_analytics"),
]
