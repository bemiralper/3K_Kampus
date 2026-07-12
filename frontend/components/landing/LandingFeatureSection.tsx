'use client';

import { LANDING_COLORS } from '@/lib/landing-theme';
import type { LandingFeatureCard } from '@/lib/website-api';

const ICONS: Record<string, React.ReactNode> = {
  grup: (
    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
  ),
  ozel: (
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  ),
  default: (
    <path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z" />
  ),
};

type Props = {
  sectionId?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  footerNote?: string;
  cards: LandingFeatureCard[];
  bgClass?: string;
};

export default function LandingFeatureSection({
  sectionId,
  eyebrow,
  title,
  subtitle,
  footerNote,
  cards,
  bgClass = 'bg-white',
}: Props) {
  return (
    <section id={sectionId} className={`scroll-mt-24 py-16 lg:py-24 ${bgClass}`}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          {eyebrow && (
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: LANDING_COLORS.accent }}>
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl" style={{ color: LANDING_COLORS.navy }}>
            {title}
          </h2>
          {subtitle && <p className="mt-3 text-base leading-relaxed text-slate-500">{subtitle}</p>}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {cards.map((format) => {
            const accent = format.accent || LANDING_COLORS.accent;
            return (
              <article
                key={format.id}
                className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/50 p-8 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div
                  className="absolute -right-6 -top-6 h-32 w-32 rounded-full opacity-10 transition group-hover:opacity-20"
                  style={{ background: accent }}
                  aria-hidden
                />
                <div className="relative">
                  <div className="flex items-start justify-between gap-4">
                    <span
                      className="inline-flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                      style={{ backgroundColor: accent }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        {ICONS[format.id] || ICONS.default}
                      </svg>
                    </span>
                    {format.badge && (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
                        style={{ backgroundColor: accent }}
                      >
                        {format.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-5 text-xl font-bold" style={{ color: LANDING_COLORS.navy }}>
                    {format.title}
                  </h3>
                  {format.description && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{format.description}</p>
                  )}
                  {(format.highlights?.length ?? 0) > 0 && (
                    <ul className="mt-5 space-y-2.5">
                      {format.highlights!.map((item) => (
                        <li key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <svg className="mt-0.5 shrink-0" width="16" height="16" viewBox="0 0 24 24" fill={accent}>
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {footerNote && (
          <p className="mt-8 text-center text-sm text-slate-500">{footerNote}</p>
        )}
      </div>
    </section>
  );
}
