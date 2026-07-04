"""
Takvim modülü — Bildirim Servisleri

Sorumluluklar:
1. RecipientResolver: Event → alıcı listesi çıkarır
2. NotificationDispatcher: Kanal yönlendirme + gönderim
3. AppNotificationService: In-app bildirim CRUD
4. UserPreferenceService: Kullanıcı tercihleri yönetimi
5. ReminderProcessor: Pending reminder'ları işler
"""
import logging
from datetime import timedelta
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.takvim.domain.models import (
    Event, Reminder, ReminderSetting,
    AppNotification, NotificationLog, UserNotificationPreference,
)
from apps.takvim.domain.enums import (
    NotificationChannel, NotificationStatus, RecipientType, ReminderStatus,
)
from apps.takvim.infrastructure.repository import (
    ReminderRepository,
    AppNotificationRepository,
    NotificationLogRepository,
    UserNotificationPreferenceRepository,
)


logger = logging.getLogger('takvim.notification')


# ══════════════════════════════════════════════════════════
# ALICI BELİRLEME SERVİSİ
# ══════════════════════════════════════════════════════════

class RecipientResolver:
    """
    Etkinlikten bildirim alıcılarını belirler.

    Mantık:
    - Event.ogrenci_ids → OGRENCI tipi alıcılar
    - Event.ogretmen_id → OGRETMEN tipi alıcı
    - Event.sinif_ids varsa → ilgili sınıftaki öğrenciler (opsiyonel genişleme)
    - Event.created_by → etkinliği oluşturan (opsiyonel)

    Return: [{'user_id': int, 'alici_tip': str}, ...]
    """

    @staticmethod
    def resolve(event: Event, alici_tipler: list = None) -> list:
        """
        Etkinlikten alıcı listesini çıkar.
        alici_tipler: ['OGRENCI', 'OGRETMEN', 'VELI'] gibi filtre.
        Boşsa tüm ilgilileri dahil eder.
        """
        recipients = []
        seen = set()  # Tekrar engelleme

        allowed = set(alici_tipler) if alici_tipler else None

        # Öğrenciler
        if not allowed or RecipientType.OGRENCI in allowed:
            for oid in (event.ogrenci_ids or []):
                key = (oid, RecipientType.OGRENCI)
                if key not in seen:
                    seen.add(key)
                    recipients.append({
                        'user_id': oid,
                        'alici_tip': RecipientType.OGRENCI,
                    })

        # Öğretmen / Koç
        if not allowed or RecipientType.OGRETMEN in allowed:
            if event.ogretmen_id:
                key = (event.ogretmen_id, RecipientType.OGRETMEN)
                if key not in seen:
                    seen.add(key)
                    recipients.append({
                        'user_id': event.ogretmen_id,
                        'alici_tip': RecipientType.OGRETMEN,
                    })

        return recipients


# ══════════════════════════════════════════════════════════
# BİLDİRİM GÖNDERIM SERVİSİ (DISPATCHER)
# ══════════════════════════════════════════════════════════

class NotificationDispatcher:
    """
    Bildirim kanallarına yönlendirme ve gönderim.
    Her kanal için bir sender metodu vardır.
    """

    def __init__(self):
        self.log_repo = NotificationLogRepository()
        self.app_repo = AppNotificationRepository()

    def dispatch(self, event: Event, reminder: Reminder,
                 recipients: list, kanallar: list) -> dict:
        """
        Alıcılara belirtilen kanallardan bildirim gönder.

        Returns: {'sent': int, 'failed': int, 'skipped': int}
        """
        stats = {'sent': 0, 'failed': 0, 'skipped': 0}

        baslik = self._build_title(event, reminder)
        mesaj = self._build_message(event, reminder)

        for recipient in recipients:
            user_id = recipient['user_id']
            alici_tip = recipient['alici_tip']

            # Kullanıcı tercihlerini kontrol et
            pref = UserNotificationPreferenceRepository.get_for_event_type(
                user_id=user_id,
                kurum_id=event.kurum_id,
                event_type_id=event.event_type_id,
            )

            # Sessiz saat kontrolü
            if pref and self._is_quiet_hours(pref):
                stats['skipped'] += 1
                continue

            for kanal in kanallar:
                # Kullanıcı bu kanalı kapatmış mı?
                if pref and not self._is_channel_enabled(pref, kanal):
                    stats['skipped'] += 1
                    continue

                try:
                    success = self._send(
                        kanal=kanal,
                        user_id=user_id,
                        alici_tip=alici_tip,
                        baslik=baslik,
                        mesaj=mesaj,
                        event=event,
                        reminder=reminder,
                    )
                    # Log kaydet
                    self._log(
                        event=event,
                        reminder=reminder,
                        user_id=user_id,
                        alici_tip=alici_tip,
                        kanal=kanal,
                        baslik=baslik,
                        mesaj=mesaj,
                        success=success,
                    )
                    if success:
                        stats['sent'] += 1
                    else:
                        stats['failed'] += 1
                except Exception as e:
                    logger.error(f"Bildirim gönderim hatası: {kanal} → user {user_id}: {e}")
                    self._log(
                        event=event, reminder=reminder,
                        user_id=user_id, alici_tip=alici_tip,
                        kanal=kanal, baslik=baslik, mesaj=mesaj,
                        success=False, error=str(e),
                    )
                    stats['failed'] += 1

        return stats

    def _send(self, kanal: str, user_id: int, alici_tip: str,
              baslik: str, mesaj: str, event: Event,
              reminder: Reminder = None) -> bool:
        """Kanala göre gönderim yap"""
        if kanal == NotificationChannel.APP:
            return self._send_app(user_id, alici_tip, baslik, mesaj, event, reminder)
        elif kanal == NotificationChannel.WHATSAPP:
            return self._send_whatsapp(user_id, alici_tip, baslik, mesaj, event)
        elif kanal == NotificationChannel.SMS:
            return self._send_sms(user_id, baslik, mesaj)
        elif kanal == NotificationChannel.EMAIL:
            return self._send_email(user_id, baslik, mesaj)
        return False

    def _send_app(self, user_id: int, alici_tip: str, baslik: str,
                  mesaj: str, event: Event, reminder: Reminder = None) -> bool:
        """Uygulama içi bildirim oluştur"""
        try:
            ikon = event.event_type.ikon if event.event_type_id else '🔔'
            renk = event.etkinlik_renk

            self.app_repo.create({
                'kurum_id': event.kurum_id,
                'user_id': user_id,
                'alici_tip': alici_tip,
                'baslik': baslik,
                'mesaj': mesaj,
                'ikon': ikon,
                'renk': renk,
                'url': f'/admin/takvim/genel?event={event.id}',
                'event': event,
                'reminder': reminder,
            })
            return True
        except Exception as e:
            logger.error(f"App bildirim hatası: {e}")
            return False

    def _send_sms(self, user_id: int, baslik: str, mesaj: str) -> bool:
        """SMS gönder — placeholder, SMS entegrasyonu eklendiğinde dolacak."""
        logger.info(f"[SMS] User {user_id}: {baslik}")
        # TODO: NetGSM/Twilio entegrasyonu
        return True  # Placeholder

    def _send_whatsapp(
        self,
        user_id: int,
        alici_tip: str,
        baslik: str,
        mesaj: str,
        event: Event,
    ) -> bool:
        """WhatsApp — veli telefonu üzerinden CommunicationService kuyruğuna ekler."""
        from apps.communication.application.integration_hooks import send_text_to_veli

        body = f'{baslik}\n\n{mesaj}' if baslik else mesaj
        source_id = f'takvim-{event.id}-{user_id}'

        try:
            if alici_tip == RecipientType.OGRENCI:
                from apps.ogrenci.domain.models import OgrenciVeli

                veli = (
                    OgrenciVeli.objects.filter(ogrenci_id=user_id)
                    .exclude(telefon='')
                    .first()
                )
                if not veli:
                    logger.info('[WHATSAPP] Öğrenci %s için veli telefonu yok', user_id)
                    return False
                result = send_text_to_veli(
                    event.kurum_id,
                    veli.id,
                    body,
                    'duyuru',
                    'takvim',
                    source_id,
                )
            else:
                logger.info('[WHATSAPP] Desteklenmeyen alıcı tipi: %s', alici_tip)
                return False

            return bool(result and result.success)
        except Exception as exc:
            logger.error('[WHATSAPP] Takvim bildirim hatası: %s', exc)
            return False

    def _send_email(self, user_id: int, baslik: str, mesaj: str) -> bool:
        """E-posta gönder — placeholder, email entegrasyonu eklendiğinde dolacak"""
        logger.info(f"[EMAIL] User {user_id}: {baslik}")
        # TODO: Django send_mail entegrasyonu
        return True  # Placeholder

    def _log(self, event, reminder, user_id, alici_tip, kanal,
             baslik, mesaj, success, error=''):
        """Bildirim logunu kaydet"""
        try:
            self.log_repo.create({
                'kurum_id': event.kurum_id,
                'event': event,
                'reminder': reminder,
                'user_id': user_id,
                'alici_tip': alici_tip,
                'kanal': kanal,
                'durum': NotificationStatus.SENT if success else NotificationStatus.FAILED,
                'baslik': baslik,
                'mesaj': mesaj,
                'hata_mesaji': error,
                'deneme_sayisi': 1,
                'sent_at': timezone.now() if success else None,
            })
        except Exception as e:
            logger.error(f"Log kaydetme hatası: {e}")

    @staticmethod
    def _build_title(event: Event, reminder: Reminder = None) -> str:
        """Bildirim başlığını oluştur"""
        tur_ad = event.event_type.ad if event.event_type_id else 'Etkinlik'
        if reminder:
            if reminder.miktar == 0:
                return f"🔔 {tur_ad} başladı!"
            unit_labels = {'MINUTES': 'dk', 'HOURS': 'saat', 'DAYS': 'gün'}
            unit = unit_labels.get(reminder.birim, '')
            return f"⏰ {reminder.miktar} {unit} sonra: {tur_ad}"
        return f"📅 {tur_ad}: {event.baslik}"

    @staticmethod
    def _build_message(event: Event, reminder: Reminder = None) -> str:
        """Bildirim mesajını oluştur"""
        parts = [event.baslik]
        if event.baslangic:
            parts.append(f"📅 {event.baslangic.strftime('%d.%m.%Y %H:%M')}")
        if event.salon_adi:
            parts.append(f"📍 {event.salon_adi}")
        if event.aciklama:
            parts.append(event.aciklama[:200])
        return ' | '.join(parts)

    @staticmethod
    def _is_quiet_hours(pref: UserNotificationPreference) -> bool:
        """Sessiz saat kontrolü"""
        if not pref.sessiz_baslangic or not pref.sessiz_bitis:
            return False
        now = timezone.localtime().time()
        start = pref.sessiz_baslangic
        end = pref.sessiz_bitis
        if start <= end:
            return start <= now <= end
        # Gece yarısını geçen aralık (23:00 - 07:00)
        return now >= start or now <= end

    @staticmethod
    def _is_channel_enabled(pref: UserNotificationPreference, kanal: str) -> bool:
        """Kullanıcının bu kanalı açık mı?"""
        if kanal == NotificationChannel.APP:
            return pref.app_enabled
        elif kanal == NotificationChannel.SMS:
            return pref.sms_enabled
        elif kanal == NotificationChannel.EMAIL:
            return pref.email_enabled
        elif kanal == NotificationChannel.WHATSAPP:
            return getattr(pref, 'whatsapp_enabled', True)
        return True


# ══════════════════════════════════════════════════════════
# HATIRATMA İŞLEYİCİ
# ══════════════════════════════════════════════════════════

class ReminderProcessor:
    """
    Pending reminder'ları kontrol edip bildirim gönderen servis.
    Management command veya Celery task tarafından çağrılır.
    """

    def __init__(self):
        self.dispatcher = NotificationDispatcher()

    def process_pending(self) -> dict:
        """
        Zamanı gelmiş tüm pending reminder'ları işle.
        Returns: {'processed': int, 'sent': int, 'failed': int, 'skipped': int}
        """
        now = timezone.now()
        pending = ReminderRepository.get_pending(before=now)

        totals = {'processed': 0, 'sent': 0, 'failed': 0, 'skipped': 0}

        for reminder in pending:
            try:
                event = reminder.event
                if not event or event.is_deleted or event.durum == 'CANCELLED':
                    # İptal/silinmiş etkinlik → hatırlatmayı atla
                    reminder.durum = ReminderStatus.SENT
                    reminder.save()
                    totals['processed'] += 1
                    continue

                # Alıcıları belirle
                recipients = RecipientResolver.resolve(event)
                if not recipients:
                    reminder.durum = ReminderStatus.SENT
                    reminder.save()
                    totals['processed'] += 1
                    continue

                # Kanal belirleme: reminder'ın kanalı veya varsayılan APP
                kanallar = [reminder.kanal] if reminder.kanal else [NotificationChannel.APP]

                # Gönder
                stats = self.dispatcher.dispatch(
                    event=event,
                    reminder=reminder,
                    recipients=recipients,
                    kanallar=kanallar,
                )

                # Reminder'ı güncelle
                if stats['failed'] == 0:
                    reminder.durum = ReminderStatus.SENT
                else:
                    reminder.durum = ReminderStatus.FAILED
                reminder.save()

                totals['processed'] += 1
                totals['sent'] += stats['sent']
                totals['failed'] += stats['failed']
                totals['skipped'] += stats['skipped']

            except Exception as e:
                logger.error(f"Reminder {reminder.id} işlenirken hata: {e}")
                reminder.durum = ReminderStatus.FAILED
                reminder.save()
                totals['processed'] += 1
                totals['failed'] += 1

        logger.info(
            f"ReminderProcessor: {totals['processed']} işlendi, "
            f"{totals['sent']} gönderildi, {totals['failed']} başarısız, "
            f"{totals['skipped']} atlandı"
        )
        return totals


# ══════════════════════════════════════════════════════════
# UYGULAMA BİLDİRİM SERVİSİ (API katmanı için)
# ══════════════════════════════════════════════════════════

class AppNotificationService:
    """Uygulama içi bildirim yönetimi"""

    def __init__(self):
        self.repo = AppNotificationRepository()

    def get_notifications(self, user_id: int, kurum_id: int,
                          unread_only: bool = False, limit: int = 50) -> list:
        return list(self.repo.get_by_user(user_id, kurum_id, unread_only, limit))

    def get_unread_count(self, user_id: int, kurum_id: int) -> int:
        return self.repo.get_unread_count(user_id, kurum_id)

    def mark_as_read(self, notification_id):
        self.repo.mark_as_read(notification_id)

    def mark_all_as_read(self, user_id: int, kurum_id: int):
        self.repo.mark_all_as_read(user_id, kurum_id)

    def get_summary(self, user_id: int, kurum_id: int) -> dict:
        """Bildirim özeti — header badge için (yalnızca okunmamışlar)"""
        count = self.repo.get_unread_count(user_id, kurum_id)
        recent = list(self.repo.get_by_user(user_id, kurum_id, unread_only=True, limit=10))
        return {
            'unread_count': count,
            'recent': recent,
        }

    def get_screen_messages(self, user_id: int, kurum_id: int, limit: int = 10) -> list:
        return list(self.repo.get_screen_messages(user_id, kurum_id, limit))

    def mark_ekran_gosterildi(self, notification_id):
        self.repo.mark_ekran_gosterildi(notification_id)


# ══════════════════════════════════════════════════════════
# KULLANICI TERCİH SERVİSİ
# ══════════════════════════════════════════════════════════

class UserPreferenceService:
    """Kullanıcı bildirim tercihleri yönetimi"""

    def __init__(self):
        self.repo = UserNotificationPreferenceRepository()

    def get_preferences(self, user_id: int, kurum_id: int) -> list:
        return list(self.repo.get_by_user(user_id, kurum_id))

    @transaction.atomic
    def upsert_preference(self, user_id: int, kurum_id: int, data: dict) -> UserNotificationPreference:
        """Tercih oluştur veya güncelle"""
        event_type_id = data.get('event_type_id')
        existing = self.repo.get_for_event_type(user_id, kurum_id, event_type_id)

        if existing and (
            (event_type_id and str(existing.event_type_id) == str(event_type_id))
            or (not event_type_id and existing.event_type_id is None)
        ):
            return self.repo.update(existing, data)

        data['user_id'] = user_id
        data['kurum_id'] = kurum_id
        return self.repo.create(data)

    @transaction.atomic
    def delete_preference(self, pref_id):
        pref = UserNotificationPreference.objects.filter(id=pref_id).first()
        if pref:
            self.repo.delete(pref)


# ══════════════════════════════════════════════════════════
# BİLDİRİM LOG SERVİSİ
# ══════════════════════════════════════════════════════════

class NotificationLogService:
    """Bildirim log raporları"""

    def __init__(self):
        self.repo = NotificationLogRepository()

    def get_event_logs(self, event_id) -> list:
        return list(self.repo.get_by_event(event_id))

    def get_stats(self, kurum_id: int, days: int = 30) -> dict:
        return self.repo.get_stats(kurum_id, days)
