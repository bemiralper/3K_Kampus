/** Telafi ekranının "aktif" listesi ve özet çipinin ortak penceresi (gün). */
export const TELAFI_AKTIF_GUN = 21;

/** Yoklama durumu etiketleri (planlandı → iptal arası geçerli durumlar). */
export const OTURUM_DURUM_LABEL: Record<string, string> = {
  PLANLANDI: 'Planlandı',
  ISLENDI: 'İşlendi',
  ONLINE: 'Online',
  OGRETMEN_GELMEDI: 'Öğretmen Gelmedi',
  OGRENCI_GELMEDI: 'Öğrenci Gelmedi',
  IPTAL: 'İptal',
};

export const TELAFI_DURUM_LABEL: Record<string, string> = {
  GEREKMIYOR: 'Telafi Gerekmiyor',
  BEKLENIYOR: 'Telafi Bekleniyor',
  PLANLANDI: 'Telafi Planlandı',
  EDILDI: 'Telafi Edildi',
  VAZGECILDI: 'Telafiden Vazgeçildi',
};

export const SEBEP_OPTIONS = [
  { value: 'HASTALIK', label: 'Hastalık' },
  { value: 'MAZERET', label: 'Mazeret' },
  { value: 'ACIL', label: 'Acil durum' },
  { value: 'KURUM', label: 'Kurum kaynaklı' },
  { value: 'DIGER', label: 'Diğer' },
] as const;

/** Backend ALLOWED_TRANSITIONS ile uyumlu (ONLINE kayıtlar için geçiş korunur). */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PLANLANDI: ['ISLENDI', 'ONLINE', 'OGRETMEN_GELMEDI', 'OGRENCI_GELMEDI', 'IPTAL'],
  ONLINE: ['ISLENDI', 'IPTAL', 'PLANLANDI'],
  ISLENDI: ['PLANLANDI', 'IPTAL'],
  OGRENCI_GELMEDI: ['PLANLANDI', 'IPTAL', 'OGRENCI_GELMEDI'],
  OGRETMEN_GELMEDI: ['PLANLANDI', 'IPTAL', 'OGRETMEN_GELMEDI'],
  IPTAL: ['PLANLANDI', 'IPTAL'],
};

/** UI’da sunulmayan durumlar — kurum online ders kullanmıyor. */
export const HIDDEN_YOKLAMA_ACTIONS = ['ONLINE'] as const;

const YOKLAMA_ACTION_ORDER = [
  'ISLENDI',
  'OGRETMEN_GELMEDI',
  'OGRENCI_GELMEDI',
  'IPTAL',
  'PLANLANDI',
] as const;

/** @deprecated Online kaldırıldı; yoklamaActionButtons kullanın */
export const PRIMARY_YOKLAMA_ACTIONS = ['ISLENDI'] as const;

export const SECONDARY_YOKLAMA_ACTIONS = [
  'OGRETMEN_GELMEDI',
  'OGRENCI_GELMEDI',
  'IPTAL',
] as const;

export function needsSebep(durum: string): boolean {
  return ['OGRETMEN_GELMEDI', 'OGRENCI_GELMEDI', 'IPTAL'].includes(durum);
}

export function needsTelafiChoice(durum: string): boolean {
  return ['OGRENCI_GELMEDI', 'IPTAL'].includes(durum);
}

export function defaultSendWhatsapp(durum: string): boolean {
  return ['OGRETMEN_GELMEDI', 'OGRENCI_GELMEDI', 'IPTAL'].includes(durum);
}

/** @deprecated OTURUM_DURUM_LABEL ile aynı — mevcut import uyumluluğu */
export const OTURUM_DURUM_LABELS = OTURUM_DURUM_LABEL;

export function allowedNextDurumlar(durum: string): string[] {
  return (ALLOWED_TRANSITIONS[durum] ?? []).filter(
    (next) => !(HIDDEN_YOKLAMA_ACTIONS as readonly string[]).includes(next),
  );
}

export type YoklamaGuardInput = {
  durum: string;
  session_date?: string;
  hakedis_durum?: string | null;
  telafi_oturum?: { durum: string } | null;
};

const ATTENDANCE_DURUMLAR = ['ISLENDI', 'ONLINE', 'OGRETMEN_GELMEDI', 'OGRENCI_GELMEDI'];

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Hakedişi onaylı / bordroya işlenmiş ders kilitlidir. */
export function isHakedisLocked(o: Pick<YoklamaGuardInput, 'hakedis_durum'>): boolean {
  return o.hakedis_durum === 'ONAYLANDI' || o.hakedis_durum === 'BORDOYA_ISLENDI';
}

export function isFutureSession(o: Pick<YoklamaGuardInput, 'session_date'>): boolean {
  return Boolean(o.session_date && o.session_date.slice(0, 10) > todayIso());
}

/**
 * Yoklama ekranında gösterilecek durum butonları (sıralı, Online yok).
 * Oturum verilirse backend kuralları da uygulanır: gelecek ders yoklanamaz,
 * onaylı hakediş kilitler, telafisi planlanmış ders İşlendi yapılamaz.
 */
export function yoklamaActionButtons(input: string | YoklamaGuardInput): string[] {
  const o: YoklamaGuardInput = typeof input === 'string' ? { durum: input } : input;
  const next = new Set(allowedNextDurumlar(o.durum));
  if (isHakedisLocked(o)) {
    return YOKLAMA_ACTION_ORDER.filter((key) => key === o.durum && next.has(key));
  }
  if (isFutureSession(o)) {
    ATTENDANCE_DURUMLAR.forEach((d) => next.delete(d));
  }
  if (o.telafi_oturum && o.telafi_oturum.durum !== 'IPTAL') {
    next.delete('ISLENDI');
    next.delete('ONLINE');
  }
  return YOKLAMA_ACTION_ORDER.filter((key) => next.has(key));
}

/** ISLENDI/ONLINE için WhatsApp seçeneği; gelmedi/iptal için sebep (+ telafi) gerekir */
export function yoklamaNeedsDrawer(durum: string): boolean {
  return (
    needsSebep(durum) ||
    ['ISLENDI', 'ONLINE'].includes(durum)
  );
}
