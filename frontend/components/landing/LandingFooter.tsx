'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SiteSettings, FooterLink, SocialLink } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { handleLandingNav } from '@/lib/landing-nav';
import { formatPhoneDisplay, phoneDigits } from '@/lib/phone-format';

type LandingFooterProps = {
  settings: SiteSettings | null;
  footerLinks: FooterLink[];
  socialLinks: SocialLink[];
  brandName?: string;
};

const COLUMN_TITLES: Record<string, string> = {
  kurumsal: 'Kurumsal',
  hizli: 'Hızlı Bağlantılar',
  yasal: 'Yasal',
  sosyal: 'Bizi Takip Edin',
};

const SOCIAL_META: Record<string, { label: string; icon: ReactNode }> = {
  instagram: {
    label: 'Instagram',
    icon: (
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    ),
  },
  facebook: {
    label: 'Facebook',
    icon: (
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    ),
  },
  whatsapp: {
    label: 'WhatsApp',
    icon: (
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    ),
  },
};

const HIDDEN_FOOTER_PATTERNS = ['basarilarimiz', 'başarılarımız'];
const HIDDEN_SOCIAL = new Set(['youtube']);

function shouldHideFooterLink(link: FooterLink) {
  const url = link.url.toLowerCase();
  const label = link.etiket.toLowerCase();
  return HIDDEN_FOOTER_PATTERNS.some(p => url.includes(p) || label.includes(p));
}

function normalizeFooterLink(link: FooterLink): FooterLink {
  const etiket = link.etiket === 'Kurumumuz' ? '3K Sistemi' : link.etiket;
  const url = link.url.startsWith('/kurumumuz')
    ? link.url.replace('/kurumumuz', '/3k-sistemi')
    : link.url;
  return etiket === link.etiket && url === link.url ? link : { ...link, etiket, url };
}

function FooterNavLink({ link, pathname }: { link: FooterLink; pathname: string }) {
  const item = normalizeFooterLink(link);

  if (item.url.startsWith('#') || item.url.startsWith('/#')) {
    return (
      <button type="button" className="footer-link-item" onClick={() => handleLandingNav(item.url, pathname)}>
        <span>{item.etiket}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    );
  }

  if (item.url.startsWith('/') && !item.url.startsWith('//')) {
    return (
      <Link href={item.url} className="footer-link-item">
        <span>{item.etiket}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </Link>
    );
  }

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="footer-link-item">
      <span>{item.etiket}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
    </a>
  );
}

export default function LandingFooter({ settings, footerLinks, socialLinks, brandName }: LandingFooterProps) {
  const pathname = usePathname();
  const columns = ['kurumsal', 'hizli', 'yasal', 'sosyal'] as const;
  const copyright = settings?.footer_copyright || '© 2026 3K Kampüs — Tüm hakları saklıdır.';
  const brandTitle = settings?.footer_baslik?.trim() || brandName || '3K Kampüs';
  const brandDesc = settings?.footer_aciklama?.trim()
    || 'LGS, YKS ve okul destek programları ile başarıya giden yolda dijital eğitim partneriniz.';
  const markaMetni = settings?.footer_marka_metni || '3K Kampüs, Özgün Sınav Öğretim Eğitim A.Ş. markasıdır.';

  const visibleFooterLinks = footerLinks.filter(l => l.aktif !== false && !shouldHideFooterLink(l));
  const visibleSocial = socialLinks.filter(l => l.aktif !== false && !HIDDEN_SOCIAL.has(l.platform));

  return (
    <footer className="site-footer">
      <div className="site-footer-glow" aria-hidden />
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8 lg:py-16">
        <div className="footer-top">
          <div className="footer-brand-block">
            <h3 className="footer-brand-title">{brandTitle}</h3>
            <p className="footer-brand-desc">
              {brandDesc}
            </p>
            {settings?.telefon && (
              <a href={`tel:${phoneDigits(settings.telefon)}`} className="footer-contact-chip">
                {formatPhoneDisplay(settings.telefon)}
              </a>
            )}
          </div>

          <div className="footer-columns">
            {columns.map(col => {
              const links = visibleFooterLinks.filter(l => l.kolon === col);
              if (col === 'sosyal' && visibleSocial.length === 0) return null;
              if (col !== 'sosyal' && links.length === 0) return null;

              return (
                <div key={col} className="footer-col">
                  <h4 className="footer-col-title">{COLUMN_TITLES[col]}</h4>
                  {col === 'sosyal' ? (
                    <div className="footer-social-row">
                      {visibleSocial.map(l => {
                        const meta = SOCIAL_META[l.platform];
                        return (
                          <a
                            key={l.id}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="footer-social-btn"
                            aria-label={meta?.label || l.platform}
                            title={meta?.label || l.platform}
                          >
                            {meta?.icon ? (
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">{meta.icon}</svg>
                            ) : (
                              <span>{meta?.label || l.platform}</span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <ul className="footer-link-list">
                      {links.map(l => (
                        <li key={l.id}>
                          <FooterNavLink link={l} pathname={pathname} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-brand-line">{markaMetni}</p>
          <p className="footer-copy">{copyright}</p>
        </div>
      </div>

      <style jsx global>{`
        .site-footer {
          position: relative;
          overflow: hidden;
          background: linear-gradient(180deg, ${LANDING_COLORS.navy} 0%, #152a45 100%);
          color: #fff;
        }
        .site-footer-glow {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 50% -20%, rgba(2, 98, 167, 0.35), transparent),
            radial-gradient(ellipse 40% 30% at 100% 100%, rgba(2, 98, 167, 0.15), transparent);
        }
        .footer-top {
          position: relative;
          display: grid;
          gap: 2.5rem;
        }
        @media (min-width: 1024px) {
          .footer-top { grid-template-columns: 1.1fr 2fr; }
        }
        .footer-brand-title {
          margin: 0;
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .footer-brand-desc {
          margin: 0.65rem 0 0;
          max-width: 22rem;
          font-size: 14px;
          line-height: 1.65;
          color: #cbd5e1;
        }
        .footer-contact-chip {
          display: inline-flex;
          margin-top: 1rem;
          padding: 0.45rem 0.85rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #f1f5f9;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: background 0.15s;
        }
        .footer-contact-chip:hover { background: rgba(255, 255, 255, 0.16); }
        .footer-columns {
          display: grid;
          gap: 1.75rem;
        }
        @media (min-width: 640px) {
          .footer-columns { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .footer-columns { grid-template-columns: repeat(4, 1fr); }
        }
        .footer-col-title {
          margin: 0 0 0.85rem;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .footer-link-list {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .footer-link-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem 0.65rem;
          margin: 0 -0.65rem;
          border: none;
          border-radius: 10px;
          background: transparent;
          color: #e2e8f0;
          font-size: 14px;
          font-weight: 500;
          text-align: left;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, transform 0.15s;
        }
        .footer-link-item svg {
          flex-shrink: 0;
          opacity: 0.45;
          transition: opacity 0.15s, transform 0.15s;
        }
        .footer-link-item:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
        .footer-link-item:hover svg {
          opacity: 1;
          transform: translateX(2px);
        }
        .footer-social-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .footer-social-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #f1f5f9;
          text-decoration: none;
          transition: background 0.15s, transform 0.15s, border-color 0.15s;
        }
        .footer-social-btn:hover {
          background: ${LANDING_COLORS.accent};
          border-color: ${LANDING_COLORS.accent};
          color: #fff;
          transform: translateY(-2px);
        }
        .footer-bottom {
          position: relative;
          margin-top: 2.5rem;
          padding-top: 1.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          text-align: center;
        }
        .footer-brand-line {
          margin: 0;
          font-size: 14px;
          color: #cbd5e1;
        }
        .footer-brand-line strong {
          color: #f8fafc;
          font-weight: 600;
        }
        .footer-copy {
          margin: 0.5rem 0 0;
          font-size: 13px;
          color: #94a3b8;
        }
      `}</style>
    </footer>
  );
}
