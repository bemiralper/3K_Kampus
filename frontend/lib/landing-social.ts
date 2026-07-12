/** Site sosyal medya platformları — admin + kamu site ortak */
export const SOCIAL_PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]['value'];

export function socialPlatformLabel(platform: string): string {
  return SOCIAL_PLATFORMS.find((p) => p.value === platform)?.label ?? platform;
}

/** Üst barda zaten ayrı WhatsApp satırı var */
export function topBarSocialLinks<T extends { platform: string; aktif?: boolean }>(links: T[]): T[] {
  return links.filter((l) => l.platform !== 'whatsapp' && l.aktif !== false);
}

export function visibleSocialLinks<T extends { platform: string; aktif?: boolean }>(links: T[]): T[] {
  return links.filter((l) => l.aktif !== false);
}
