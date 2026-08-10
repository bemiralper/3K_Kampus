/**
 * Koç portalı sabitleri — backend RiskEngine / admin coaching modülü ile uyumlu.
 */

/**
 * Takip hatırlatması (ödev) — backend HOMEWORK_FOLLOWUP_* ile uyumlu.
 * 7+ gündür yeni ödev almamış ve kontrol günü > 2 gün geçmiş.
 */
export const COACH_HOMEWORK_FOLLOWUP_HELD_DAYS = 7;
export const COACH_HOMEWORK_FOLLOWUP_CONTROL_OVERDUE_DAYS = 2;

/** @deprecated Ödev takibi kullanılıyor; geriye uyumluluk için tutuldu */
export const COACH_MEETING_FOLLOWUP_DAYS = COACH_HOMEWORK_FOLLOWUP_HELD_DAYS;

export type CoachRiskLevel = 'low' | 'medium' | 'high';

export const COACH_RISK_LABELS: Record<CoachRiskLevel, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
};

export function normalizeCoachRiskLevel(label?: string | null): CoachRiskLevel | null {
  if (!label) return null;
  const n = label.toLowerCase();
  if (n === 'low' || n === 'dusuk') return 'low';
  if (n === 'medium' || n === 'orta') return 'medium';
  if (n === 'high' || n === 'yuksek' || n === 'critical') return 'high';
  return null;
}

export function coachRiskCssClass(level: CoachRiskLevel | null): string {
  if (!level) return 'risk-none';
  return `risk-${level}`;
}
