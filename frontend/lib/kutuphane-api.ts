/**
 * Kütüphane Modülü API Helper
 * 
 * Kütüphane/etüt salonu yönetimi için tüm API çağrıları.
 * Context-aware: X-Kurum-ID and X-Sube-ID headers are added automatically via lib/api.ts.
 */

import { apiGet, apiPost, apiPut, apiDelete, type ApiResponse } from './api';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export type LibraryStatus = 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE';
export type SeatStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'OUT_OF_SERVICE';
export type LockerStatus = 'AVAILABLE' | 'ASSIGNED' | 'OUT_OF_SERVICE';
export type AssignmentStatus = 'ACTIVE' | 'ENDED' | 'CANCELLED';
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' | 'NOT_AT_DESK';
export type AttendanceSessionStatus = 'OPEN' | 'CLOSED';
export type AttendanceType = 'PERIOD' | 'LESSON';
export type ExemptionType = 'PERIOD' | 'FULL_DAY';
export type SessionCode = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'CUSTOM';

export interface WorkingHour {
  open: string;
  close: string;
  is_open: boolean;
}

export interface Library {
  id: string;
  kurum_id: number;
  sube_id?: number;
  sube_adi?: string;
  ad: string;
  kod: string;
  aciklama: string;
  kapasite: number;
  durum: LibraryStatus;
  calisma_saatleri: Record<string, WorkingHour>;
  kurallar: string;
  dolap_var_mi: boolean;
  dolap_sayisi: number;
  created_at: string;
  updated_at: string;
  // Stats (get_with_stats)
  toplam_masa?: number;
  aktif_masa?: number;
  dolu_masa?: number;
  bos_masa?: number;
  arizali_masa?: number;
  aktif_atama?: number;
  doluluk_yuzde?: number;
  doluluk_orani?: number;
}

export interface Seat {
  id: string;
  kutuphane_id: string;
  kutuphane_adi?: string;
  masa_no: string;
  masa_tipi: string;
  durum: SeatStatus;
  pozisyon_x: number | null;
  pozisyon_y: number | null;
  kapasite: number;
  priz_var_mi: boolean;
  lamba_var_mi: boolean;
  notlar: string;
  is_deleted: boolean;
  created_at: string;
  // Assignment info
  atanan_ogrenci?: string;
  atama_id?: string;
}

export interface Locker {
  id: string;
  kurum_id: number;
  dolap_no: string;
  boyut: string;
  kilit_tipi: string;
  durum: LockerStatus;
  anahtar_no?: string;
  notlar: string;
  is_deleted: boolean;
  created_at: string;
  // Assignment info
  atanan_ogrenci?: string;
  atama_id?: string;
}

export interface SessionDefinition {
  id: string;
  kutuphane_id: string;
  oturum_kodu: string;
  oturum_adi: string;
  baslangic_saati: string;
  bitis_saati: string;
  aktif_mi: boolean;
  created_at: string;
}

export interface SeatAssignment {
  id: string;
  kutuphane_id: string;
  kutuphane_adi?: string;
  masa_id: string;
  masa_no?: string;
  ogrenci_id: number;
  ogrenci_adi?: string;
  atama_tipi: string;
  durum: AssignmentStatus;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
  notlar: string;
  created_at: string;
}

export interface LockerAssignment {
  id: string;
  kurum_id: number;
  dolap_id: string;
  dolap_no?: string;
  ogrenci_id: number;
  ogrenci_adi?: string;
  atama_tipi: string;
  durum: AssignmentStatus;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
  depozit_odendi: boolean;
  anahtar_verildi: boolean;
  notlar: string;
  created_at: string;
}

export interface AttendanceSession {
  id: string;
  kutuphane_id: string;
  periyot_kodu: SessionCode;
  oturum_adi?: string;
  oturum_kodu?: SessionCode;
  tarih: string;
  yoklama_tipi: AttendanceType;
  ders_no: number | null;
  durum: AttendanceSessionStatus;
  acan_kullanici_id: number | null;
  kapatan_kullanici_id: number | null;
  acilis_zamani: string;
  kapanis_zamani: string | null;
  notlar: string;
  sube_ders_programi_id?: string | null;
  toplam_kayit?: number;
  katilim_orani?: number;
}

export interface AttendanceRecord {
  id: string;
  yoklama_oturumu_id: string;
  ogrenci_id: number;
  ogrenci_adi?: string;
  seat_id?: string;
  masa_no?: string;
  durum: AttendanceStatus;
  giris_zamani: string | null;
  cikis_zamani: string | null;
  giris_saati: string | null;
  cikis_saati: string | null;
  izinli_mi: boolean;
  notlar: string;
  notification_status?: Record<'ABSENT' | 'LATE' | 'EXIT', 'none' | 'pending' | 'sent'>;
}

export type AttendanceNotifyEventType = 'ABSENT' | 'LATE' | 'EXIT';

export interface AttendanceNotifySummary {
  ABSENT: { eligible: number; sent: number; pending: number };
  LATE: { eligible: number; sent: number; pending: number };
  EXIT: { eligible: number; sent: number; pending: number };
}

export interface AttendanceNotifyStatusResponse {
  summary: AttendanceNotifySummary;
  by_ogrenci: Record<string, Record<AttendanceNotifyEventType, "none" | "pending" | "sent">>;
  recent_sends?: AttendanceNotifyRecentSend[];
  has_unsent?: boolean;
}

export interface AttendanceNotifyRecentSend {
  ogrenci_id: number;
  ogrenci_ad: string;
  veli_ad: string;
  event_type: AttendanceNotifyEventType;
  event_label: string;
  sent_at: string;
}

export type NotifyDeliveryStatus = "none" | "pending" | "sent";

export interface AttendanceNotifyRecipientPreview {
  ogrenci_id: number;
  ogrenci_ad: string;
  veli_id: number;
  veli_ad: string;
  telefon: string;
  body: string;
  skip_reason: string;
}

export interface AttendanceNotifyPreviewResponse {
  event_type: AttendanceNotifyEventType;
  template_id: string | null;
  template_body: string;
  eligible_count: number;
  pending_count: number;
  recipients: AttendanceNotifyRecipientPreview[];
}

export interface AttendancePendingNotification {
  event_type: AttendanceNotifyEventType;
  label: string;
  ogrenci_ids: number[];
  count: number;
}

export interface AttendanceNotifyTemplateInfo {
  id: string;
  name: string;
  body: string;
  category: string;
}

export interface AttendanceNotifyConfig {
  kurum_id: number;
  is_active: boolean;
  absent_template: AttendanceNotifyTemplateInfo | null;
  late_template: AttendanceNotifyTemplateInfo | null;
  exit_template: AttendanceNotifyTemplateInfo | null;
}

export interface TemporarySeating {
  id: string;
  kutuphane_id: string;
  masa_id: string;
  masa_no?: string;
  ogrenci_id: number;
  ogrenci_adi?: string;
  sebep: string;
  durum: string;
  baslangic_zamani: string;
  beklenen_bitis_zamani: string;
  gercek_bitis_zamani: string | null;
}

export interface DashboardData {
  toplam_salon: number;
  aktif_salon: number;
  toplam_masa: number;
  dolu_masa: number;
  toplam_dolap: number;
  dolu_dolap: number;
  musait_dolap: number;
  gecici_oturma: number;
  doluluk_orani: number;
  aktif_atama: number;
  toplam_kapasite: number;
  salonlar: Array<{
    id: string;
    ad: string;
    kod: string;
    durum: string;
    kapasite: number;
    toplam_masa: number;
    aktif_masa: number;
    aktif_atama: number;
    dolu_masa: number;
    bos_masa: number;
    doluluk_orani: number;
  }>;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  kullanici_id: number | null;
  created_at: string;
  performed_at?: string;
  description?: string;
  performed_by?: string;
}

// ============================================================
// API FUNCTIONS
// ============================================================

const BASE = '/kutuphane/api';

// --- Dashboard ---
export async function fetchDashboard(): Promise<ApiResponse<DashboardData>> {
  return apiGet<DashboardData>(`${BASE}/dashboard/`);
}

// --- Kütüphane (Salon) ---
export async function fetchLibraries(params?: { search?: string; durum?: string }): Promise<ApiResponse<Library[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<Library[]>(`${BASE}/salon/${qs ? '?' + qs : ''}`);
}

export async function fetchLibrary(id: string): Promise<ApiResponse<Library>> {
  return apiGet<Library>(`${BASE}/salon/${id}/`);
}

export async function createLibrary(data: Partial<Library>): Promise<ApiResponse<Library>> {
  return apiPost<Library>(`${BASE}/salon/`, data);
}

export async function updateLibrary(id: string, data: Partial<Library>): Promise<ApiResponse<Library>> {
  return apiPut<Library>(`${BASE}/salon/${id}/`, data);
}

export async function deleteLibrary(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/salon/${id}/`);
}

export async function changeLibraryStatus(id: string, durum: LibraryStatus): Promise<ApiResponse<Library>> {
  return apiPut<Library>(`${BASE}/salon/${id}/durum/`, { durum });
}

// --- Masalar ---
export async function fetchSeats(libraryId: string, params?: { durum?: string }): Promise<ApiResponse<Seat[]>> {
  const query = new URLSearchParams();
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<Seat[]>(`${BASE}/salon/${libraryId}/masa/${qs ? '?' + qs : ''}`);
}

export async function createSeat(libraryId: string, data: Partial<Seat>): Promise<ApiResponse<Seat>> {
  return apiPost<Seat>(`${BASE}/salon/${libraryId}/masa/`, data);
}

export async function updateSeat(libraryId: string, seatId: string, data: Partial<Seat>): Promise<ApiResponse<Seat>> {
  return apiPut<Seat>(`${BASE}/salon/${libraryId}/masa/${seatId}/`, data);
}

export async function bulkCreateSeats(libraryId: string, data: { baslangic: number; bitis: number; masa_tipi?: string; priz_var_mi?: boolean; lamba_var_mi?: boolean }): Promise<ApiResponse<{ created: number; skipped: number }>> {
  return apiPost(`${BASE}/salon/${libraryId}/masa/toplu/`, data);
}

export async function changeSeatStatus(libraryId: string, seatId: string, durum: SeatStatus): Promise<ApiResponse<Seat>> {
  return apiPut<Seat>(`${BASE}/salon/${libraryId}/masa/${seatId}/durum/`, { durum });
}

// --- Dolaplar (Kurum bazlı — kütüphaneden bağımsız) ---
export async function fetchLockers(params?: { durum?: string }): Promise<ApiResponse<Locker[]>> {
  const query = new URLSearchParams();
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<Locker[]>(`${BASE}/dolap/${qs ? '?' + qs : ''}`);
}

export async function createLocker(data: Partial<Locker>): Promise<ApiResponse<Locker>> {
  return apiPost<Locker>(`${BASE}/dolap/`, data);
}

export async function updateLocker(lockerId: string, data: Partial<Locker>): Promise<ApiResponse<Locker>> {
  return apiPut<Locker>(`${BASE}/dolap/${lockerId}/`, data);
}

export async function deleteLocker(lockerId: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/dolap/${lockerId}/`);
}

// --- Oturum Tanımları ---
export async function fetchSessionDefs(libraryId: string): Promise<ApiResponse<SessionDefinition[]>> {
  return apiGet<SessionDefinition[]>(`${BASE}/salon/${libraryId}/oturum-tanimi/`);
}

export async function createSessionDef(libraryId: string, data: Partial<SessionDefinition>): Promise<ApiResponse<SessionDefinition>> {
  return apiPost<SessionDefinition>(`${BASE}/salon/${libraryId}/oturum-tanimi/`, data);
}

export async function updateSessionDef(libraryId: string, sessionId: string, data: Partial<SessionDefinition>): Promise<ApiResponse<SessionDefinition>> {
  return apiPut<SessionDefinition>(`${BASE}/salon/${libraryId}/oturum-tanimi/${sessionId}/`, data);
}

export async function deleteSessionDef(libraryId: string, sessionId: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/salon/${libraryId}/oturum-tanimi/${sessionId}/`);
}

// --- Tüm Atamalar (Salon-bağımsız) ---
export interface AllAssignmentsResponse {
  masa_atamalari: SeatAssignment[];
  dolap_atamalari: LockerAssignment[];
}

export async function fetchAllAssignments(params?: { durum?: string }): Promise<ApiResponse<AllAssignmentsResponse>> {
  const query = new URLSearchParams();
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<AllAssignmentsResponse>(`${BASE}/atamalar/${qs ? '?' + qs : ''}`);
}

// --- Masa Atamaları ---
export async function fetchSeatAssignments(libraryId: string, params?: { durum?: string }): Promise<ApiResponse<SeatAssignment[]>> {
  const query = new URLSearchParams();
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<SeatAssignment[]>(`${BASE}/salon/${libraryId}/masa-atama/${qs ? '?' + qs : ''}`);
}

export async function createSeatAssignment(libraryId: string, data: { masa_id: string; ogrenci_id: number; atama_tipi: string; baslangic_tarihi: string; bitis_tarihi?: string; notlar?: string }): Promise<ApiResponse<SeatAssignment>> {
  return apiPost<SeatAssignment>(`${BASE}/salon/${libraryId}/masa-atama/`, data);
}

export async function endSeatAssignment(libraryId: string, assignmentId: string): Promise<ApiResponse<SeatAssignment>> {
  return apiPost<SeatAssignment>(`${BASE}/salon/${libraryId}/masa-atama/${assignmentId}/sonlandir/`);
}

// --- Dolap Atamaları (Kurum bazlı) ---
export async function fetchLockerAssignments(params?: { durum?: string }): Promise<ApiResponse<LockerAssignment[]>> {
  const query = new URLSearchParams();
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<LockerAssignment[]>(`${BASE}/dolap-atama/${qs ? '?' + qs : ''}`);
}

export async function createLockerAssignment(data: { dolap_id: string; ogrenci_id: number; atama_tipi: string; baslangic_tarihi: string; bitis_tarihi?: string; depozit_odendi?: boolean; anahtar_verildi?: boolean; notlar?: string }): Promise<ApiResponse<LockerAssignment>> {
  return apiPost<LockerAssignment>(`${BASE}/dolap-atama/`, data);
}

export async function endLockerAssignment(assignmentId: string): Promise<ApiResponse<LockerAssignment>> {
  return apiPost<LockerAssignment>(`${BASE}/dolap-atama/${assignmentId}/sonlandir/`);
}

export async function toggleLockerKey(assignmentId: string): Promise<ApiResponse<LockerAssignment>> {
  return apiPost<LockerAssignment>(`${BASE}/dolap-atama/${assignmentId}/anahtar/`);
}

// --- Yoklama ---
export async function fetchAttendanceSessions(libraryId: string, params?: { tarih?: string; durum?: string }): Promise<ApiResponse<AttendanceSession[]>> {
  const query = new URLSearchParams();
  if (params?.tarih) query.set('tarih', params.tarih);
  if (params?.durum) query.set('durum', params.durum);
  const qs = query.toString();
  return apiGet<AttendanceSession[]>(`${BASE}/salon/${libraryId}/yoklama/${qs ? '?' + qs : ''}`);
}

export async function openAttendanceSession(libraryId: string, data: { periyot_kodu: string; tarih: string }): Promise<ApiResponse<AttendanceSession>> {
  return apiPost<AttendanceSession>(`${BASE}/salon/${libraryId}/yoklama/`, data);
}

export async function fetchAttendanceSessionDetail(libraryId: string, sessionId: string): Promise<ApiResponse<{ session: AttendanceSession; records: AttendanceRecord[] }>> {
  return apiGet(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/`);
}

export async function closeAttendanceSession(libraryId: string, sessionId: string): Promise<ApiResponse<AttendanceSession>> {
  return apiPost<AttendanceSession>(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/kapat/`);
}

export async function reopenAttendanceSession(libraryId: string, sessionId: string): Promise<ApiResponse<AttendanceSession>> {
  return apiPost<AttendanceSession>(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/ac/`);
}

export async function saveAttendanceRecords(
  libraryId: string,
  sessionId: string,
  records: {
    ogrenci_id: number;
    durum: AttendanceStatus;
    notlar?: string;
    giris_saati?: string;
    cikis_saati?: string;
  }[],
): Promise<ApiResponse<{
  saved: number;
  records?: AttendanceRecord[];
  pending_notifications?: AttendancePendingNotification[];
}>> {
  return apiPost(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/kayit/`, { records });
}

export async function fetchAttendanceNotifyStatus(
  libraryId: string,
  sessionId: string,
): Promise<ApiResponse<AttendanceNotifyStatusResponse>> {
  return apiGet(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/bildirim-durumu/`);
}

export async function previewAttendanceNotify(
  libraryId: string,
  sessionId: string,
  event: AttendanceNotifyEventType,
  ogrenciIds?: number[],
): Promise<ApiResponse<AttendanceNotifyPreviewResponse>> {
  const query = new URLSearchParams({ event });
  if (ogrenciIds?.length) query.set('ogrenci_ids', ogrenciIds.join(','));
  return apiGet(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/bildirim-onizleme/?${query}`);
}

export async function sendAttendanceNotify(
  libraryId: string,
  sessionId: string,
  payload: {
    event_type: AttendanceNotifyEventType;
    ogrenci_ids?: number[];
    exclude_veli_ids?: number[];
    force_resend?: boolean;
  },
): Promise<ApiResponse<{ sent: number; skipped: number; errors: string[] }>> {
  return apiPost(`${BASE}/salon/${libraryId}/yoklama/${sessionId}/bildirim-gonder/`, payload);
}

export async function fetchAttendanceNotifyConfig(): Promise<ApiResponse<AttendanceNotifyConfig>> {
  return apiGet(`${BASE}/yoklama-bildirim-ayarlari/`);
}

export async function updateAttendanceNotifyConfig(
  data: Partial<{
    absent_template_id: string | null;
    late_template_id: string | null;
    exit_template_id: string | null;
    is_active: boolean;
  }>,
): Promise<ApiResponse<AttendanceNotifyConfig>> {
  return apiPost(`${BASE}/yoklama-bildirim-ayarlari/`, data);
}

// --- Geçici Oturma ---
export async function fetchTemporarySeating(libraryId: string): Promise<ApiResponse<TemporarySeating[]>> {
  return apiGet<TemporarySeating[]>(`${BASE}/salon/${libraryId}/gecici-oturma/`);
}

export async function createTemporarySeating(libraryId: string, data: { masa_id: string; ogrenci_id: number; sebep: string; sure_dakika: number }): Promise<ApiResponse<TemporarySeating>> {
  return apiPost<TemporarySeating>(`${BASE}/salon/${libraryId}/gecici-oturma/`, data);
}

export async function endTemporarySeating(libraryId: string, tempId: string): Promise<ApiResponse<TemporarySeating>> {
  return apiPost<TemporarySeating>(`${BASE}/salon/${libraryId}/gecici-oturma/${tempId}/sonlandir/`);
}

// --- Audit Loglar ---
export async function fetchAuditLogs(libraryId: string): Promise<ApiResponse<AuditLog[]>> {
  return apiGet<AuditLog[]>(`${BASE}/salon/${libraryId}/loglar/`);
}

// --- Kapasite & Analitik ---
export interface AnalyticsData {
  salon_id: string;
  salon_adi: string;
  tarih_araligi: { baslangic: string; bitis: string };
  doluluk_trend: { tarih: string; oran: number }[];
  gunluk_ortalama_doluluk: number;
  en_yogun_saatler: { saat: string; oran: number }[];
  masa_tipi_dagilimi: { tip: string; sayi: number }[];
  atama_istatistikleri: {
    toplam_atama: number;
    aktif_atama: number;
    sonlanan_atama: number;
    ortalama_sure_gun: number;
  };
  yoklama_ozeti: {
    toplam_oturum: number;
    ortalama_katilim: number;
    en_iyi_katilim_gunu: string;
  };
  gecici_oturma_ozeti: {
    toplam: number;
    aktif: number;
    ortalama_sure_dakika: number;
  };
}

export interface GlobalAnalyticsData {
  toplam_salon: number;
  toplam_masa: number;
  dolu_masa: number;
  bos_masa: number;
  doluluk_yuzde: number;
  toplam_dolap: number;
  atanmis_dolap: number;
  aktif_ogrenci: number;
  gecici_oturma: number;
  tarih_araligi: { baslangic: string; bitis: string };
  yoklama: {
    toplam_oturum: number;
    toplam_kayit: number;
    katilim_orani: number;
    var_sayisi: number;
    gec_sayisi: number;
    yok_sayisi: number;
    izinli_sayisi: number;
    durum_dagilimi: { durum: string; sayi: number; renk: string }[];
    gunluk_trend: { tarih: string; katilim: number; toplam: number; var: number; gec: number }[];
  };
  atama: {
    toplam: number;
    aktif: number;
    sonlanan: number;
  };
  masa_tipi_dagilimi: { tip: string; sayi: number }[];
  salonlar: {
    id: string;
    ad: string;
    kod: string;
    durum: string;
    kapasite: number;
    toplam_masa: number;
    dolu_masa: number;
    bos_masa: number;
    aktif_atama: number;
    toplam_dolap: number;
    atanmis_dolap: number;
    doluluk_yuzde: number;
    katilim_orani: number;
    toplam_oturum: number;
  }[];
}

export async function fetchAnalytics(libraryId: string, params?: { baslangic?: string; bitis?: string }): Promise<ApiResponse<AnalyticsData>> {
  const query = new URLSearchParams();
  if (params?.baslangic) query.set('baslangic', params.baslangic);
  if (params?.bitis) query.set('bitis', params.bitis);
  const qs = query.toString();
  return apiGet<AnalyticsData>(`${BASE}/salon/${libraryId}/analitik/${qs ? '?' + qs : ''}`);
}

export async function fetchGlobalAnalytics(params?: { baslangic?: string; bitis?: string }): Promise<ApiResponse<GlobalAnalyticsData>> {
  const query = new URLSearchParams();
  if (params?.baslangic) query.set('baslangic', params.baslangic);
  if (params?.bitis) query.set('bitis', params.bitis);
  const qs = query.toString();
  return apiGet<GlobalAnalyticsData>(`${BASE}/analitik/${qs ? '?' + qs : ''}`);
}

// --- Öğrenci Kaynak Genel Görünümü ---
export interface StudentResource {
  ogrenci_id: number;
  ogrenci_adi: string;
  sinif_adi: string;
  profil_foto?: string | null;
  masa: {
    atama_id: string;
    masa_no: string;
    salon_adi: string;
    salon_id: string;
    atama_tipi: string;
    baslangic_tarihi: string;
  } | null;
  dolap: {
    atama_id: string;
    dolap_no: string;
    dolap_id: string;
    atama_tipi: string;
    baslangic_tarihi: string;
    anahtar_verildi: boolean;
  } | null;
}

export interface StudentResourceSummary {
  toplam: number;
  masa_var: number;
  dolap_var: number;
  ikisi_var: number;
}

export interface StudentResourceResponse {
  students: StudentResource[];
  summary: StudentResourceSummary;
}

export async function fetchStudentResources(params?: { filtre?: string; search?: string }): Promise<ApiResponse<StudentResourceResponse>> {
  const query = new URLSearchParams();
  if (params?.filtre) query.set('filtre', params.filtre);
  if (params?.search) query.set('search', params.search);
  const qs = query.toString();
  return apiGet<StudentResourceResponse>(`${BASE}/ogrenci-kaynaklar/${qs ? '?' + qs : ''}`);
}

// ============================================================
// ŞUBE DERS PROGRAMI
// ============================================================

export interface DersSaati {
  ders_no: number;
  baslangic: string;
  bitis: string;
}

export interface MolaTanimi {
  sonra_ders_no: number;
  sure_dk: number;
}

export interface PeriyotDersler {
  ders_sayisi: number;
  ders_suresi_dk: number;
  dersler: DersSaati[];
  molalar: MolaTanimi[];
}

export interface GunAktiflik {
  aktif: boolean;
  periyotlar: SessionCode[];
}

export interface SubeDersProgrami {
  id: string;
  sube_id: number;
  sube_adi?: string;
  kurum_id: number;
  ad: string;
  ders_saatleri: Record<SessionCode, PeriyotDersler>;
  gun_bazli_aktiflik: Record<string, GunAktiflik>;
  aktif_mi: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubeInfo {
  id: number;
  ad: string;
  kod: string;
  program_var: boolean;
}

export async function fetchDersProgramlari(params?: { sube_id?: number }): Promise<ApiResponse<SubeDersProgrami | SubeDersProgrami[]>> {
  const query = new URLSearchParams();
  if (params?.sube_id) query.set('sube_id', String(params.sube_id));
  const qs = query.toString();
  return apiGet(`${BASE}/ders-programi/${qs ? '?' + qs : ''}`);
}

export async function fetchDersProgrami(id: string): Promise<ApiResponse<SubeDersProgrami>> {
  return apiGet<SubeDersProgrami>(`${BASE}/ders-programi/${id}/`);
}

export async function createDersProgrami(data: {
  sube_id: number;
  ad?: string;
  ders_saatleri: Record<string, PeriyotDersler>;
  gun_bazli_aktiflik: Record<string, GunAktiflik>;
  aktif_mi?: boolean;
}): Promise<ApiResponse<SubeDersProgrami>> {
  return apiPost<SubeDersProgrami>(`${BASE}/ders-programi/`, data);
}

export async function updateDersProgrami(id: string, data: Partial<{
  ad: string;
  ders_saatleri: Record<string, PeriyotDersler>;
  gun_bazli_aktiflik: Record<string, GunAktiflik>;
  aktif_mi: boolean;
}>): Promise<ApiResponse<SubeDersProgrami>> {
  return apiPut<SubeDersProgrami>(`${BASE}/ders-programi/${id}/`, data);
}

export async function deleteDersProgrami(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/ders-programi/${id}/`);
}

export async function fetchSubeler(): Promise<ApiResponse<SubeInfo[]>> {
  return apiGet<SubeInfo[]>(`${BASE}/subeler/`);
}

// ============================================================
// ÖĞRENCİ İZİNLERİ
// ============================================================

export interface OgrenciIzin {
  id: string;
  ogrenci_id: number;
  ogrenci_adi?: string;
  kurum_id: number;
  library_id: string | null;
  library_adi?: string | null;
  izin_tipi: ExemptionType;
  gun: number;
  gun_adi?: string;
  periyot_kodu: SessionCode | null;
  periyot_adi?: string | null;
  baslangic_tarihi: string;
  bitis_tarihi: string | null;
  sebep: string;
  aktif_mi: boolean;
  created_at: string;
}

export async function fetchIzinler(params?: { ogrenci_id?: number; library_id?: string }): Promise<ApiResponse<OgrenciIzin[]>> {
  const query = new URLSearchParams();
  if (params?.ogrenci_id) query.set('ogrenci_id', String(params.ogrenci_id));
  if (params?.library_id) query.set('library_id', params.library_id);
  const qs = query.toString();
  return apiGet<OgrenciIzin[]>(`${BASE}/izinler/${qs ? '?' + qs : ''}`);
}

export async function createIzin(data: {
  ogrenci_id: number;
  library_id?: string;
  izin_tipi: ExemptionType;
  gun: number;
  periyot_kodu?: SessionCode;
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
  sebep?: string;
}): Promise<ApiResponse<OgrenciIzin>> {
  return apiPost<OgrenciIzin>(`${BASE}/izinler/`, data);
}

export async function createBulkIzinler(izinler: Array<{
  ogrenci_id: number;
  library_id?: string;
  izin_tipi: ExemptionType;
  gun: number;
  periyot_kodu?: SessionCode;
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
  sebep?: string;
}>): Promise<ApiResponse<OgrenciIzin[]>> {
  return apiPost<OgrenciIzin[]>(`${BASE}/izinler/`, { izinler });
}

export async function updateIzin(id: string, data: Partial<OgrenciIzin>): Promise<ApiResponse<OgrenciIzin>> {
  return apiPut<OgrenciIzin>(`${BASE}/izinler/${id}/`, data);
}

export async function deleteIzin(id: string): Promise<ApiResponse<void>> {
  return apiDelete<void>(`${BASE}/izinler/${id}/`);
}

export async function replaceStudentIzinler(ogrenci_id: number, izinler: Array<{
  library_id?: string;
  izin_tipi: ExemptionType;
  gun: number;
  periyot_kodu?: SessionCode;
  baslangic_tarihi?: string;
  bitis_tarihi?: string;
  sebep?: string;
}>): Promise<ApiResponse<OgrenciIzin[]>> {
  return apiPost<OgrenciIzin[]>(`${BASE}/izinler/degistir/`, { ogrenci_id, izinler });
}

// ============================================================
// GELİŞMİŞ YOKLAMA (DERS BAZLI)
// ============================================================

export async function openLessonAttendanceSessions(libraryId: string, data: {
  periyot_kodu: string;
  tarih: string;
  sube_id: number;
}): Promise<ApiResponse<AttendanceSession[]>> {
  return apiPost<AttendanceSession[]>(`${BASE}/salon/${libraryId}/yoklama/ders-bazli-ac/`, data);
}

export interface AttendanceSheetColumn {
  id: string;
  label: string;
  periyot: string;
  ders_no: number | null;
  durum?: string;
}

export interface AttendanceSheetStudent {
  ogrenci_id: number;
  ogrenci_adi: string;
  masa_no: string;
  yoklamalar: Record<string, {
    durum: AttendanceStatus | null;
    izinli_mi: boolean;
    giris_saati: string | null;
  }>;
}

export interface AttendanceSheetData {
  salon_adi: string;
  tarih: string;
  columns: AttendanceSheetColumn[];
  students: AttendanceSheetStudent[];
}

export async function fetchAttendanceSheetData(libraryId: string, params?: {
  tarih?: string;
  periyot_kodu?: string;
}): Promise<ApiResponse<AttendanceSheetData>> {
  const query = new URLSearchParams();
  if (params?.tarih) query.set('tarih', params.tarih);
  if (params?.periyot_kodu) query.set('periyot_kodu', params.periyot_kodu);
  const qs = query.toString();
  return apiGet<AttendanceSheetData>(`${BASE}/salon/${libraryId}/yoklama-kagidi/${qs ? '?' + qs : ''}`);
}

export interface WeeklyGun {
  tarih: string;
  gun_adi: string;
  oturumlar: AttendanceSession[];
}

export interface WeeklySummary {
  baslangic: string;
  bitis: string;
  gunler: WeeklyGun[];
}

export async function fetchWeeklyAttendanceSummary(libraryId: string, params?: {
  baslangic?: string;
  bitis?: string;
}): Promise<ApiResponse<WeeklySummary>> {
  const query = new URLSearchParams();
  if (params?.baslangic) query.set('baslangic', params.baslangic);
  if (params?.bitis) query.set('bitis', params.bitis);
  const qs = query.toString();
  return apiGet<WeeklySummary>(`${BASE}/salon/${libraryId}/yoklama-ozet/${qs ? '?' + qs : ''}`);
}
