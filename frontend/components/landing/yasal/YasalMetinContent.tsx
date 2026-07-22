'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { handleLandingNav } from '@/lib/landing-nav';
import type { YasalMetinMeta, YasalSection } from '@/lib/yasal-metin-types';
import './yasal-page.css';

type YasalMetinContentProps = {
  meta: YasalMetinMeta;
  nav: { id: string; label: string }[];
  sections: YasalSection[];
  ctaLabel?: string;
};

function SectionBody({ section }: { section: YasalSection }) {
  return (
    <>
      {section.paragraphs?.map(p => (
        <p key={p.slice(0, 40)} className="yasal-p">{p}</p>
      ))}

      {section.categories && (
        <div className="yasal-cat-grid">
          {section.categories.map(cat => (
            <div key={cat.title} className="yasal-cat-card">
              <h3>{cat.title}</h3>
              <ul>
                {cat.items.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {cat.note && <p className="yasal-cat-note">{cat.note}</p>}
            </div>
          ))}
        </div>
      )}

      {section.bullets && (
        <ul className="yasal-bullets">
          {section.bullets.map(b => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}

      {section.afterBullets?.map(p => (
        <p key={p.slice(0, 40)} className="yasal-p yasal-p-after-list">{p}</p>
      ))}

      {section.inlineLinks?.map(link => {
        const parts = link.text.split(link.label);
        return (
          <p key={link.href} className="yasal-p">
            {parts[0]}
            <Link href={link.href} className="yasal-inline-link">{link.label}</Link>
            {parts[1] ?? ''}
          </p>
        );
      })}
    </>
  );
}

export default function YasalMetinContent({
  meta,
  nav,
  sections,
  ctaLabel = 'İletişim Bölümüne Git',
}: YasalMetinContentProps) {
  const pathname = usePathname();

  return (
    <div className="yasal-page">
      <section className="yasal-hero">
        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
          <p className="yasal-brand">{meta.brand}</p>
          <h1 className="yasal-title">{meta.title}</h1>
          <p className="yasal-date">
            <span>Son Güncelleme:</span> {meta.lastUpdated}
          </p>
          <p className="yasal-intro">{meta.intro}</p>
        </div>
      </section>

      <nav className="yasal-subnav sticky top-[4.25rem] z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2.5 lg:px-8">
          {nav.map(item => (
            <a key={item.id} href={`#${item.id}`} className="yasal-subnav-link">
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
        <div className="space-y-10">
          {sections.map(section => (
            <section key={section.id} id={section.id} className="yasal-section scroll-mt-36">
              <div className="yasal-section-head">
                <span className="yasal-num">{section.number}</span>
                <h2>{section.title}</h2>
              </div>
              <SectionBody section={section} />
            </section>
          ))}
        </div>

        <div className="yasal-footer-cta">
          <p>Sorularınız için bizimle iletişime geçebilirsiniz.</p>
          <button
            type="button"
            className="yasal-cta-btn"
            onClick={() => handleLandingNav('/#iletisim', pathname)}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
