/**
 * Coach Portal API — öğrenci listesi, 360 BFF ve ilgili uçlar
 */

import { apiGet, apiPost, ApiResponse, getContextHeaders } from './api';
import {
  COACH_MEETING_FOLLOWUP_DAYS,
  normalizeCoachRiskLevel,
  type CoachRiskLevel,
} from './coach-constants';

// ─── Öğrenci listesi (Track B: coach portal list UI) ───

export type RiskSeviyesi = CoachRiskLevel;

export interface CoachPortalStudent {
  id: number;
  student_id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  sinif: string | null;
  okul_no?: string | null;
  /** intelligence RiskEngine ile aynı: low | medium | high */
  risk_seviyesi: RiskSeviyesi | null;
  risk_score?: number | null;
  son_gorusme_tarihi: string | null;
  overdue_homework_count?: number;
  veli_telefon?: string | null;
  veli_id?: number | null;
  profil_foto?: string | null;
  meeting_today_count?: number;
  /** Son tamamlanan görüşmeden 14+ gün (RiskEngine.INACTIVITY_DAYS_CRITICAL) */
  needs_meeting?: boolean;
}

interface CoachStudentListRaw {
  id: number;
  ad: string;
  soyad: string;
  sinif: string | null;
  okul_no?: string | null;
  risk_label?: string | null;
  risk_score?: number | null;
  last_meeting_date?: string | null;
  overdue_homework_count?: number;
  veli_telefon?: string | null;
  veli_id?: number | null;
  profil_foto?: string | null;
  meeting_today_count?: number;
  needs_meeting?: boolean;
}

function mapPortalStudent(raw: CoachStudentListRaw): CoachPortalStudent {
  const tamAd = `${raw.ad} ${raw.soyad}`.trim();
  return {
    id: raw.id,
    student_id: raw.id,
    ad: raw.ad,
    soyad: raw.soyad,
    tam_ad: tamAd,
    sinif: raw.sinif ?? null,
    okul_no: raw.okul_no ?? null,
    risk_seviyesi: normalizeCoachRiskLevel(raw.risk_label),
    risk_score: raw.risk_score ?? null,
    son_gorusme_tarihi: raw.last_meeting_date ?? null,
    overdue_homework_count: raw.overdue_homework_count ?? 0,
    veli_telefon: raw.veli_telefon ?? null,
    veli_id: raw.veli_id ?? null,
    profil_foto: raw.profil_foto ?? null,
    meeting_today_count: raw.meeting_today_count ?? 0,
    needs_meeting: raw.needs_meeting ?? false,
  };
}

export { COACH_MEETING_FOLLOWUP_DAYS };

export interface FetchCoachStudentsParams {
  search?: string;
  active_only?: boolean;
}

/**
 * Oturum açmış koçun kapsamındaki öğrenci listesini getirir (GET /api/coaching/students/).
 * @param _coachProfileId — geriye dönük uyumluluk; yok sayılır, oturum kapsamı kullanılır
 */
export async function fetchCoachStudents(
  _coachProfileId?: number,
  params?: FetchCoachStudentsParams
): Promise<ApiResponse<CoachPortalStudent[]>> {
  const response = await apiGet<
    { success?: boolean; data?: CoachStudentListRaw[]; count?: number } | CoachStudentListRaw[]
  >('/api/coaching/students/');

  if (!response.success || !response.data) {
    return { success: false, error: response.error || 'Öğrenci listesi alınamadı' };
  }

  const raw = response.data;
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.data) ? raw.data : [];
  let students = list.map(mapPortalStudent);

  if (params?.search?.trim()) {
    const q = params.search.trim().toLocaleLowerCase('tr-TR');
    students = students.filter(
      (s) =>
        s.tam_ad.toLocaleLowerCase('tr-TR').includes(q) ||
        (s.sinif && s.sinif.toLocaleLowerCase('tr-TR').includes(q)) ||
        (s.okul_no && s.okul_no.toLocaleLowerCase('tr-TR').includes(q))
    );
  }

  return { success: true, data: students };
}

/**
 * Koç öğrenci listesi — kurumsal Excel/CSV (GET /api/coaching/students/export/).
 */
export async function downloadCoachStudentsExport(
  format: 'csv' | 'xlsx',
  studentIds?: number[],
): Promise<Blob> {
  const params = new URLSearchParams();
  params.set('format', format);
  if (studentIds?.length) {
    params.set('ids', studentIds.join(','));
  }
  const res = await fetch(`/api/coaching/students/export/?${params}`, {
    credentials: 'include',
    headers: getContextHeaders(),
  });
  if (!res.ok) {
    throw new Error(
      format === 'xlsx' ? 'Excel dışa aktarma başarısız' : 'CSV dışa aktarma başarısız',
    );
  }
  return res.blob();
}

// ─── Profile BFF types (Track A: GET /api/coaching/students/{id}/profile/) ───

export interface CoachStudentProfileStudent {
  id: number;
  ad: string;
  soyad: string;
  tam_ad: string;
  full_name: string;
  tc_kimlik_no?: string;
  dogum_tarihi?: string;
  dogum_tarihi_iso?: string;
  cinsiyet?: string;
  cinsiyet_display?: string;
  kayit_turu?: string;
  kayit_turu_display?: string;
  telefon?: string;
  email?: string;
  adres?: string;
  veli_ad_soyad?: string;
  veli_telefon?: string | null;
  veli_adi?: string | null;
  veli?: {
    id?: number;
    ad?: string;
    telefon?: string;
    tel_link?: string | null;
    veli_turu?: string;
    veli_turu_display?: string;
  } | null;
  aktif_mi?: boolean;
  kurum?: { id: number; ad: string } | null;
  sube?: { id: number; ad: string } | null;
  sinif?: { id: number; ad: string } | null;
  sinif_seviyesi?: { id: number; ad: string } | null;
  egitim_yili?: { id: number; ad: string } | null;
  kayit_tarihi?: string;
  okul_no?: string | null;
  profil_foto?: string | null;
  adresler?: Array<{
    id: number;
    adres_turu: string;
    adres_turu_display: string;
    adres: string;
    il: string;
    ilce: string;
    posta_kodu: string;
    varsayilan: boolean;
  }>;
  veliler?: Array<{
    id: number;
    veli_turu: string;
    veli_turu_display: string;
    tc_kimlik_no: string;
    ad: string;
    soyad: string;
    tam_ad: string;
    telefon: string;
    email: string;
    meslek: string;
    varsayilan: boolean;
  }>;
}

export interface CoachStudentProfileCoachContext {
  coach_id?: number | null;
  coach_name?: string | null;
  hedef?: string | null;
  assignment_start_date?: string | null;
  is_primary?: boolean;
}

export interface CoachStudentProfileRisk {
  score?: number | null;
  level?: string | null;
  label?: string | null;
  reasons?: string[];
}

export interface CoachOverviewCard {
  key: string;
  title: string;
  value: string | number;
  subtitle?: string | null;
  trend?: 'up' | 'down' | 'flat' | null;
  trend_label?: string | null;
  accent?: string | null;
  href?: string | null;
}

export interface CoachStudentQuickStats {
  overdue_homework?: number;
  overdue_homework_count?: number;
  overdue_manual_assignments?: number;
  pending_manual_assignments?: number;
  pending_meetings?: number;
  last_exam_net?: number | null;
  last_exam_date?: string | null;
  last_meeting_date?: string | null;
  program_completion?: number | null;
  program_completion_percent?: number | null;
  total_meetings?: number;
  open_assignments?: number;
}

export interface CoachLastMeeting {
  id?: number;
  date?: string | null;
  konu?: string | null;
  durum?: string | null;
  durum_display?: string | null;
}

export interface CoachStudentProfileData {
  student: CoachStudentProfileStudent;
  coach_context: CoachStudentProfileCoachContext;
  risk: CoachStudentProfileRisk | null;
  overview: CoachOverviewCard[];
  quick_stats: CoachStudentQuickStats;
  last_meeting?: CoachLastMeeting | null;
}

/** İçerik paneli (URL ?tab=) */
export type Student360TabId =
  | 'ozet'
  | 'genel' // legacy alias → ozet
  | 'bilgi'
  | 'odevler'
  | 'sinavlar'
  | 'gorusmeler'
  | 'mesajlar'
  | 'program'
  | 'kutuphane'
  | 'veli'
  | 'belgeler';

/** Üst gezinme: Özet + 3 modül grubu */
export type Student360GroupId = 'ozet' | 'akademik' | 'iletisim' | 'kayit';

export type Student360ActionId = 'gorusme-ekle' | 'odev-ver' | 'program' | 'risk';

export const STUDENT360_GROUPS: {
  id: Student360GroupId;
  label: string;
  shortLabel: string;
  panels: Exclude<Student360TabId, 'genel'>[];
}[] = [
  { id: 'ozet', label: 'Özet', shortLabel: 'Özet', panels: ['ozet'] },
  {
    id: 'akademik',
    label: 'Akademik',
    shortLabel: 'Akademik',
    panels: ['odevler', 'sinavlar', 'program'],
  },
  {
    id: 'iletisim',
    label: 'İletişim',
    shortLabel: 'İletişim',
    panels: ['gorusmeler', 'mesajlar', 'veli'],
  },
  {
    id: 'kayit',
    label: 'Kayıt',
    shortLabel: 'Kayıt',
    panels: ['bilgi', 'kutuphane', 'belgeler'],
  },
];

export const STUDENT360_PANEL_LABELS: Record<Exclude<Student360TabId, 'genel'>, string> = {
  ozet: 'Özet',
  bilgi: 'Profil',
  odevler: 'Ödevler',
  sinavlar: 'Sınavlar',
  gorusmeler: 'Görüşme',
  mesajlar: 'Mesajlar',
  program: 'Program',
  kutuphane: 'Kütüphane',
  veli: 'Veli',
  belgeler: 'Belgeler',
};

export function normalizeStudent360Tab(tab: string | null | undefined): Exclude<Student360TabId, 'genel'> {
  if (!tab) return 'ozet';
  if (tab === 'genel') return 'ozet';
  const known = STUDENT360_GROUPS.flatMap((g) => g.panels) as string[];
  if (known.includes(tab)) return tab as Exclude<Student360TabId, 'genel'>;
  return 'ozet';
}

export function groupForStudent360Tab(tab: Student360TabId): Student360GroupId {
  const normalized = normalizeStudent360Tab(tab);
  for (const g of STUDENT360_GROUPS) {
    if (g.panels.includes(normalized)) return g.id;
  }
  return 'ozet';
}

function normalizeProfilePayload(raw: unknown): CoachStudentProfileData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.student && typeof obj.student === 'object') {
    return obj as unknown as CoachStudentProfileData;
  }
  if (obj.data && typeof obj.data === 'object') {
    return obj.data as CoachStudentProfileData;
  }
  return null;
}

/**
 * Öğrenci 360 profil BFF — tek istekte header + genel bakış verisi
 */
export async function fetchCoachStudentProfile(
  id: number | string
): Promise<ApiResponse<CoachStudentProfileData>> {
  const response = await apiGet<CoachStudentProfileData | { data: CoachStudentProfileData }>(
    `/api/coaching/students/${id}/profile/`
  );

  if (response.success && response.data !== undefined) {
    const normalized = normalizeProfilePayload(response.data);
    if (normalized) {
      return { ...response, data: normalized };
    }
  }

  return response as ApiResponse<CoachStudentProfileData>;
}

/**
 * Risk bildir (Track A MVP — CoachingEvent RISK)
 */
export async function reportStudentRisk(
  studentId: number | string,
  payload: { reason: string; notes?: string; create_meeting_draft?: boolean }
): Promise<ApiResponse<{ detail?: string }>> {
  return apiPost(`/api/coaching/students/${studentId}/risk-report/`, payload);
}

/** @deprecated Yatay 10-pill menü kaldırıldı — STUDENT360_GROUPS kullanın */
export const STUDENT360_TABS: { id: Student360TabId; label: string; icon: string }[] = [
  { id: 'ozet', label: 'Özet', icon: '📊' },
  { id: 'bilgi', label: 'Profil', icon: '🪪' },
  { id: 'odevler', label: 'Ödevler', icon: '📝' },
  { id: 'sinavlar', label: 'Sınavlar', icon: '🎯' },
  { id: 'gorusmeler', label: 'Görüşme', icon: '💬' },
  { id: 'mesajlar', label: 'Mesajlar', icon: '📱' },
  { id: 'program', label: 'Program', icon: '📅' },
  { id: 'kutuphane', label: 'Kütüphane', icon: '📚' },
  { id: 'veli', label: 'Veli', icon: '👨‍👩‍👧' },
  { id: 'belgeler', label: 'Belgeler', icon: '📎' },
];
