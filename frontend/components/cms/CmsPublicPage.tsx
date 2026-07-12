'use client';

import { useMemo } from 'react';
import type { CmsBlock, CmsPublicPagePayload } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { DEFAULT_APP_LOGO } from '@/lib/kurum-branding';
import { BlocksRenderer } from '@/components/cms/BlockRenderer';
import CmsPreloader from '@/components/cms/CmsPreloader';
import FloatingDockNav, { cmsItemsToDock } from '@/components/cms/FloatingDockNav';
import '@/components/cms/cms.css';
import '@/components/cms/cms-public.css';

type Props = {
  payload: CmsPublicPagePayload;
};

function splitHero(blocks: CmsBlock[] | undefined): { hero: CmsBlock[]; rest: CmsBlock[] } {
  if (!blocks?.length) return { hero: [], rest: [] };
  if (blocks[0]?.type === 'hero') {
    return { hero: [blocks[0]], rest: blocks.slice(1) };
  }
  return { hero: [], rest: blocks };
}

export default function CmsPublicPage({ payload }: Props) {
  const { page, menu, footer_menu, theme, integrations } = payload;
  const primary = theme?.primary_color || '#0262a7';
  const bodyStart = integrations?.body_start_code?.trim();
  const bodyEnd = integrations?.body_end_code?.trim();
  const footer = (theme?.footer_config || {}) as Record<string, string>;
  const brand = footer.title || '3K Kampüs';

  const { hero, rest } = useMemo(() => splitHero(page.blocks || []), [page.blocks]);
  const dockItems = useMemo(() => cmsItemsToDock(menu?.items), [menu?.items]);

  const logoUrl =
    resolveMediaUrl(theme?.logo_url)
    || resolveMediaUrl(theme?.favicon_url)
    || DEFAULT_APP_LOGO;

  return (
    <div
      className="cms-public-page cms-public-page--dock"
      style={{
        ['--cms-accent' as string]: primary,
        ['--cms-brand' as string]: primary,
        ['--fd-accent' as string]: primary,
        ['--fd-navy' as string]: '#1e3a5f',
      }}
    >
      <CmsPreloader />
      {theme?.custom_css ? <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} /> : null}
      {bodyStart ? <div dangerouslySetInnerHTML={{ __html: bodyStart }} suppressHydrationWarning /> : null}

      <main className="cms-pub-main cms-pub-main--dock">
        {hero.length ? <BlocksRenderer blocks={hero} /> : null}

        <FloatingDockNav
          items={dockItems}
          logoUrl={logoUrl}
          brandName={brand}
          loginHref="/login"
          loginLabel="Giriş Yap"
          stickyOffset={220}
        />

        {rest.length ? <BlocksRenderer blocks={rest} /> : null}
        {!hero.length && !rest.length ? <BlocksRenderer blocks={page.blocks || []} /> : null}
      </main>

      <footer className="cms-pub-footer">
        <div className="cms-pub-footer-inner">
          <div>
            <strong>{brand}</strong>
            {footer.description ? <p>{footer.description}</p> : null}
            {footer.telefon ? <p>Tel: {footer.telefon}</p> : null}
            {footer.eposta ? <p>{footer.eposta}</p> : null}
            {footer.adres ? <p>{footer.adres}</p> : null}
          </div>
          {footer_menu?.items?.length ? (
            <nav aria-label="Footer">
              {footer_menu.items.map((item) => (
                <a key={item.id} href={item.url || '#'}>{item.label}</a>
              ))}
            </nav>
          ) : null}
        </div>
        <p className="cms-pub-copy">{footer.copyright || `© ${new Date().getFullYear()} ${brand}`}</p>
      </footer>

      {bodyEnd ? <div dangerouslySetInnerHTML={{ __html: bodyEnd }} suppressHydrationWarning /> : null}
    </div>
  );
}
