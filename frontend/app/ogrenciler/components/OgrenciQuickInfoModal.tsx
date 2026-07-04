'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useOgrenciPath } from '@/components/ogrenci/OgrenciPathProvider';
import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';

export type QuickInfoOgrenci = {
  id: number;
  ad: string;
  soyad: string;
  telefon?: string;
  okul_no?: string;
  sinif_seviyesi?: string;
  sube_ad?: string;
  profil_foto?: string | null;
  veli_ad_soyad?: string;
  veli_telefon?: string;
  veli_id?: number | null;
  veli_yakinlik_display?: string;
};

interface Props {
  ogrenci: QuickInfoOgrenci;
  avatarColorClass: string;
  initials: string;
  onClose: () => void;
}

function formatPhoneNumber(phone: string | undefined): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 && cleaned.startsWith('5')) return `0${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('0')) return cleaned;
  return phone;
}

function CopyIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ContactRow({
  phone,
  ogrenciId,
  veliId,
  contactLabel,
  chatTitle,
}: {
  phone?: string;
  ogrenciId: number;
  veliId?: number;
  contactLabel: string;
  chatTitle: string;
}) {
  const [copied, setCopied] = useState(false);
  const formatted = formatPhoneNumber(phone);
  const display = formatted || 'Telefon girilmemiş';

  const handleCopy = useCallback(async () => {
    if (!formatted) return;
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [formatted]);

  return (
    <div className="oqim-contact-row">
      <div className="oqim-phone-block">
        <span className="oqim-phone-label">Telefon</span>
        <span className={`oqim-phone-value ${!formatted ? 'oqim-phone-value--empty' : ''}`}>{display}</span>
      </div>
      {formatted && (
        <div className="oqim-contact-actions">
          <button
            type="button"
            className={`oqim-icon-btn ${copied ? 'oqim-icon-btn--success' : ''}`}
            onClick={handleCopy}
            title="Numarayı kopyala"
            aria-label="Numarayı kopyala"
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <WhatsAppChatButton
            phone={phone!}
            ogrenciId={ogrenciId}
            veliId={veliId}
            contactLabel={contactLabel}
            title={chatTitle}
            variant="pill"
            label="Mesaj"
          />
        </div>
      )}
    </div>
  );
}

export default function OgrenciQuickInfoModal({ ogrenci, avatarColorClass, initials, onClose }: Props) {
  const { href } = useOgrenciPath();
  const tamAd = `${ogrenci.ad} ${ogrenci.soyad}`.trim();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="oqim-overlay" onClick={onClose} role="presentation">
      <div
        className="oqim-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="oqim-title"
      >
        <button type="button" className="oqim-close" onClick={onClose} aria-label="Kapat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="oqim-header">
          {ogrenci.profil_foto ? (
            <div className="oqim-avatar oqim-avatar--photo">
              <img src={ogrenci.profil_foto} alt={tamAd} />
            </div>
          ) : (
            <div className={`oqim-avatar oqim-avatar--${avatarColorClass}`}>{initials}</div>
          )}
          <div className="oqim-header-text">
            <h2 id="oqim-title" className="oqim-name">
              {tamAd}
            </h2>
            <div className="oqim-meta">
              {ogrenci.okul_no && <span className="oqim-chip">No {ogrenci.okul_no}</span>}
              {ogrenci.sinif_seviyesi && <span className="oqim-chip">{ogrenci.sinif_seviyesi}</span>}
              {ogrenci.sube_ad && <span className="oqim-chip oqim-chip--muted">{ogrenci.sube_ad}</span>}
            </div>
          </div>
        </div>

        <div className="oqim-body">
          <section className="oqim-section">
            <h3 className="oqim-section-title">
              <span className="oqim-section-dot oqim-section-dot--student" />
              Öğrenci
            </h3>
            <ContactRow
              phone={ogrenci.telefon}
              ogrenciId={ogrenci.id}
              contactLabel={tamAd}
              chatTitle="Öğrenciye mesaj gönder"
            />
          </section>

          <section className="oqim-section">
            <h3 className="oqim-section-title">
              <span className="oqim-section-dot oqim-section-dot--parent" />
              Veli
            </h3>
            <div className="oqim-veli-card">
              <div className="oqim-veli-top">
                <span className="oqim-veli-name">{ogrenci.veli_ad_soyad || 'Veli bilgisi girilmemiş'}</span>
                {ogrenci.veli_yakinlik_display && (
                  <span className="oqim-veli-relation">{ogrenci.veli_yakinlik_display}</span>
                )}
              </div>
              <ContactRow
                phone={ogrenci.veli_telefon}
                ogrenciId={ogrenci.id}
                veliId={ogrenci.veli_id ?? undefined}
                contactLabel={ogrenci.veli_ad_soyad || 'Veli'}
                chatTitle="Veliye mesaj gönder"
              />
            </div>
          </section>
        </div>

        <div className="oqim-footer">
          <Link href={href(String(ogrenci.id))} className="oqim-detail-link">
            Profili aç
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
