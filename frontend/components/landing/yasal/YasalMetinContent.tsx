'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { handleLandingNav } from '@/lib/landing-nav';
import type { YasalMetinMeta, YasalSection } from '@/lib/yasal-metin-types';

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

      <style jsx global>{`
        .yasal-page { background: #f8fafc; }
        .yasal-hero {
          background: linear-gradient(145deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 55%, ${LANDING_COLORS.accent} 100%);
          color: #fff;
        }
        .yasal-brand {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          opacity: 0.75;
        }
        .yasal-title {
          margin: 0.75rem 0 0;
          font-size: clamp(1.65rem, 4vw, 2.35rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          line-height: 1.15;
        }
        .yasal-date { margin: 1rem 0 0; font-size: 14px; opacity: 0.9; }
        .yasal-date span { font-weight: 600; }
        .yasal-intro {
          margin: 1rem 0 0;
          max-width: 36rem;
          font-size: 15px;
          line-height: 1.65;
          opacity: 0.88;
        }
        .yasal-subnav-link {
          flex-shrink: 0;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          text-decoration: none;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .yasal-subnav-link:hover {
          background: #f1f5f9;
          color: ${LANDING_COLORS.accent};
        }
        .yasal-section {
          padding: 1.75rem;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        }
        .yasal-section-head {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 1rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid #f1f5f9;
        }
        .yasal-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: rgba(2, 98, 167, 0.1);
          color: ${LANDING_COLORS.accent};
          font-size: 14px;
          font-weight: 800;
          flex-shrink: 0;
        }
        .yasal-section-head h2 {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 800;
          color: ${LANDING_COLORS.navy};
          letter-spacing: -0.02em;
        }
        .yasal-p {
          margin: 0 0 0.75rem;
          font-size: 15px;
          line-height: 1.75;
          color: #475569;
        }
        .yasal-p-after-list {
          margin-top: 0.5rem;
          font-weight: 500;
          color: ${LANDING_COLORS.navy};
        }
        .yasal-inline-link {
          color: ${LANDING_COLORS.accent};
          font-weight: 600;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .yasal-cat-grid {
          display: grid;
          gap: 0.85rem;
          margin-top: 0.5rem;
        }
        @media (min-width: 640px) {
          .yasal-cat-grid { grid-template-columns: 1fr 1fr; }
        }
        .yasal-cat-card {
          padding: 1rem 1.15rem;
          border-radius: 14px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .yasal-cat-card h3 {
          margin: 0 0 0.65rem;
          font-size: 14px;
          font-weight: 700;
          color: ${LANDING_COLORS.navy};
        }
        .yasal-cat-card ul { margin: 0; padding: 0; list-style: none; }
        .yasal-cat-card li {
          position: relative;
          padding: 0.2rem 0 0.2rem 0.9rem;
          font-size: 13px;
          color: #475569;
          line-height: 1.5;
        }
        .yasal-cat-card li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.55rem;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: ${LANDING_COLORS.accent};
        }
        .yasal-cat-note {
          margin: 0.65rem 0 0;
          font-size: 12px;
          line-height: 1.55;
          color: #64748b;
          font-style: italic;
        }
        .yasal-bullets {
          margin: 0.25rem 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 0.45rem;
        }
        @media (min-width: 640px) {
          .yasal-bullets { grid-template-columns: 1fr 1fr; }
        }
        .yasal-bullets li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          padding: 0.55rem 0.75rem;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 13px;
          color: #334155;
          line-height: 1.45;
        }
        .yasal-bullets li::before {
          content: '✓';
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 700;
          color: ${LANDING_COLORS.accent};
          margin-top: 1px;
        }
        .yasal-footer-cta {
          margin-top: 2.5rem;
          padding: 1.75rem;
          border-radius: 20px;
          text-align: center;
          background: linear-gradient(135deg, ${LANDING_COLORS.navy}, ${LANDING_COLORS.accent});
          color: #fff;
        }
        .yasal-footer-cta p { margin: 0; font-size: 15px; opacity: 0.92; }
        .yasal-cta-btn {
          display: inline-flex;
          margin-top: 1rem;
          padding: 0.65rem 1.35rem;
          border-radius: 999px;
          border: none;
          background: #fff;
          color: ${LANDING_COLORS.navy};
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.15s;
        }
        .yasal-cta-btn:hover { transform: translateY(-1px); }
      `}</style>
    </div>
  );
}
