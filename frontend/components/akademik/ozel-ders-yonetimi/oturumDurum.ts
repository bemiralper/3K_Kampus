/** Backend ALLOWED_TRANSITIONS ile uyumlu durum makinesi (FE). */
export const OTURUM_DURUM_LABELS: Record<string, string> = {
  PLANLANDI: 'Planlandı',
  ISLENDI: 'İşlendi',
  ONLINE: 'Online',
  IPTAL: 'İptal',
  TELAFI_EDILECEK: 'Telafi Edilecek',
  OGRENCI_GELMEDI: 'Öğrenci Gelmedi',
  OGRETMEN_GELMEDI: 'Öğretmen Gelmedi',
};

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PLANLANDI: ['ISLENDI', 'ONLINE', 'TELAFI_EDILECEK', 'OGRENCI_GELMEDI', 'OGRETMEN_GELMEDI', 'IPTAL'],
  ONLINE: ['ISLENDI', 'IPTAL', 'TELAFI_EDILECEK', 'PLANLANDI'],
  ISLENDI: ['PLANLANDI', 'IPTAL'],
  TELAFI_EDILECEK: ['PLANLANDI', 'IPTAL'],
  OGRENCI_GELMEDI: ['PLANLANDI', 'TELAFI_EDILECEK', 'IPTAL'],
  OGRETMEN_GELMEDI: ['PLANLANDI', 'TELAFI_EDILECEK', 'IPTAL'],
  IPTAL: ['PLANLANDI'],
};

/** Yoklama kartında öne çıkan aksiyonlar (2–3 tık). */
export const PRIMARY_YOKLAMA_ACTIONS = ['ISLENDI', 'ONLINE', 'TELAFI_EDILECEK'] as const;

export function allowedNextDurumlar(current: string): string[] {
  return ALLOWED_TRANSITIONS[current] || [];
}

export function canTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return allowedNextDurumlar(from).includes(to);
}
