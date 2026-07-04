"""
Takvim modülü — Repository (Data Access Layer)
"""
from datetime import datetime, timedelta
from typing import Optional

from django.db import models
from django.db.models import QuerySet, Q, Count
from django.utils import timezone

from apps.takvim.domain.models import (
    Event, EventType, Reminder, ReminderSetting,
    AppNotification, NotificationLog, UserNotificationPreference,
)


class EventTypeRepository:
    """Etkinlik türü veri erişim katmanı"""

    @staticmethod
    def get_all(kurum_id: int) -> QuerySet:
        return EventType.objects.filter(
            kurum_id=kurum_id, is_deleted=False
        ).annotate(
            etkinlik_sayisi=Count(
                'events',
                filter=Q(events__is_deleted=False),
            )
        )

    @staticmethod
    def get_active(kurum_id: int) -> QuerySet:
        return EventType.objects.filter(
            kurum_id=kurum_id, is_deleted=False, is_active=True
        )

    @staticmethod
    def get_by_id(event_type_id) -> Optional[EventType]:
        try:
            return EventType.objects.get(id=event_type_id, is_deleted=False)
        except EventType.DoesNotExist:
            return None

    @staticmethod
    def get_by_kategori(kurum_id: int, kategori: str) -> QuerySet:
        return EventType.objects.filter(
            kurum_id=kurum_id, kategori=kategori, is_deleted=False, is_active=True
        )

    @staticmethod
    def create(data: dict) -> EventType:
        valid_fields = {f.name for f in EventType._meta.get_fields() if hasattr(f, 'column')}
        clean = {k: v for k, v in data.items() if k in valid_fields}
        return EventType.objects.create(**clean)

    @staticmethod
    def update(event_type: EventType, data: dict) -> EventType:
        valid_fields = {f.name for f in EventType._meta.get_fields() if hasattr(f, 'column')}
        for key, value in data.items():
            if key in valid_fields and key not in ('id', 'created_at'):
                setattr(event_type, key, value)
        event_type.save()
        return event_type

    @staticmethod
    def soft_delete(event_type: EventType):
        event_type.is_deleted = True
        event_type.deleted_at = timezone.now()
        event_type.save()


class EventRepository:
    """Etkinlik veri erişim katmanı"""

    @staticmethod
    def get_all(kurum_id: int, filters: dict = None) -> QuerySet:
        qs = Event.objects.filter(
            kurum_id=kurum_id, is_deleted=False
        ).select_related('event_type')

        if not filters:
            return qs

        # ── Context filtreleri (Şube / Eğitim Yılı / Dönem) ──
        # Strict: belirli bir değer seçildiğinde sadece eşleşenler döner.
        # NULL kayıtlar yalnızca ilgili filtre verilmediğinde görünür.
        if filters.get('sube_id'):
            qs = qs.filter(sube_id=filters['sube_id'])
        if filters.get('egitim_yili_id'):
            from django.db.models import Q
            qs = qs.filter(
                Q(egitim_yili_id=filters['egitim_yili_id'])
                | Q(egitim_yili_id__isnull=True)
            )
        if filters.get('donem_id'):
            from django.db.models import Q
            qs = qs.filter(
                Q(donem_id=filters['donem_id'])
                | Q(donem_id__isnull=True)
            )

        # Tarih aralığı filtresi
        if filters.get('baslangic'):
            qs = qs.filter(bitis__gte=filters['baslangic'])
        if filters.get('bitis'):
            qs = qs.filter(baslangic__lte=filters['bitis'])

        # Etkinlik türü
        if filters.get('event_type_id'):
            qs = qs.filter(event_type_id=filters['event_type_id'])

        # Kategori
        if filters.get('kategori'):
            qs = qs.filter(event_type__kategori=filters['kategori'])

        # Durum
        if filters.get('durum'):
            qs = qs.filter(durum=filters['durum'])

        # Salon
        if filters.get('salon_id'):
            qs = qs.filter(salon_id=filters['salon_id'])

        # Öğretmen / Koç
        if filters.get('ogretmen_id'):
            qs = qs.filter(ogretmen_id=filters['ogretmen_id'])

        # Sınıf (JSONField içinde arama)
        if filters.get('sinif_id'):
            qs = qs.filter(sinif_ids__contains=[filters['sinif_id']])

        # Arama
        if filters.get('search'):
            qs = qs.filter(
                Q(baslik__icontains=filters['search']) |
                Q(aciklama__icontains=filters['search'])
            )

        return qs

    @staticmethod
    def get_by_id(event_id) -> Optional[Event]:
        try:
            return Event.objects.select_related('event_type').get(
                id=event_id, is_deleted=False
            )
        except Event.DoesNotExist:
            return None

    @staticmethod
    def get_by_salon(salon_id, baslangic=None, bitis=None) -> QuerySet:
        """Salon bazlı etkinlikler — çakışma kontrolü için"""
        qs = Event.objects.filter(
            salon_id=salon_id, is_deleted=False
        ).exclude(durum='CANCELLED')

        if baslangic and bitis:
            qs = qs.filter(baslangic__lt=bitis, bitis__gt=baslangic)
        return qs

    @staticmethod
    def get_by_kaynak(kaynak_modul: str, kaynak_id: str) -> Optional[Event]:
        """Dış modül referansı ile etkinlik bul"""
        try:
            return Event.objects.get(
                kaynak_modul=kaynak_modul,
                kaynak_id=str(kaynak_id),
                is_deleted=False,
            )
        except Event.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> Event:
        valid_fields = {f.name for f in Event._meta.get_fields() if hasattr(f, 'column')}
        # FK alanı için _id suffix'li key'leri de kabul et (event_type_id → event_type_id column)
        clean = {}
        for k, v in data.items():
            if k in valid_fields:
                clean[k] = v
            elif k.endswith('_id'):
                base = k[:-3]  # event_type_id → event_type
                if base in valid_fields:
                    clean[k] = v  # Django event_type_id şeklinde de kabul eder
        return Event.objects.create(**clean)

    @staticmethod
    def update(event: Event, data: dict) -> Event:
        valid_fields = {f.name for f in Event._meta.get_fields() if hasattr(f, 'column')}
        for key, value in data.items():
            if key in valid_fields and key not in ('id', 'created_at'):
                setattr(event, key, value)
            elif key.endswith('_id'):
                base = key[:-3]
                if base in valid_fields and key not in ('id',):
                    setattr(event, key, value)
        event.save()
        return event

    @staticmethod
    def soft_delete(event: Event):
        event.is_deleted = True
        event.deleted_at = timezone.now()
        event.save()
        # Alt etkinlikleri de sil
        Event.objects.filter(parent_event=event, is_deleted=False).update(
            is_deleted=True, deleted_at=timezone.now()
        )

    @staticmethod
    def check_conflict(kurum_id: int, salon_id, baslangic, bitis, exclude_id=None) -> bool:
        """Salon çakışması kontrolü"""
        if not salon_id:
            return False
        qs = Event.objects.filter(
            kurum_id=kurum_id,
            salon_id=salon_id,
            is_deleted=False,
            baslangic__lt=bitis,
            bitis__gt=baslangic,
        ).exclude(durum='CANCELLED')
        if exclude_id:
            qs = qs.exclude(id=exclude_id)
        return qs.exists()


class ReminderRepository:
    """Hatırlatma veri erişim katmanı"""

    @staticmethod
    def get_by_event(event_id) -> QuerySet:
        return Reminder.objects.filter(event_id=event_id)

    @staticmethod
    def create(data: dict) -> Reminder:
        return Reminder.objects.create(**data)

    @staticmethod
    def bulk_create(reminders_data: list):
        objs = [Reminder(**d) for d in reminders_data]
        return Reminder.objects.bulk_create(objs)

    @staticmethod
    def delete_by_event(event_id):
        Reminder.objects.filter(event_id=event_id).delete()

    @staticmethod
    def get_pending(before: datetime = None) -> QuerySet:
        qs = Reminder.objects.filter(durum='PENDING')
        if before:
            qs = qs.filter(hatirlatma_zamani__lte=before)
        return qs.select_related('event')


class ReminderSettingRepository:
    """Hatırlatma ayarları veri erişim katmanı"""

    @staticmethod
    def get_all(kurum_id: int) -> QuerySet:
        return ReminderSetting.objects.filter(
            kurum_id=kurum_id
        ).select_related('event_type')

    @staticmethod
    def get_by_event_type(kurum_id: int, event_type_id) -> QuerySet:
        return ReminderSetting.objects.filter(
            kurum_id=kurum_id,
            event_type_id=event_type_id,
            is_active=True,
        )

    @staticmethod
    def get_by_id(setting_id) -> Optional[ReminderSetting]:
        try:
            return ReminderSetting.objects.select_related('event_type').get(id=setting_id)
        except ReminderSetting.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> ReminderSetting:
        return ReminderSetting.objects.create(**data)

    @staticmethod
    def update(setting: ReminderSetting, data: dict) -> ReminderSetting:
        for key, value in data.items():
            if key not in ('id', 'created_at'):
                setattr(setting, key, value)
        setting.save()
        return setting

    @staticmethod
    def delete(setting: ReminderSetting):
        setting.delete()


class AppNotificationRepository:
    """Uygulama içi bildirim veri erişim katmanı"""

    @staticmethod
    def get_screen_messages(user_id: int, kurum_id: int, limit: int = 10) -> QuerySet:
        return AppNotification.objects.filter(
            user_id=user_id,
            kurum_id=kurum_id,
            ekran_mesaji=True,
            ekran_gosterildi=False,
        ).order_by('-created_at')[:limit]

    @staticmethod
    def mark_ekran_gosterildi(notification_id):
        AppNotification.objects.filter(
            id=notification_id, ekran_gosterildi=False,
        ).update(ekran_gosterildi=True)

    @staticmethod
    def get_by_user(user_id: int, kurum_id: int, unread_only: bool = False,
                    limit: int = 50) -> QuerySet:
        qs = AppNotification.objects.filter(
            user_id=user_id, kurum_id=kurum_id,
        ).select_related('event')
        if unread_only:
            qs = qs.filter(is_read=False)
        return qs[:limit]

    @staticmethod
    def get_unread_count(user_id: int, kurum_id: int) -> int:
        return AppNotification.objects.filter(
            user_id=user_id, kurum_id=kurum_id, is_read=False,
        ).count()

    @staticmethod
    def get_by_id(notification_id) -> Optional[AppNotification]:
        try:
            return AppNotification.objects.get(id=notification_id)
        except AppNotification.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> AppNotification:
        return AppNotification.objects.create(**data)

    @staticmethod
    def bulk_create(notifications_data: list) -> list:
        objs = [AppNotification(**d) for d in notifications_data]
        return AppNotification.objects.bulk_create(objs)

    @staticmethod
    def mark_as_read(notification_id):
        AppNotification.objects.filter(id=notification_id, is_read=False).update(
            is_read=True, read_at=timezone.now()
        )

    @staticmethod
    def mark_all_as_read(user_id: int, kurum_id: int):
        AppNotification.objects.filter(
            user_id=user_id, kurum_id=kurum_id, is_read=False,
        ).update(is_read=True, read_at=timezone.now())

    @staticmethod
    def delete_old(days: int = 90):
        """Eski bildirimleri temizle"""
        cutoff = timezone.now() - timedelta(days=days)
        AppNotification.objects.filter(created_at__lt=cutoff).delete()


class NotificationLogRepository:
    """Bildirim log veri erişim katmanı"""

    @staticmethod
    def create(data: dict) -> NotificationLog:
        return NotificationLog.objects.create(**data)

    @staticmethod
    def bulk_create(logs_data: list) -> list:
        objs = [NotificationLog(**d) for d in logs_data]
        return NotificationLog.objects.bulk_create(objs)

    @staticmethod
    def get_by_event(event_id) -> QuerySet:
        return NotificationLog.objects.filter(event_id=event_id)

    @staticmethod
    def get_by_reminder(reminder_id) -> QuerySet:
        return NotificationLog.objects.filter(reminder_id=reminder_id)

    @staticmethod
    def get_failed(kurum_id: int = None) -> QuerySet:
        qs = NotificationLog.objects.filter(durum='FAILED')
        if kurum_id:
            qs = qs.filter(kurum_id=kurum_id)
        return qs.filter(deneme_sayisi__lt=models.F('max_deneme'))

    @staticmethod
    def get_stats(kurum_id: int, days: int = 30) -> dict:
        """Son X gündeki bildirim istatistikleri"""
        cutoff = timezone.now() - timedelta(days=days)
        qs = NotificationLog.objects.filter(
            kurum_id=kurum_id, created_at__gte=cutoff,
        )
        total = qs.count()
        sent = qs.filter(durum__in=['SENT', 'DELIVERED', 'READ']).count()
        failed = qs.filter(durum='FAILED').count()
        by_channel = {}
        for row in qs.values('kanal').annotate(cnt=Count('id')):
            by_channel[row['kanal']] = row['cnt']
        return {
            'toplam': total,
            'basarili': sent,
            'basarisiz': failed,
            'kanal_dagilimi': by_channel,
        }


class UserNotificationPreferenceRepository:
    """Kullanıcı bildirim tercihleri veri erişim katmanı"""

    @staticmethod
    def get_by_user(user_id: int, kurum_id: int) -> QuerySet:
        return UserNotificationPreference.objects.filter(
            user_id=user_id, kurum_id=kurum_id,
        ).select_related('event_type')

    @staticmethod
    def get_for_event_type(user_id: int, kurum_id: int,
                           event_type_id=None) -> Optional[UserNotificationPreference]:
        """Belirli etkinlik türü için tercihi bul, yoksa genel tercihi dene"""
        # Önce spesifik tür tercihi
        if event_type_id:
            try:
                return UserNotificationPreference.objects.get(
                    user_id=user_id, kurum_id=kurum_id, event_type_id=event_type_id,
                )
            except UserNotificationPreference.DoesNotExist:
                pass
        # Genel tercih
        try:
            return UserNotificationPreference.objects.get(
                user_id=user_id, kurum_id=kurum_id, event_type__isnull=True,
            )
        except UserNotificationPreference.DoesNotExist:
            return None

    @staticmethod
    def create(data: dict) -> UserNotificationPreference:
        return UserNotificationPreference.objects.create(**data)

    @staticmethod
    def update(pref: UserNotificationPreference, data: dict) -> UserNotificationPreference:
        for key, value in data.items():
            if key not in ('id', 'created_at', 'user_id', 'kurum_id'):
                setattr(pref, key, value)
        pref.save()
        return pref

    @staticmethod
    def delete(pref: UserNotificationPreference):
        pref.delete()
