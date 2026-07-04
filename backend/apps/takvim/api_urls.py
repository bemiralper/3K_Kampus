"""
Takvim modülü — URL yapılandırması
"""
from django.urls import path

from . import views_event_type, views_event, views_reminder, views_notification, views_preference

urlpatterns = [
    # ── Etkinlik Türleri ──
    path('turler/', views_event_type.api_event_type_list_create, name='event_type_list_create'),
    path('turler/<uuid:pk>/', views_event_type.api_event_type_detail, name='event_type_detail'),
    path('turler/seed/', views_event_type.api_event_type_seed, name='event_type_seed'),

    # ── Etkinlikler ──
    path('etkinlikler/', views_event.api_event_list_create, name='event_list_create'),
    path('etkinlikler/<uuid:pk>/', views_event.api_event_detail, name='event_detail'),
    path('etkinlikler/<uuid:pk>/tasi/', views_event.api_event_move, name='event_move'),
    path('etkinlikler/<uuid:pk>/resize/', views_event.api_event_resize, name='event_resize'),
    path('etkinlikler/<uuid:pk>/durum/', views_event.api_event_status, name='event_status'),

    # ── Hatırlatma Ayarları ──
    path('hatirlatma-ayarlari/', views_reminder.api_reminder_setting_list_create, name='reminder_setting_list_create'),
    path('hatirlatma-ayarlari/<uuid:pk>/', views_reminder.api_reminder_setting_detail, name='reminder_setting_detail'),

    # ── Bildirimler (kullanıcı tarafı) ──
    path('bildirimler/', views_notification.api_notification_list, name='notification_list'),
    path('bildirimler/ozet/', views_notification.api_notification_summary, name='notification_summary'),
    path('bildirimler/ekran/', views_notification.api_notification_screen, name='notification_screen'),
    path('bildirimler/<uuid:pk>/ekran-gosterildi/', views_notification.api_notification_mark_screen_shown, name='notification_mark_screen_shown'),
    path('bildirimler/<uuid:pk>/oku/', views_notification.api_notification_mark_read, name='notification_mark_read'),
    path('bildirimler/hepsini-oku/', views_notification.api_notification_mark_all_read, name='notification_mark_all_read'),

    # ── Bildirim Logları (admin tarafı) ──
    path('bildirim-loglar/', views_notification.api_notification_logs, name='notification_logs'),
    path('bildirim-loglar/istatistik/', views_notification.api_notification_stats, name='notification_stats'),

    # ── Kullanıcı Bildirim Tercihleri ──
    path('bildirim-tercihleri/', views_preference.api_preference_list_create, name='preference_list_create'),
    path('bildirim-tercihleri/<uuid:pk>/', views_preference.api_preference_delete, name='preference_delete'),
]
