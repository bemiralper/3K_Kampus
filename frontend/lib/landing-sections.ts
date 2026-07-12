import { DERS_FORMATLARI, DERS_FORMATLARI_HEADING } from '@/lib/ders-formatlari-content';
import type { DersFormatlariConfig, LandingBolum, LandingFeatureCard } from '@/lib/website-api';

export function resolveDersFormatlariConfig(config?: DersFormatlariConfig | null) {
  const cards: LandingFeatureCard[] = config?.cards?.length
    ? config.cards
    : DERS_FORMATLARI.map((c) => ({
        id: c.id,
        badge: c.badge,
        title: c.title,
        accent: c.accent,
        description: c.description,
        highlights: [...c.highlights],
      }));

  return {
    eyebrow: config?.eyebrow?.trim() || DERS_FORMATLARI_HEADING.eyebrow,
    title: config?.title?.trim() || DERS_FORMATLARI_HEADING.title,
    subtitle: config?.subtitle?.trim() || DERS_FORMATLARI_HEADING.subtitle,
    footer_note:
      config?.footer_note?.trim() ||
      'Grup dersi ve özel ders programları birlikte planlanabilir.',
    cards,
  };
}

export function resolveLandingBolum(bolum: LandingBolum): LandingBolum {
  return {
    ...bolum,
    section_id: bolum.section_id || bolum.id,
    kart_adi: bolum.kart_adi || '',
    kart_ikon: bolum.kart_ikon || 'star',
    eyebrow: bolum.eyebrow || '',
    title: bolum.title || 'Bölüm Başlığı',
    subtitle: bolum.subtitle || '',
    footer_note: bolum.footer_note || '',
    cards: bolum.cards || [],
  };
}

export const DEFAULT_NEDEN_BASLIK = 'Neden 3K Kampüs?';
export const DEFAULT_NEDEN_ALT = 'Başarıya giden yolda fark yaratan hizmetlerimiz';

export const NEDEN_IKON_OPTIONS = [
  { value: 'chart', label: 'Grafik' },
  { value: 'user', label: 'Kullanıcı' },
  { value: 'target', label: 'Hedef' },
  { value: 'bell', label: 'Bildirim' },
  { value: 'star', label: 'Yıldız' },
];

export function newFeatureCard(): LandingFeatureCard {
  return {
    id: `card-${Date.now()}`,
    badge: 'Yeni',
    title: 'Kart Başlığı',
    accent: '#0262a7',
    description: '',
    highlights: [],
  };
}

export function newLandingBolum(): LandingBolum {
  return {
    id: `bolum-${Date.now()}`,
    section_id: `bolum-${Date.now()}`,
    kart_adi: '',
    kart_ikon: 'star',
    eyebrow: 'Yeni Bölüm',
    title: 'Bölüm Başlığı',
    subtitle: 'Kısa açıklama metni',
    footer_note: '',
    cards: [newFeatureCard(), newFeatureCard()],
  };
}
