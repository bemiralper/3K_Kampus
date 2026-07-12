/** CMS v2 blok tipi paleti — backend registry ile uyumlu etiketler/kategoriler */

export type BlockCategory = 'layout' | 'content' | 'media' | 'embed' | 'dynamic' | 'code';

export type BlockTypeDef = {
  type: string;
  label: string;
  category: BlockCategory;
  defaults: Record<string, unknown>;
};

export const DEFAULT_BLOCK_STYLE = {
  visibility: { desktop: true, tablet: true, mobile: true },
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  margin: { top: 0, right: 0, bottom: 0, left: 0 },
  background: '',
  overlay: '',
  gradient: '',
  borderRadius: '',
  shadow: '',
  animation: '',
  animationDelay: 0,
  zIndex: 0,
  className: '',
  id: '',
};

export const BLOCK_TYPES: BlockTypeDef[] = [
  {
    type: 'hero',
    label: 'Hero',
    category: 'layout',
    defaults: {
      title: '',
      subtitle: '',
      description: '',
      button1: { label: '', url: '' },
      button2: { label: '', url: '' },
      imageUrl: '',
      mobileImageUrl: '',
      videoUrl: '',
      alignment: 'center',
      overlay: 'rgba(0,0,0,0.35)',
    },
  },
  { type: 'slider', label: 'Slider', category: 'media', defaults: { slides: [], autoplay: true, intervalMs: 5000 } },
  { type: 'banner', label: 'Banner', category: 'layout', defaults: { title: '', imageUrl: '', linkUrl: '', height: 280 } },
  { type: 'richText', label: 'Metin', category: 'content', defaults: { html: '', markdown: '' } },
  { type: 'heading', label: 'Başlık', category: 'content', defaults: { text: '', level: 2, align: 'left' } },
  { type: 'button', label: 'Buton', category: 'content', defaults: { label: 'Tıkla', url: '#', variant: 'primary', align: 'left' } },
  { type: 'image', label: 'Resim', category: 'media', defaults: { src: '', alt: '', caption: '', linkUrl: '' } },
  { type: 'gallery', label: 'Galeri', category: 'media', defaults: { images: [], columns: 3 } },
  { type: 'video', label: 'Video', category: 'media', defaults: { src: '', poster: '', autoplay: false } },
  { type: 'youtube', label: 'YouTube', category: 'media', defaults: { videoId: '', title: '' } },
  { type: 'map', label: 'Harita', category: 'embed', defaults: { embedUrl: '', height: 360 } },
  { type: 'counter', label: 'Sayaç', category: 'content', defaults: { items: [] } },
  { type: 'iconBoxes', label: 'İkon Kutuları', category: 'content', defaults: { items: [], columns: 3 } },
  { type: 'cards', label: 'Kartlar', category: 'content', defaults: { items: [], columns: 3 } },
  { type: 'accordion', label: 'Accordion', category: 'content', defaults: { items: [] } },
  { type: 'timeline', label: 'Timeline', category: 'content', defaults: { items: [] } },
  {
    type: 'cta',
    label: 'CTA',
    category: 'layout',
    defaults: { title: '', description: '', buttonLabel: '', buttonUrl: '' },
  },
  { type: 'testimonials', label: 'Referanslar', category: 'content', defaults: { items: [] } },
  { type: 'staff', label: 'Personeller', category: 'content', defaults: { items: [] } },
  { type: 'faq', label: 'SSS', category: 'content', defaults: { items: [], source: 'manual' } },
  { type: 'duyurularList', label: 'Duyurular', category: 'dynamic', defaults: { limit: 6, kind: 'duyuru' } },
  { type: 'haberlerList', label: 'Haberler', category: 'dynamic', defaults: { limit: 6, kind: 'haber' } },
  { type: 'blogList', label: 'Blog', category: 'dynamic', defaults: { limit: 6, kind: 'blog' } },
  { type: 'etkinliklerList', label: 'Etkinlikler', category: 'dynamic', defaults: { limit: 6, kind: 'etkinlik' } },
  { type: 'sinavTakvim', label: 'Sınav Takvimi', category: 'dynamic', defaults: { limit: 12, tur: '' } },
  { type: 'form', label: 'Form', category: 'dynamic', defaults: { formSlug: '', formId: null } },
  { type: 'html', label: 'HTML', category: 'code', defaults: { html: '' } },
  { type: 'javascript', label: 'JavaScript', category: 'code', defaults: { code: '' } },
  { type: 'css', label: 'CSS', category: 'code', defaults: { code: '' } },
  { type: 'spacer', label: 'Spacer', category: 'layout', defaults: { height: 32 } },
  { type: 'divider', label: 'Divider', category: 'layout', defaults: { style: 'solid', color: '#e5e7eb' } },
];

export const BLOCK_TYPE_MAP = Object.fromEntries(BLOCK_TYPES.map((b) => [b.type, b])) as Record<string, BlockTypeDef>;

export const CATEGORY_LABELS: Record<BlockCategory, string> = {
  layout: 'Düzen',
  content: 'İçerik',
  media: 'Medya',
  embed: 'Gömülü',
  dynamic: 'Dinamik',
  code: 'Kod',
};

export function createBlock(type: string): {
  id: string;
  type: string;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
} {
  const def = BLOCK_TYPE_MAP[type];
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    type,
    props: { ...(def?.defaults || {}) },
    style: { ...DEFAULT_BLOCK_STYLE, visibility: { ...DEFAULT_BLOCK_STYLE.visibility } },
  };
}

export function getBlockLabel(type: string): string {
  return BLOCK_TYPE_MAP[type]?.label || type;
}
