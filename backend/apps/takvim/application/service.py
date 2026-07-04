"""
Takvim modülü — Service (İş Mantığı Katmanı)
"""
from datetime import timedelta
from dateutil.rrule import rrule, DAILY, WEEKLY, MONTHLY

from django.db import transaction
from django.utils import timezone

from apps.takvim.domain.models import (
    Event, EventType, Reminder, ReminderSetting,
)
from apps.takvim.domain.enums import (
    EventStatus, RecurrenceType, ReminderUnit,
)
from apps.takvim.infrastructure.repository import (
    EventRepository, EventTypeRepository,
    ReminderRepository, ReminderSettingRepository,
)


# ══════════════════════════════════════════════════════════
# ETKİNLİK TÜRÜ SERVİSİ
# ══════════════════════════════════════════════════════════

class EventTypeService:
    """Etkinlik türü iş mantığı"""

    def __init__(self):
        self.repo = EventTypeRepository()

    def list_types(self, kurum_id: int) -> list:
        return list(self.repo.get_all(kurum_id))

    def list_active(self, kurum_id: int) -> list:
        return list(self.repo.get_active(kurum_id))

    @transaction.atomic
    def create_type(self, kurum_id: int, data: dict) -> EventType:
        data['kurum_id'] = kurum_id
        if data.get('varsayilan_mi'):
            EventType.objects.filter(
                kurum_id=kurum_id, is_deleted=False,
            ).update(varsayilan_mi=False)
        return self.repo.create(data)

    @transaction.atomic
    def update_type(self, type_id, data: dict) -> EventType:
        event_type = self.repo.get_by_id(type_id)
        if not event_type:
            raise ValueError("Etkinlik türü bulunamadı")
        if event_type.is_system:
            allowed = {'renk', 'ikon', 'varsayilan_sure_dk', 'sira', 'varsayilan_mi'}
            data = {k: v for k, v in data.items() if k in allowed}
        if data.get('varsayilan_mi'):
            EventType.objects.filter(
                kurum_id=event_type.kurum_id, is_deleted=False,
            ).exclude(id=event_type.id).update(varsayilan_mi=False)
        return self.repo.update(event_type, data)

    def get_default_type(self, kurum_id: int):
        return EventType.objects.filter(
            kurum_id=kurum_id, is_deleted=False, is_active=True, varsayilan_mi=True,
        ).first()

    @transaction.atomic
    def delete_type(self, type_id):
        event_type = self.repo.get_by_id(type_id)
        if not event_type:
            raise ValueError("Etkinlik türü bulunamadı")
        if event_type.is_system:
            raise ValueError("Sistem türleri silinemez")
        # Bağlı etkinlik var mı?
        if Event.objects.filter(event_type=event_type, is_deleted=False).exists():
            raise ValueError("Bu türe bağlı etkinlikler var, silinemez")
        self.repo.soft_delete(event_type)

    @staticmethod
    def seed_defaults(kurum_id: int):
        """Kurum için varsayılan etkinlik türlerini oluştur"""
        defaults = [
            {'ad': 'Deneme Sınavı', 'kategori': 'DENEME', 'renk': '#EF4444', 'ikon': '📝', 'sira': 1, 'varsayilan_sure_dk': 180},
            {'ad': 'Etüt',          'kategori': 'ETUT',   'renk': '#10B981', 'ikon': '📚', 'sira': 2, 'varsayilan_sure_dk': 60},
            {'ad': 'Koç Görüşmesi', 'kategori': 'GORUSME','renk': '#8B5CF6', 'ikon': '🗣️', 'sira': 3, 'varsayilan_sure_dk': 30},
            {'ad': 'Ders',          'kategori': 'DERS',   'renk': '#3B82F6', 'ikon': '📖', 'sira': 4, 'varsayilan_sure_dk': 40},
            {'ad': 'Toplantı',      'kategori': 'TOPLANTI','renk': '#F59E0B','ikon': '🤝', 'sira': 5, 'varsayilan_sure_dk': 60},
            {'ad': 'Kurum Etkinliği','kategori': 'ETKINLIK','renk': '#EC4899','ikon': '🎉', 'sira': 6, 'varsayilan_sure_dk': 120},
            {'ad': 'Tatil / İzin',  'kategori': 'TATIL',  'renk': '#6B7280', 'ikon': '🏖️', 'sira': 7, 'varsayilan_sure_dk': 480},
            {'ad': 'Ödev',          'kategori': 'ODEV',   'renk': '#F97316', 'ikon': '📋', 'sira': 8, 'varsayilan_sure_dk': 60},
            {'ad': 'Çalışma Programı','kategori': 'CALISMA','renk': '#06B6D4','ikon': '📊', 'sira': 9, 'varsayilan_sure_dk': 120},
            {'ad': 'Görev',          'kategori': 'GOREV',  'renk': '#6366F1','ikon': '✅', 'sira': 10, 'varsayilan_sure_dk': 30},
            {'ad': 'Diğer',          'kategori': 'DIGER',  'renk': '#9CA3AF','ikon': '📌', 'sira': 11, 'varsayilan_sure_dk': 60},
        ]
        created = []
        for d in defaults:
            exists = EventType.objects.filter(
                kurum_id=kurum_id, ad=d['ad'], is_deleted=False
            ).exists()
            if not exists:
                d['kurum_id'] = kurum_id
                d['is_system'] = True
                created.append(EventType.objects.create(**d))
        return created


# ══════════════════════════════════════════════════════════
# ETKİNLİK SERVİSİ
# ══════════════════════════════════════════════════════════

class EventService:
    """Etkinlik iş mantığı"""

    def __init__(self):
        self.repo = EventRepository()

    def list_events(self, kurum_id: int, filters: dict = None) -> list:
        return list(self.repo.get_all(kurum_id, filters))

    def get_event(self, event_id):
        event = self.repo.get_by_id(event_id)
        if not event:
            raise ValueError("Etkinlik bulunamadı")
        return event

    @transaction.atomic
    def create_event(self, kurum_id: int, data: dict, user_id: int) -> Event:
        self._validate_event_data(data)

        # Salon çakışması kontrolü
        if data.get('salon_id') and not data.get('tum_gun'):
            conflict = self.repo.check_conflict(
                kurum_id, data['salon_id'],
                data['baslangic'], data['bitis'],
            )
            if conflict:
                raise ValueError("Bu salonda seçilen saatlerde başka etkinlik var")

        data['kurum_id'] = kurum_id
        data['created_by'] = user_id

        event = self.repo.create(data)

        # Tekrarlı etkinlik ise occurrence'ları oluştur
        if data.get('tekrar_tipi') and data['tekrar_tipi'] != RecurrenceType.NONE:
            self._create_occurrences(event)

        # Varsayılan hatırlatmalar oluştur
        self._create_default_reminders(event)

        return event

    @transaction.atomic
    def update_event(self, event_id, data: dict, user_id: int) -> Event:
        event = self.repo.get_by_id(event_id)
        if not event:
            raise ValueError("Etkinlik bulunamadı")

        self._validate_event_data(data, exclude_id=event_id)

        # Salon çakışması
        salon_id = data.get('salon_id', event.salon_id)
        baslangic = data.get('baslangic', event.baslangic)
        bitis = data.get('bitis', event.bitis)
        tum_gun = data.get('tum_gun', event.tum_gun)

        if salon_id and not tum_gun:
            conflict = self.repo.check_conflict(
                event.kurum_id, salon_id, baslangic, bitis,
                exclude_id=event_id,
            )
            if conflict:
                raise ValueError("Bu salonda seçilen saatlerde başka etkinlik var")

        data['updated_by'] = user_id
        event = self.repo.update(event, data)

        # Hatırlatma zamanlarını güncelle
        self._refresh_reminders(event)

        return event

    @transaction.atomic
    def delete_event(self, event_id, user_id: int):
        event = self.repo.get_by_id(event_id)
        if not event:
            raise ValueError("Etkinlik bulunamadı")
        ReminderRepository.delete_by_event(event_id)
        self.repo.soft_delete(event)

    @transaction.atomic
    def change_status(self, event_id, new_status: str, user_id: int) -> Event:
        event = self.repo.get_by_id(event_id)
        if not event:
            raise ValueError("Etkinlik bulunamadı")
        event.durum = new_status
        event.updated_by = user_id
        event.save()
        return event

    @transaction.atomic
    def move_event(self, event_id, baslangic, bitis, user_id: int) -> Event:
        """Drag & drop ile taşıma"""
        event = self.repo.get_by_id(event_id)
        if not event:
            raise ValueError("Etkinlik bulunamadı")

        if event.salon_id:
            conflict = self.repo.check_conflict(
                event.kurum_id, event.salon_id, baslangic, bitis,
                exclude_id=event_id,
            )
            if conflict:
                raise ValueError("Hedef saatte salon çakışması var")

        event.baslangic = baslangic
        event.bitis = bitis
        event.updated_by = user_id
        event.save()

        self._refresh_reminders(event)
        return event

    @transaction.atomic
    def resize_event(self, event_id, bitis, user_id: int) -> Event:
        """Resize ile süre değişikliği"""
        event = self.repo.get_by_id(event_id)
        if not event:
            raise ValueError("Etkinlik bulunamadı")

        if event.salon_id:
            conflict = self.repo.check_conflict(
                event.kurum_id, event.salon_id, event.baslangic, bitis,
                exclude_id=event_id,
            )
            if conflict:
                raise ValueError("Uzatılan süre başka etkinlikle çakışıyor")

        event.bitis = bitis
        event.updated_by = user_id
        event.save()
        return event

    def get_salon_schedule(self, kurum_id: int, salon_id, baslangic=None, bitis=None) -> list:
        """Salon planlama — belirli salonun programı"""
        return list(self.repo.get_by_salon(salon_id, baslangic, bitis))

    # ── Private helpers ──

    def _validate_event_data(self, data: dict, exclude_id=None):
        if not data.get('baslik'):
            raise ValueError("Başlık zorunludur")
        if not data.get('event_type_id'):
            raise ValueError("Etkinlik türü zorunludur")
        if not data.get('baslangic'):
            raise ValueError("Başlangıç zamanı zorunludur")
        if not data.get('bitis') and not data.get('tum_gun'):
            raise ValueError("Bitiş zamanı zorunludur")

    def _create_occurrences(self, event: Event):
        """Tekrarlı etkinliğin occurrence'larını oluştur"""
        freq_map = {
            RecurrenceType.DAILY: DAILY,
            RecurrenceType.WEEKLY: WEEKLY,
            RecurrenceType.BIWEEKLY: WEEKLY,
            RecurrenceType.MONTHLY: MONTHLY,
        }
        freq = freq_map.get(event.tekrar_tipi)
        if not freq:
            return

        interval = 2 if event.tekrar_tipi == RecurrenceType.BIWEEKLY else 1
        end_date = event.tekrar_bitis or (event.baslangic.date() + timedelta(days=90))
        duration = event.bitis - event.baslangic

        dates = list(rrule(
            freq, interval=interval,
            dtstart=event.baslangic + timedelta(days=1 if freq == DAILY else 7),
            until=end_date,
            count=52,
        ))

        for dt in dates:
            Event.objects.create(
                kurum_id=event.kurum_id,
                event_type=event.event_type,
                baslik=event.baslik,
                aciklama=event.aciklama,
                durum=EventStatus.SCHEDULED,
                baslangic=dt,
                bitis=dt + duration,
                tum_gun=event.tum_gun,
                salon_id=event.salon_id,
                salon_adi=event.salon_adi,
                sinif_ids=event.sinif_ids,
                ogretmen_id=event.ogretmen_id,
                ogrenci_ids=event.ogrenci_ids,
                parent_event=event,
                created_by=event.created_by,
            )

    def _create_default_reminders(self, event: Event):
        """Etkinlik türüne göre varsayılan hatırlatmalar oluştur"""
        settings = ReminderSettingRepository.get_by_event_type(
            event.kurum_id, event.event_type_id
        )
        reminders_data = []
        for s in settings:
            delta = _reminder_delta(s.miktar, s.birim)
            kanallar = s.get_kanallar()
            # Her kanal için ayrı reminder oluştur
            for kanal in kanallar:
                reminders_data.append({
                    'event': event,
                    'miktar': s.miktar,
                    'birim': s.birim,
                    'kanal': kanal,
                    'hatirlatma_zamani': event.baslangic - delta,
                })
        if reminders_data:
            ReminderRepository.bulk_create(reminders_data)

    def _refresh_reminders(self, event: Event):
        """Etkinlik zamanı değişince hatırlatmaları güncelle"""
        old_reminders = ReminderRepository.get_by_event(event.id)
        for r in old_reminders:
            delta = _reminder_delta(r.miktar, r.birim)
            r.hatirlatma_zamani = event.baslangic - delta
            if r.hatirlatma_zamani <= timezone.now():
                r.durum = 'SENT'
            else:
                r.durum = 'PENDING'
            r.save()


# ══════════════════════════════════════════════════════════
# HATIRLATMA AYARLARI SERVİSİ
# ══════════════════════════════════════════════════════════

class ReminderSettingService:
    """Hatırlatma ayarları iş mantığı"""

    def __init__(self):
        self.repo = ReminderSettingRepository()

    def list_settings(self, kurum_id: int) -> list:
        return list(self.repo.get_all(kurum_id))

    @transaction.atomic
    def create_setting(self, kurum_id: int, data: dict) -> ReminderSetting:
        data['kurum_id'] = kurum_id
        return self.repo.create(data)

    @transaction.atomic
    def update_setting(self, setting_id, data: dict) -> ReminderSetting:
        setting = self.repo.get_by_id(setting_id)
        if not setting:
            raise ValueError("Hatırlatma ayarı bulunamadı")
        return self.repo.update(setting, data)

    @transaction.atomic
    def delete_setting(self, setting_id):
        setting = self.repo.get_by_id(setting_id)
        if not setting:
            raise ValueError("Hatırlatma ayarı bulunamadı")
        self.repo.delete(setting)


# ── Yardımcı ──

def _reminder_delta(miktar: int, birim: str) -> timedelta:
    if birim == ReminderUnit.MINUTES:
        return timedelta(minutes=miktar)
    elif birim == ReminderUnit.HOURS:
        return timedelta(hours=miktar)
    elif birim == ReminderUnit.DAYS:
        return timedelta(days=miktar)
    return timedelta()
