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

/** Yoklama ekranında gösterilecek durum butonları (sıralı, Online yok). */
export function yoklamaActionButtons(durum: string): string[] {
  const next = new Set(allowedNextDurumlar(durum));
  return YOKLAMA_ACTION_ORDER.filter((key) => next.has(key));
}

/** ISLENDI/ONLINE için WhatsApp seçeneği; gelmedi/iptal için sebep (+ telafi) gerekir */
export function yoklamaNeedsDrawer(durum: string): boolean {
  return (
    needsSebep(durum) ||
    ['ISLENDI', 'ONLINE'].includes(durum)
  );
}
