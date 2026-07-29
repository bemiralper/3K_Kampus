'use client';

import type { AkademikSubId } from './types';

const ICONS: Record<AkademikSubId, JSX.Element> = {
  genel: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  'ozel-dersler': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h1" />
      <path d="M16 14l2.5 2.5L22 13" />
    </svg>
  ),
  'sinif-dersleri': (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  sinavlar: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  devamsizlik: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <path d="M9.5 14.5l5 5M14.5 14.5l-5 5" />
    </svg>
  ),
  odevler: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z" />
      <path d="M9 9h6M9 13h4" />
    </svg>
  ),
  analiz: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-6 3 3 5-8" />
    </svg>
  ),
};

const ALL_ITEMS: { id: AkademikSubId; label: string }[] = [
  { id: 'genel', label: 'Genel Bakış' },
  { id: 'ozel-dersler', label: 'Özel Dersler' },
  { id: 'sinif-dersleri', label: 'Sınıf Dersleri' },
  { id: 'sinavlar', label: 'Sınavlar' },
  { id: 'devamsizlik', label: 'Devamsızlık' },
  { id: 'odevler', label: 'Ödevler' },
  { id: 'analiz', label: 'Akademik Analiz' },
];

type Props = {
  active: AkademikSubId;
  onChange: (id: AkademikSubId) => void;
  showOzelDersler: boolean;
  showSinifDersleri: boolean;
};

export default function AkademikSubNav({
  active,
  onChange,
  showOzelDersler,
  showSinifDersleri,
}: Props) {
  const items = ALL_ITEMS.filter((item) => {
    if (item.id === 'ozel-dersler') return showOzelDersler;
    if (item.id === 'sinif-dersleri') return showSinifDersleri;
    return true;
  });

  return (
    <nav className="akd-subnav" aria-label="Akademik alt menü">
      <div className="akd-subnav-track">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`akd-subnav-item${active === item.id ? ' is-active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="akd-subnav-icon">{ICONS[item.id]}</span>
            <span className="akd-subnav-label">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
