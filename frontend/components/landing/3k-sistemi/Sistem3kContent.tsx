'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { handleLandingNav } from '@/lib/landing-nav';
import {
  SISTEM_3K_CLOSING,
  SISTEM_3K_HERO,
  SISTEM_3K_NAV,
  SISTEM_3K_SECTIONS,
} from '@/lib/3k-sistemi-content';

const ICONS: Record<string, React.ReactNode> = {
  graduation: <path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />,
  chart: <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />,
  user: <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />,
  lightbulb: <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />,
  book: <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />,
  library: <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />,
  coach: <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />,
  device: <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />,
  analytics: <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />,
  chat: <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />,
};

function SectionIcon({ name }: { name: string }) {
  return (
    <span className="kurum-icon-wrap">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">{ICONS[name]}</svg>
    </span>
  );
}

export default function Sistem3kContent() {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState(SISTEM_3K_NAV[0]?.id ?? 'egitim');
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const sectionIds = [...SISTEM_3K_NAV.map(n => n.id), 'hedef'];
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const id = entry.target.id;
          if (entry.isIntersecting) {
            setVisibleIds(prev => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
          }
          if (entry.isIntersecting && entry.intersectionRatio >= 0.15) {
            setActiveSection(id);
          }
        });
      },
      { rootMargin: '-25% 0px -50% 0px', threshold: [0, 0.15, 0.4] },
    );

    sectionIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToId = (id: string) => {
    const el = document.getElementById(id.replace('#', ''));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="kurum-page">
      {/* Hero */}
      <section className="kurum-hero">
        <div className="kurum-hero-inner mx-auto max-w-7xl px-4 lg:px-8">
          <p className="kurum-eyebrow">3K Kampüs</p>
          <h1 className="kurum-hero-title">{SISTEM_3K_HERO.title}</h1>
          <p className="kurum-hero-sub">{SISTEM_3K_HERO.subtitle}</p>
          <div className="kurum-hero-intro">
            {SISTEM_3K_HERO.intro.map(line => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <div className="kurum-pillars">
            {SISTEM_3K_HERO.pillars.map(p => (
              <button
                key={p.label}
                type="button"
                className="kurum-pillar kurum-pillar-live"
                onClick={() => scrollToId(p.href)}
              >
                <SectionIcon name={p.icon} />
                <strong>{p.label}</strong>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Sticky alt menü */}
      <nav className="kurum-subnav sticky top-[4.25rem] z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2.5 lg:px-8">
          {SISTEM_3K_NAV.map(item => (
            <button
              key={item.id}
              type="button"
              className={`kurum-subnav-link${activeSection === item.id ? ' is-active' : ''}`}
              onClick={() => scrollToId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* İçerik bölümleri */}
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8 lg:py-16">
        <div className="space-y-20 lg:space-y-28">
          {SISTEM_3K_SECTIONS.map((section, idx) => (
            <section
              key={section.id}
              id={section.id}
              className={`kurum-section scroll-mt-36 ${idx % 2 === 1 ? 'kurum-section-alt' : ''}${visibleIds.has(section.id) ? ' is-visible' : ''}`}
            >
              <div className="kurum-section-head">
                <SectionIcon name={section.icon} />
                <h2>{section.title}</h2>
              </div>

              {'body' in section && section.body && (
                <p className="kurum-lead">{section.body}</p>
              )}

              {'lead' in section && section.lead && (
                <p className="kurum-lead-em">{section.lead}</p>
              )}

              {'bullets' in section && section.bullets && (
                <ul className="kurum-checklist">
                  {section.bullets.map(b => (
                    <li key={b}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      {b}
                    </li>
                  ))}
                </ul>
              )}

              {'tags' in section && section.tags && (
                <div className="kurum-tags">
                  {section.tags.map(tag => (
                    <span
                      key={tag}
                      className={`kurum-tag${tag.includes('grup') || tag.includes('özel') || tag.includes('Birebir') ? ' kurum-tag-featured' : ''}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {'highlights' in section && section.highlights && (
                <div className="kurum-highlight-grid">
                  {section.highlights.map((card, cardIdx) => (
                    <div
                      key={card.title}
                      className={`kurum-highlight-card kurum-card-live${visibleIds.has(section.id) ? ' is-visible' : ''}`}
                      style={{
                        borderColor: `${card.accent}33`,
                        transitionDelay: visibleIds.has(section.id) ? `${cardIdx * 80}ms` : '0ms',
                      }}
                    >
                      <span className="kurum-highlight-badge" style={{ backgroundColor: card.accent }}>
                        {card.badge}
                      </span>
                      <h3 style={{ color: LANDING_COLORS.navy }}>{card.title}</h3>
                      <p>{card.description}</p>
                      <ul>
                        {card.bullets.map(item => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {'footer' in section && section.footer && !('columns' in section) && (
                <p className="kurum-body">{section.footer}</p>
              )}

              {'columns' in section && section.columns && (
                <div className="kurum-dual-grid">
                  {section.columns.map((col, colIdx) => (
                    <div
                      key={col.title}
                      className={`kurum-dual-card kurum-card-live${visibleIds.has(section.id) ? ' is-visible' : ''}`}
                      style={{ transitionDelay: visibleIds.has(section.id) ? `${colIdx * 100}ms` : '0ms' }}
                    >
                      <h3>{col.title}</h3>
                      <ul>
                        {col.items.map(item => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                      {'footer' in col && col.footer && (
                        <p className="kurum-dual-footer">{col.footer}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      {/* Kapanış */}
      <section id="hedef" className="kurum-closing scroll-mt-36">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center lg:px-8 lg:py-20">
          <h2>{SISTEM_3K_CLOSING.title}</h2>
          {SISTEM_3K_CLOSING.paragraphs.map(p => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
          <button
            type="button"
            className="kurum-cta"
            onClick={() => handleLandingNav('/#iletisim', pathname)}
          >
            Bizimle İletişime Geçin
          </button>
        </div>
      </section>

      <style jsx global>{`
        .kurum-page {
          background: #fff;
        }
        .kurum-hero {
          background: linear-gradient(145deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 55%, ${LANDING_COLORS.accent} 100%);
          color: #fff;
          padding: 3.5rem 0 4rem;
        }
        .kurum-eyebrow {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: 0.75;
          margin: 0 0 0.75rem;
        }
        .kurum-hero-title {
          font-size: clamp(2rem, 5vw, 3rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: 0;
          line-height: 1.1;
        }
        .kurum-hero-sub {
          margin: 1rem 0 0;
          font-size: clamp(1.1rem, 2.5vw, 1.45rem);
          font-weight: 600;
          opacity: 0.95;
        }
        .kurum-hero-intro {
          margin-top: 1.5rem;
          max-width: 42rem;
        }
        .kurum-hero-intro p {
          margin: 0 0 0.65rem;
          font-size: 1.05rem;
          line-height: 1.7;
          opacity: 0.9;
        }
        .kurum-pillars {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          margin-top: 2.5rem;
        }
        .kurum-pillar {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 1.25rem;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(8px);
          text-align: left;
        }
        .kurum-pillar-live {
          cursor: pointer;
          width: 100%;
          font: inherit;
          color: inherit;
          transition: transform 0.25s ease, background 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .kurum-pillar-live:hover {
          transform: translateY(-5px);
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.35);
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.2);
        }
        .kurum-pillar-live:active {
          transform: translateY(-2px);
        }
        .kurum-pillar strong {
          font-size: 15px;
        }
        .kurum-pillar span {
          font-size: 13px;
          opacity: 0.85;
          line-height: 1.5;
        }
        .kurum-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: rgba(2, 98, 167, 0.12);
          color: ${LANDING_COLORS.accent};
          margin-bottom: 0.5rem;
        }
        .kurum-hero .kurum-icon-wrap {
          background: rgba(255, 255, 255, 0.15);
          color: #fff;
        }
        .kurum-subnav-link {
          flex-shrink: 0;
          padding: 0.4rem 0.85rem;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          text-decoration: none;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .kurum-subnav-link:hover {
          background: #f1f5f9;
          color: ${LANDING_COLORS.accent};
        }
        .kurum-subnav-link.is-active {
          background: ${LANDING_COLORS.accent};
          color: #fff;
          box-shadow: 0 4px 14px rgba(2, 98, 167, 0.35);
        }
        .kurum-section {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.55s ease, transform 0.55s ease;
        }
        .kurum-section.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .kurum-section-head {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }
        .kurum-section-head h2 {
          margin: 0;
          font-size: clamp(1.5rem, 3vw, 1.875rem);
          font-weight: 800;
          color: ${LANDING_COLORS.navy};
          letter-spacing: -0.02em;
        }
        .kurum-section-alt {
          padding: 2rem;
          margin: 0 -2rem;
          border-radius: 24px;
          background: #f8fafc;
        }
        @media (max-width: 640px) {
          .kurum-section-alt {
            margin: 0 -1rem;
            padding: 1.25rem;
            border-radius: 16px;
          }
        }
        .kurum-lead {
          font-size: 1.05rem;
          line-height: 1.75;
          color: #475569;
          max-width: 48rem;
          margin: 0 0 1rem;
        }
        .kurum-lead-em {
          font-weight: 600;
          color: ${LANDING_COLORS.navy};
          margin: 1.25rem 0 0.75rem;
        }
        .kurum-body {
          margin: 1.25rem 0 0;
          font-size: 1rem;
          line-height: 1.75;
          color: #475569;
          max-width: 48rem;
        }
        .kurum-checklist {
          list-style: none;
          padding: 0;
          margin: 0.5rem 0 0;
          display: grid;
          gap: 0.65rem;
          max-width: 40rem;
        }
        .kurum-checklist li {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          padding: 0.85rem 1rem;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          color: #334155;
          line-height: 1.5;
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .kurum-checklist li:hover {
          transform: translateX(4px);
          border-color: rgba(2, 98, 167, 0.25);
          box-shadow: 0 4px 12px rgba(2, 98, 167, 0.08);
        }
        .kurum-checklist svg {
          flex-shrink: 0;
          margin-top: 2px;
          color: ${LANDING_COLORS.accent};
        }
        .kurum-section-alt .kurum-checklist li {
          background: #fff;
        }
        .kurum-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 1rem 0;
        }
        .kurum-tag {
          padding: 0.45rem 0.9rem;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
          color: ${LANDING_COLORS.accent};
          background: rgba(2, 98, 167, 0.08);
          border: 1px solid rgba(2, 98, 167, 0.15);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .kurum-tag:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(2, 98, 167, 0.12);
        }
        .kurum-tag-featured {
          color: #fff;
          background: ${LANDING_COLORS.navy};
          border-color: ${LANDING_COLORS.navy};
        }
        .kurum-highlight-grid {
          display: grid;
          gap: 1.25rem;
          margin-top: 1.25rem;
        }
        @media (min-width: 768px) {
          .kurum-highlight-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .kurum-highlight-card {
          padding: 1.5rem;
          border-radius: 20px;
          border: 2px solid #e2e8f0;
          background: #fff;
        }
        .kurum-card-live {
          opacity: 0;
          transform: translateY(20px);
          transition:
            opacity 0.5s ease,
            transform 0.5s ease,
            box-shadow 0.25s ease,
            border-color 0.25s ease;
        }
        .kurum-card-live.is-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .kurum-card-live:hover {
          transform: translateY(-6px);
          box-shadow: 0 20px 48px rgba(2, 98, 167, 0.14);
          border-color: rgba(2, 98, 167, 0.35);
        }
        .kurum-card-live.is-visible:hover {
          transform: translateY(-6px);
        }
        .kurum-highlight-badge {
          display: inline-block;
          padding: 0.25rem 0.65rem;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #fff;
        }
        .kurum-highlight-card h3 {
          margin: 0.85rem 0 0.5rem;
          font-size: 1.15rem;
          font-weight: 800;
        }
        .kurum-highlight-card p {
          margin: 0;
          font-size: 14px;
          line-height: 1.65;
          color: #475569;
        }
        .kurum-highlight-card ul {
          margin: 1rem 0 0;
          padding: 0;
          list-style: none;
        }
        .kurum-highlight-card li {
          position: relative;
          padding: 0.35rem 0 0.35rem 1.2rem;
          font-size: 14px;
          color: #334155;
          line-height: 1.5;
        }
        .kurum-highlight-card li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.7rem;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${LANDING_COLORS.accent};
        }
        .kurum-dual-grid {
          display: grid;
          gap: 1.25rem;
          margin-top: 1.25rem;
        }
        @media (min-width: 768px) {
          .kurum-dual-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .kurum-dual-card {
          padding: 1.5rem;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        .kurum-dual-card h3 {
          margin: 0 0 1rem;
          font-size: 1.1rem;
          font-weight: 700;
          color: ${LANDING_COLORS.navy};
        }
        .kurum-dual-card ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .kurum-dual-card li {
          position: relative;
          padding: 0.4rem 0 0.4rem 1.25rem;
          font-size: 14px;
          color: #475569;
          line-height: 1.55;
        }
        .kurum-dual-card li::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.75rem;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${LANDING_COLORS.accent};
        }
        .kurum-dual-footer {
          margin: 0.75rem 0 0;
          font-size: 14px;
          color: #64748b;
          font-style: italic;
        }
        .kurum-closing {
          background: linear-gradient(135deg, ${LANDING_COLORS.navy}, ${LANDING_COLORS.accent});
          color: #fff;
        }
        .kurum-closing h2 {
          font-size: 1.875rem;
          font-weight: 800;
          margin: 0 0 1.25rem;
        }
        .kurum-closing p {
          font-size: 1.05rem;
          line-height: 1.75;
          opacity: 0.92;
          margin: 0 0 1rem;
        }
        .kurum-cta {
          display: inline-flex;
          margin-top: 1.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 999px;
          border: none;
          background: #fff;
          color: ${LANDING_COLORS.navy};
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }
        .kurum-cta:hover {
          transform: translateY(-2px);
        }
      `}</style>
    </div>
  );
}
