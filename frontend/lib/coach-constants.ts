/**
 * Koç portalı sabitleri — backend RiskEngine / admin coaching modülü ile uyumlu.
 */

/** RiskEngine.INACTIVITY_DAYS_CRITICAL — görüşme takibi eşiği (gün) */
export const COACH_MEETING_FOLLOWUP_DAYS = 14;

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
