'use client';

import type { SiteSettings, SocialLink } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';
import { formatPhoneDisplay, phoneDigits } from '@/lib/phone-format';
import { topBarSocialLinks } from '@/lib/landing-social';
import { resolveCompanyInfo } from '@/lib/company-info';

type TopBarProps = {
  settings: SiteSettings | null;
  socialLinks: SocialLink[];
};

function PhoneStrip({ phones }: { phones: string[] }) {
  if (!phones.length) return null;
  return (
    <div className="topbar-phones" aria-label="Telefon numaraları">
      <PhoneIcon />
      <div className="topbar-phones-list">
        {phones.map((tel, i) => (
          <span key={tel} className="topbar-phone-item">
            {i > 0 ? <span className="topbar-phone-sep" aria-hidden>·</span> : null}
            <a href={`tel:${phoneDigits(tel)}`}>{formatPhoneDisplay(tel)}</a>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TopBar({ settings, socialLinks }: TopBarProps) {
  const company = resolveCompanyInfo(settings);
  const phones = company.telefonler;
  const whatsapp = settings?.whatsapp || '';
  const email = company.eposta;
  const social = topBarSocialLinks(socialLinks);

  return (
    <div className="topbar-desktop" style={{ backgroundColor: LANDING_COLORS.navy }}>
      <div className="topbar-desktop-inner">
        <div className="topbar-left">
          <PhoneStrip phones={phones} />
          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="topbar-chip"
            >
              <WhatsAppIcon /> WhatsApp
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="topbar-chip">
              <MailIcon /> {email}
            </a>
          ) : null}
        </div>
        <div className="topbar-social">
          {social.map((link) => (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="topbar-social-link"
              aria-label={link.platform}
            >
              <SocialIcon platform={link.platform} />
            </a>
          ))}
        </div>
      </div>
      <TopBarStyles />
    </div>
  );
}

export function TopBarMobile({ settings }: { settings: SiteSettings | null }) {
  const company = resolveCompanyInfo(settings);
  const phones = company.telefonler;
  const whatsapp = settings?.whatsapp || '';
  const email = company.eposta;

  return (
    <div className="topbar-mobile" style={{ backgroundColor: LANDING_COLORS.navy }}>
      <div className="topbar-mobile-track">
        {phones.map((tel) => (
          <a key={tel} href={`tel:${phoneDigits(tel)}`} className="topbar-mobile-chip">
            <PhoneIcon /> {formatPhoneDisplay(tel)}
          </a>
        ))}
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="topbar-mobile-chip"
          >
            <WhatsAppIcon /> WhatsApp
          </a>
        ) : null}
        {email ? (
          <a href={`mailto:${email}`} className="topbar-mobile-chip">
            <MailIcon /> {email}
          </a>
        ) : null}
      </div>
      <TopBarStyles />
    </div>
  );
}

function TopBarStyles() {
  return (
    <style jsx global>{`
      .topbar-desktop {
        display: none;
        color: #fff;
        font-size: 12px;
      }
      @media (min-width: 768px) {
        .topbar-desktop { display: block; }
      }
      .topbar-desktop-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        min-height: 2.5rem;
        padding: 0.35rem 1rem;
      }
      @media (min-width: 1024px) {
        .topbar-desktop-inner { padding-left: 2rem; padding-right: 2rem; }
      }
      .topbar-left {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.65rem 1rem;
        min-width: 0;
      }
      .topbar-phones {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        min-width: 0;
      }
      .topbar-phones svg {
        flex-shrink: 0;
        opacity: 0.85;
      }
      .topbar-phones-list {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.15rem 0;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        letter-spacing: 0.01em;
      }
      .topbar-phone-item {
        display: inline-flex;
        align-items: center;
      }
      .topbar-phone-sep {
        margin: 0 0.4rem;
        opacity: 0.45;
        font-weight: 400;
      }
      .topbar-phones a {
        color: #fff;
        text-decoration: none;
        white-space: nowrap;
      }
      .topbar-phones a:hover { opacity: 0.85; text-decoration: underline; }
      .topbar-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        color: #e2e8f0;
        text-decoration: none;
        white-space: nowrap;
      }
      .topbar-chip:hover { color: #fff; opacity: 0.95; }
      .topbar-social {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
      }
      .topbar-social-link {
        color: #fff;
        opacity: 0.9;
      }
      .topbar-social-link:hover { opacity: 1; }

      .topbar-mobile {
        display: block;
        color: #fff;
        overflow: hidden;
      }
      @media (min-width: 768px) {
        .topbar-mobile { display: none; }
      }
      .topbar-mobile-track {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.75rem;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }
      .topbar-mobile-track::-webkit-scrollbar { display: none; }
      .topbar-mobile-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        flex-shrink: 0;
        padding: 0.3rem 0.65rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        text-decoration: none;
        white-space: nowrap;
      }
    `}</style>
  );
}

function PhoneIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.62 10.79a15.15 15.15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V21a1 1 0 01-1 1C10.4 22 2 13.6 2 3a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}

function SocialIcon({ platform }: { platform: string }) {
  if (platform === 'instagram') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    );
  }
  if (platform === 'facebook') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    );
  }
  return <span>{platform.slice(0, 1).toUpperCase()}</span>;
}
