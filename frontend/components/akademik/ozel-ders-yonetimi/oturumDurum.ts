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

/** Backend ALLOWED_TRANSITIONS ile uyumlu */
export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PLANLANDI: ['ISLENDI', 'ONLINE', 'OGRETMEN_GELMEDI', 'OGRENCI_GELMEDI', 'IPTAL'],
  ONLINE: ['ISLENDI', 'IPTAL', 'PLANLANDI'],
  ISLENDI: ['PLANLANDI', 'IPTAL'],
  OGRENCI_GELMEDI: ['PLANLANDI', 'IPTAL', 'OGRENCI_GELMEDI'],
  OGRETMEN_GELMEDI: ['PLANLANDI', 'IPTAL', 'OGRETMEN_GELMEDI'],
  IPTAL: ['PLANLANDI', 'IPTAL'],
};

/** Bugünün yoklaması — birincil aksiyonlar */
export const PRIMARY_YOKLAMA_ACTIONS = ['ISLENDI', 'ONLINE'] as const;

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
  return ALLOWED_TRANSITIONS[durum] ?? [];
}

/** ISLENDI/ONLINE için WhatsApp seçeneği; gelmedi/iptal için sebep (+ telafi) gerekir */
export function yoklamaNeedsDrawer(durum: string): boolean {
  return (
    needsSebep(durum) ||
    ['ISLENDI', 'ONLINE'].includes(durum)
  );
}
