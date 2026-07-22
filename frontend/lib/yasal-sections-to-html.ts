import type { YasalMetinMeta, YasalSection } from '@/lib/yasal-metin-types';
import { buildYasalNav } from '@/lib/yasal-metin-types';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSectionBody(section: YasalSection): string {
  const parts: string[] = [];

  for (const p of section.paragraphs ?? []) {
    parts.push(`<p class="yasal-p">${escapeHtml(p)}</p>`);
  }

  if (section.categories?.length) {
    parts.push('<div class="yasal-cat-grid">');
    for (const cat of section.categories) {
      parts.push('<div class="yasal-cat-card">');
      parts.push(`<h3>${escapeHtml(cat.title)}</h3><ul>`);
      for (const item of cat.items) {
        parts.push(`<li>${escapeHtml(item)}</li>`);
      }
      parts.push('</ul>');
      if (cat.note) {
        parts.push(`<p class="yasal-cat-note">${escapeHtml(cat.note)}</p>`);
      }
      parts.push('</div>');
    }
    parts.push('</div>');
  }

  if (section.bullets?.length) {
    parts.push('<ul class="yasal-bullets">');
    for (const b of section.bullets) {
      parts.push(`<li>${escapeHtml(b)}</li>`);
    }
    parts.push('</ul>');
  }

  for (const p of section.afterBullets ?? []) {
    parts.push(`<p class="yasal-p yasal-p-after-list">${escapeHtml(p)}</p>`);
  }

  for (const link of section.inlineLinks ?? []) {
    const idx = link.text.indexOf(link.label);
    const before = idx >= 0 ? link.text.slice(0, idx) : link.text;
    const after = idx >= 0 ? link.text.slice(idx + link.label.length) : '';
    parts.push(
      `<p class="yasal-p">${escapeHtml(before)}<a href="${escapeHtml(link.href)}" class="yasal-inline-link">${escapeHtml(link.label)}</a>${escapeHtml(after)}</p>`,
    );
  }

  return parts.join('');
}

/** KVKK şablonuyla uyumlu tam sayfa HTML — CMS İçerik (HTML) alanına yazılır */
export function buildYasalPageHtml(meta: YasalMetinMeta, sections: YasalSection[]): string {
  const nav = buildYasalNav(sections);
  const parts: string[] = [];

  parts.push('<section class="yasal-hero">');
  parts.push('<div class="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">');
  parts.push(`<p class="yasal-brand">${escapeHtml(meta.brand)}</p>`);
  parts.push(`<h1 class="yasal-title">${escapeHtml(meta.title)}</h1>`);
  parts.push(`<p class="yasal-date"><span>Son Güncelleme:</span> ${escapeHtml(meta.lastUpdated)}</p>`);
  parts.push(`<p class="yasal-intro">${escapeHtml(meta.intro)}</p>`);
  parts.push('</div></section>');

  parts.push(
    '<nav class="yasal-subnav sticky top-[4.25rem] z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg">',
  );
  parts.push('<div class="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2.5 lg:px-8">');
  for (const item of nav) {
    parts.push(`<a href="#${escapeHtml(item.id)}" class="yasal-subnav-link">${escapeHtml(item.label)}</a>`);
  }
  parts.push('</div></nav>');

  parts.push('<div class="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16"><div class="space-y-10">');
  for (const section of sections) {
    parts.push(`<section id="${escapeHtml(section.id)}" class="yasal-section scroll-mt-36">`);
    parts.push('<div class="yasal-section-head">');
    parts.push(`<span class="yasal-num">${section.number}</span>`);
    parts.push(`<h2>${escapeHtml(section.title)}</h2>`);
    parts.push('</div>');
    parts.push(renderSectionBody(section));
    parts.push('</section>');
  }
  parts.push('</div>');

  parts.push('<div class="yasal-footer-cta">');
  parts.push('<p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>');
  parts.push('<p><a href="/#iletisim" class="yasal-cta-btn">İletişim Bölümüne Git</a></p>');
  parts.push('</div></div>');

  return parts.join('');
}

export function isPublishedYasalHtml(raw: string | null | undefined): boolean {
  const text = raw?.trim() ?? '';
  return text.includes('yasal-section') && text.includes('yasal-hero');
}

export function isLegacyJsonYasalContent(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const text = raw.trim();
  return text.startsWith('{') && text.includes('"sections"');
}

export function isPlaceholderYasalHtml(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return true;
  if (isPublishedYasalHtml(raw)) return false;
  if (isLegacyJsonYasalContent(raw)) return true;
  const text = raw.toLowerCase();
  if (
    text.includes('gizlilik politikası metni.')
    || text.includes('kvkk aydınlatma metni.')
    || text.includes('platform kullanım koşulları.')
    || text.includes('metni buradan düzenleyin')
    || text.includes('örnek bir kvkk')
    || text.includes('örnek metindir')
    || text.includes('bu metni güncelleyin')
    || text.includes('bu metni kurum')
  ) {
    return true;
  }
  return raw.length < 2000;
}
