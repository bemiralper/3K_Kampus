'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { handleLandingNav } from '@/lib/landing-nav';
import {
  HAKKIMIZDA_CLOSING,
  HAKKIMIZDA_META,
  HAKKIMIZDA_NAV,
  HAKKIMIZDA_SECTIONS,
  THREE_K_PILLARS,
  VALUES,
  VISION_MISSION,
} from '@/lib/hakkimizda-content';

const ICONS: Record<string, ReactNode> = {
  book: <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" />,
  library: <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z" />,
  coach: <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />,
};

export default function HakkimizdaContent() {
  const pathname = usePathname();

  return (
    <div className="hak-page">
      <section className="hak-hero">
        <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
          <p className="hak-brand">{HAKKIMIZDA_META.brand}</p>
          <h1 className="hak-title">{HAKKIMIZDA_META.title}</h1>
          <p className="hak-subtitle">{HAKKIMIZDA_META.subtitle}</p>
          <div className="hak-intro">
            {HAKKIMIZDA_META.intro.map(p => (
              <p key={p.slice(0, 32)}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <nav className="hak-subnav sticky top-[4.25rem] z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2.5 lg:px-8">
          {HAKKIMIZDA_NAV.map(item => (
            <a key={item.id} href={`#${item.id}`} className="hak-subnav-link">
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8 lg:py-16">
        <div className="space-y-10">
          {HAKKIMIZDA_SECTIONS.map((section, idx) => (
            <section
              key={section.id}
              id={section.id}
              className={`hak-section scroll-mt-36 ${idx % 2 === 1 ? 'hak-section-alt' : ''}`}
            >
              <div className="hak-section-head">
                <span className="hak-num">{section.number}</span>
                <h2>{section.title}</h2>
              </div>

              {'lead' in section && section.lead && (
                <p className="hak-p hak-p-em">{section.lead}</p>
              )}

              {'showPillars' in section && section.showPillars && (
                <div className="hak-3k-grid">
                  {THREE_K_PILLARS.map(p => (
                    <div key={p.title} className="hak-3k-card">
                      <span className="hak-3k-letter">{p.letter}</span>
                      <span className="hak-3k-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                          {ICONS[p.icon]}
                        </svg>
                      </span>
                      <strong>{p.title}</strong>
                      <span>{p.desc}</span>
                    </div>
                  ))}
                </div>
              )}

              {'paragraphs' in section &&
                section.paragraphs?.map(p => (
                  <p key={p.slice(0, 32)} className="hak-p">{p}</p>
                ))}

              {'footer' in section && section.footer && (
                <p className="hak-p hak-p-footer">{section.footer}</p>
              )}
            </section>
          ))}

          <section id="vizyon" className="hak-section scroll-mt-36 hak-vm-grid-wrap">
            <div className="hak-vm-grid">
              <div className="hak-vm-card hak-vm-vision">
                <h3>{VISION_MISSION.vision.title}</h3>
                <p>{VISION_MISSION.vision.text}</p>
              </div>
              <div className="hak-vm-card hak-vm-mission">
                <h3>{VISION_MISSION.mission.title}</h3>
                <p>{VISION_MISSION.mission.text}</p>
              </div>
            </div>
          </section>

          <section id="degerler" className="hak-section scroll-mt-36">
            <div className="hak-section-head">
              <span className="hak-num">5</span>
              <h2>Değerlerimiz</h2>
            </div>
            <ul className="hak-values">
              {VALUES.map(v => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          </section>
        </div>

        <section id="kapanis" className="hak-closing scroll-mt-36">
          <h2>{HAKKIMIZDA_CLOSING.title}</h2>
          {HAKKIMIZDA_CLOSING.paragraphs.map(p => (
            <p key={p.slice(0, 32)}>{p}</p>
          ))}
          <button
            type="button"
            className="hak-cta"
            onClick={() => handleLandingNav('/#iletisim', pathname)}
          >
            Bizimle İletişime Geçin
          </button>
        </section>
      </div>

      <style jsx global>{`
        .hak-page { background: #f8fafc; }
        .hak-hero {
          background: linear-gradient(145deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 55%, ${LANDING_COLORS.accent} 100%);
          color: #fff;
        }
        .hak-brand {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          opacity: 0.75;
        }
        .hak-title {
          margin: 0.75rem 0 0;
          font-size: clamp(1.75rem, 4vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.03em;
        }
        .hak-subtitle {
          margin: 0.85rem 0 0;
          font-size: clamp(1.05rem, 2.5vw, 1.35rem);
          font-weight: 600;
          opacity: 0.95;
        }
        .hak-intro { margin-top: 1.25rem; }
        .hak-intro p {
          margin: 0 0 0.75rem;
          font-size: 15px;
          line-height: 1.75;
          opacity: 0.9;
        }
        .hak-subnav-link {
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
        .hak-subnav-link:hover {
          background: #f1f5f9;
          color: ${LANDING_COLORS.accent};
        }
        .hak-section {
          padding: 1.75rem;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
        }
        .hak-section-alt { background: #f8fafc; }
        .hak-section-head {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          margin-bottom: 1rem;
          padding-bottom: 0.85rem;
          border-bottom: 1px solid #f1f5f9;
        }
        .hak-num {
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
        .hak-section-head h2 {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 800;
          color: ${LANDING_COLORS.navy};
        }
        .hak-p {
          margin: 0 0 0.75rem;
          font-size: 15px;
          line-height: 1.75;
          color: #475569;
        }
        .hak-p-em { font-weight: 600; color: ${LANDING_COLORS.navy}; }
        .hak-p-footer { margin-top: 1rem; font-weight: 500; }
        .hak-3k-grid {
          display: grid;
          gap: 0.85rem;
          margin: 1rem 0;
        }
        @media (min-width: 640px) {
          .hak-3k-grid { grid-template-columns: repeat(3, 1fr); }
        }
        .hak-3k-card {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 1.15rem;
          border-radius: 16px;
          border: 2px solid rgba(2, 98, 167, 0.15);
          background: linear-gradient(160deg, #fff 0%, #f0f7fc 100%);
        }
        .hak-3k-letter {
          position: absolute;
          top: 0.65rem;
          right: 0.75rem;
          font-size: 2rem;
          font-weight: 900;
          color: rgba(2, 98, 167, 0.12);
          line-height: 1;
        }
        .hak-3k-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: ${LANDING_COLORS.accent};
          color: #fff;
        }
        .hak-3k-card strong {
          font-size: 15px;
          color: ${LANDING_COLORS.navy};
        }
        .hak-3k-card span:last-child {
          font-size: 13px;
          line-height: 1.5;
          color: #64748b;
        }
        .hak-vm-grid-wrap { padding: 0; border: none; background: transparent; box-shadow: none; }
        .hak-vm-grid {
          display: grid;
          gap: 1rem;
        }
        @media (min-width: 768px) {
          .hak-vm-grid { grid-template-columns: 1fr 1fr; }
        }
        .hak-vm-card {
          padding: 1.5rem;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
        }
        .hak-vm-vision {
          background: linear-gradient(135deg, ${LANDING_COLORS.navy} 0%, ${LANDING_COLORS.navyLight} 100%);
          color: #fff;
          border: none;
        }
        .hak-vm-mission {
          background: #fff;
        }
        .hak-vm-card h3 {
          margin: 0 0 0.75rem;
          font-size: 1.1rem;
          font-weight: 800;
        }
        .hak-vm-mission h3 { color: ${LANDING_COLORS.navy}; }
        .hak-vm-card p {
          margin: 0;
          font-size: 14px;
          line-height: 1.7;
          opacity: 0.92;
        }
        .hak-vm-mission p { color: #475569; opacity: 1; }
        .hak-values {
          display: grid;
          gap: 0.5rem;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        @media (min-width: 640px) {
          .hak-values { grid-template-columns: 1fr 1fr; }
        }
        .hak-values li {
          padding: 0.65rem 0.85rem;
          border-radius: 10px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          font-size: 14px;
          color: #334155;
        }
        .hak-values li::before {
          content: '✓ ';
          color: ${LANDING_COLORS.accent};
          font-weight: 700;
        }
        .hak-closing {
          margin-top: 2.5rem;
          padding: 2rem;
          border-radius: 20px;
          text-align: center;
          background: linear-gradient(135deg, ${LANDING_COLORS.navy}, ${LANDING_COLORS.accent});
          color: #fff;
        }
        .hak-closing h2 {
          margin: 0 0 1rem;
          font-size: 1.5rem;
          font-weight: 800;
        }
        .hak-closing p {
          margin: 0 0 0.75rem;
          font-size: 15px;
          line-height: 1.75;
          opacity: 0.92;
        }
        .hak-cta {
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
        .hak-cta:hover { transform: translateY(-1px); }
      `}</style>
    </div>
  );
}
