/**
 * Takvim Modülü — API Client
 *
 * Backend: /takvim/api/
 */
import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from './api';

const BASE = '/takvim/api';

/* ════════════════════════════════════════════
   TYPE DEFINITIONS
   ════════════════════════════════════════════ */

export type EventCategory =
  | 'DENEME' | 'ETUT' | 'GORUSME' | 'DERS'
  | 'TOPLANTI' | 'ETKINLIK' | 'TATIL' | 'ODEV' | 'CALISMA' | 'GOREV' | 'DIGER';

export type EventStatus =
  | 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type RecurrenceType =
  | 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

export type ReminderUnit = 'MINUTES' | 'HOURS' | 'DAYS';

export interface EventType {
  id: string;
  ad: string;
  kategori: EventCategory;
  renk: string;
  ikon: string;
  varsayilan_sure_dk: number;
  is_system: boolean;
  is_active: boolean;
  varsayilan_mi?: boolean;
  sira: number;
  etkinlik_sayisi?: number;
}

export interface CalendarEvent {
  id: string;
  baslik: string;
  aciklama: string;
  durum: EventStatus;
  baslangic: string;
  bitis: string;
  tum_gun: boolean;
  tekrar_tipi: RecurrenceType;
  tekrar_bitis: string | null;
  parent_event_id: string | null;
  salon_id: string | null;
  salon_adi: string;
  konum: string;
  sinif_ids: number[];
  ogretmen_id: number | null;
  ogrenci_ids: number[];
  kaynak_modul: string;
  kaynak_id: string;
  renk: string;
  event_type: EventType | null;
  event_type_id: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  reminders?: Reminder[];
}

/** FullCalendar uyumlu compact format */
export interface FCEventExtendedProps {
  durum?: string;
  event_type_id?: string;
  kategori?: string;
  ikon?: string;
  salon_adi?: string;
  ogretmen_id?: number | null;
  kaynak_modul?: string;
  kaynak_id?: string | number;
  atama_id?: string | number;
  kaynak?: string;
}

export interface FCEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  extendedProps: FCEventExtendedProps;
}

export interface Reminder {
  id: string;
  event_id: string;
  miktar: number;
  birim: ReminderUnit;
  hatirlatma_zamani: string;
  durum: string;
}

export interface ReminderSetting {
  id: string;
  event_type_id: string;
  event_type_ad: string;
  event_type_renk: string;
  event_type_ikon: string;
  miktar: number;
  birim: ReminderUnit;
  kanallar: NotificationChannel[];
  alici_tipler: RecipientType[];
  is_active: boolean;
}

/* ── Bildirim türleri ── */

export type NotificationChannel = 'APP' | 'SMS' | 'EMAIL';
export type RecipientType = 'OGRENCI' | 'OGRETMEN' | 'VELI' | 'PERSONEL';

export interface AppNotification {
  id: string;
  baslik: string;
  mesaj: string;
  ikon: string;
  renk: string;
  url: string;
  event_id: string | null;
  is_read: boolean;
  ekran_mesaji?: boolean;
  read_at: string | null;
  created_at: string;
  alici_tip: RecipientType;
}

export interface NotificationSummary {
  unread_count: number;
  recent: AppNotification[];
}

export interface NotificationLog {
  id: string;
  event_id: string | null;
  user_id: number;
  alici_tip: RecipientType;
  kanal: NotificationChannel;
  durum: string;
  baslik: string;
  mesaj: string;
  hata_mesaji: string;
  deneme_sayisi: number;
  sent_at: string | null;
  created_at: string;
}

export interface NotificationStats {
  toplam: number;
  basarili: number;
  basarisiz: number;
  kanal_dagilimi: Record<string, number>;
}

export interface UserNotificationPreference {
  id: string;
  event_type_id: string | null;
  event_type_ad: string;
  event_type_renk: string;
  event_type_ikon: string;
  app_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  sessiz_baslangic: string | null;
  sessiz_bitis: string | null;
}


/* ════════════════════════════════════════════
   ETKİNLİK TÜRLERİ
   ════════════════════════════════════════════ */

export async function fetchEventTypes(): Promise<ApiResponse<EventType[]>> {
  return apiGet<EventType[]>(`${BASE}/turler/`);
}

export async function createEventType(data: Partial<EventType>): Promise<ApiResponse<EventType>> {
  return apiPost<EventType>(`${BASE}/turler/`, data);
}

export async function updateEventType(id: string, data: Partial<EventType>): Promise<ApiResponse<EventType>> {
  return apiPut<EventType>(`${BASE}/turler/${id}/`, data);
}

export async function deleteEventType(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/turler/${id}/`);
}

export async function seedEventTypes(): Promise<ApiResponse<EventType[]>> {
  return apiGet<EventType[]>(`${BASE}/turler/seed/`);
}


/* ════════════════════════════════════════════
   ETKİNLİKLER
   ════════════════════════════════════════════ */

export interface EventFilters {
  baslangic?: string;
  bitis?: string;
  event_type_id?: string;
  kategori?: string;
  durum?: string;
  salon_id?: string;
  ogretmen_id?: number;
  sinif_id?: number;
  search?: string;
  compact?: boolean;
  donem_id?: number;
}

export async function fetchEvents(filters?: EventFilters): Promise<ApiResponse<CalendarEvent[]>> {
  const query = new URLSearchParams();
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.set(k, String(v));
      }
    });
  }
  const qs = query.toString();
  return apiGet<CalendarEvent[]>(`${BASE}/etkinlikler/${qs ? '?' + qs : ''}`);
}

export async function fetchEventsCompact(filters?: EventFilters): Promise<ApiResponse<FCEvent[]>> {
  const query = new URLSearchParams();
  query.set('compact', 'true');
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.set(k, String(v));
      }
    });
  }
  return apiGet<FCEvent[]>(`${BASE}/etkinlikler/?${query.toString()}`);
}

export async function fetchEventDetail(id: string): Promise<ApiResponse<CalendarEvent>> {
  return apiGet<CalendarEvent>(`${BASE}/etkinlikler/${id}/`);
}

export async function createEvent(data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
  return apiPost<CalendarEvent>(`${BASE}/etkinlikler/`, data);
}

export async function updateEvent(id: string, data: Partial<CalendarEvent>): Promise<ApiResponse<CalendarEvent>> {
  return apiPut<CalendarEvent>(`${BASE}/etkinlikler/${id}/`, data);
}

export async function deleteEvent(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/etkinlikler/${id}/`);
}

export async function moveEvent(id: string, baslangic: string, bitis: string): Promise<ApiResponse<FCEvent>> {
  return apiPost<FCEvent>(`${BASE}/etkinlikler/${id}/tasi/`, { baslangic, bitis });
}

export async function resizeEvent(id: string, bitis: string): Promise<ApiResponse<FCEvent>> {
  return apiPost<FCEvent>(`${BASE}/etkinlikler/${id}/resize/`, { bitis });
}

export async function changeEventStatus(id: string, durum: EventStatus): Promise<ApiResponse<CalendarEvent>> {
  return apiPost<CalendarEvent>(`${BASE}/etkinlikler/${id}/durum/`, { durum });
}


/* ════════════════════════════════════════════
   HATIRLATMA AYARLARI
   ════════════════════════════════════════════ */

export async function fetchReminderSettings(): Promise<ApiResponse<ReminderSetting[]>> {
  return apiGet<ReminderSetting[]>(`${BASE}/hatirlatma-ayarlari/`);
}

export async function createReminderSetting(data: Partial<ReminderSetting>): Promise<ApiResponse<ReminderSetting>> {
  return apiPost<ReminderSetting>(`${BASE}/hatirlatma-ayarlari/`, data);
}

export async function updateReminderSetting(id: string, data: Partial<ReminderSetting>): Promise<ApiResponse<ReminderSetting>> {
  return apiPut<ReminderSetting>(`${BASE}/hatirlatma-ayarlari/${id}/`, data);
}

export async function deleteReminderSetting(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/hatirlatma-ayarlari/${id}/`);
}


/* ════════════════════════════════════════════
   SABİTLER
   ════════════════════════════════════════════ */

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  DENEME: 'Deneme Sınavı',
  ETUT: 'Etüt',
  GORUSME: 'Koç Görüşmesi',
  DERS: 'Ders',
  TOPLANTI: 'Toplantı',
  ETKINLIK: 'Kurum Etkinliği',
  TATIL: 'Tatil / İzin',
  ODEV: 'Ödev',
  CALISMA: 'Çalışma Programı',
  GOREV: 'Görev',
  DIGER: 'Diğer',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, { label: string; color: string }> = {
  DRAFT:       { label: 'Taslak',        color: '#9CA3AF' },
  SCHEDULED:   { label: 'Planlandı',     color: '#3B82F6' },
  IN_PROGRESS: { label: 'Devam Ediyor',  color: '#F59E0B' },
  COMPLETED:   { label: 'Tamamlandı',    color: '#10B981' },
  CANCELLED:   { label: 'İptal Edildi',  color: '#EF4444' },
};

export const REMINDER_UNIT_LABELS: Record<ReminderUnit, string> = {
  MINUTES: 'Dakika',
  HOURS: 'Saat',
  DAYS: 'Gün',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  APP: 'Uygulama',
  SMS: 'SMS',
  EMAIL: 'E-posta',
};

export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  OGRENCI: 'Öğrenci',
  OGRETMEN: 'Öğretmen / Koç',
  VELI: 'Veli',
  PERSONEL: 'Personel',
};


/* ════════════════════════════════════════════
   BİLDİRİMLER (kullanıcı tarafı)
   ════════════════════════════════════════════ */

export async function fetchNotifications(unreadOnly = false, limit = 50): Promise<ApiResponse<AppNotification[]>> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unread_only', 'true');
  if (limit !== 50) params.set('limit', String(limit));
  const qs = params.toString();
  return apiGet<AppNotification[]>(`${BASE}/bildirimler/${qs ? '?' + qs : ''}`);
}

export async function fetchNotificationSummary(): Promise<ApiResponse<NotificationSummary>> {
  return apiGet<NotificationSummary>(`${BASE}/bildirimler/ozet/`);
}

export async function fetchScreenNotifications(limit = 5): Promise<ApiResponse<AppNotification[]>> {
  return apiGet<AppNotification[]>(`${BASE}/bildirimler/ekran/?limit=${limit}`);
}

export async function markScreenNotificationShown(id: string): Promise<ApiResponse<void>> {
  return apiPost<void>(`${BASE}/bildirimler/${id}/ekran-gosterildi/`, {});
}

export async function markNotificationRead(id: string): Promise<ApiResponse<void>> {
  return apiPost<void>(`${BASE}/bildirimler/${id}/oku/`, {});
}

export async function markAllNotificationsRead(): Promise<ApiResponse<void>> {
  return apiPost<void>(`${BASE}/bildirimler/hepsini-oku/`, {});
}


/* ════════════════════════════════════════════
   BİLDİRİM LOGLARI (admin)
   ════════════════════════════════════════════ */

export async function fetchNotificationLogs(eventId?: string): Promise<ApiResponse<NotificationLog[]>> {
  const qs = eventId ? `?event_id=${eventId}` : '';
  return apiGet<NotificationLog[]>(`${BASE}/bildirim-loglar/${qs}`);
}

export async function fetchNotificationStats(days = 30): Promise<ApiResponse<NotificationStats>> {
  return apiGet<NotificationStats>(`${BASE}/bildirim-loglar/istatistik/?days=${days}`);
}


/* ════════════════════════════════════════════
   KULLANICI BİLDİRİM TERCİHLERİ
   ════════════════════════════════════════════ */

export async function fetchNotificationPreferences(): Promise<ApiResponse<UserNotificationPreference[]>> {
  return apiGet<UserNotificationPreference[]>(`${BASE}/bildirim-tercihleri/`);
}

export async function upsertNotificationPreference(data: Partial<UserNotificationPreference>): Promise<ApiResponse<UserNotificationPreference>> {
  return apiPost<UserNotificationPreference>(`${BASE}/bildirim-tercihleri/`, data);
}

export async function deleteNotificationPreference(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/bildirim-tercihleri/${id}/`);
}
