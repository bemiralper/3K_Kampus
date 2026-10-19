'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useOgrenciPath } from '@/components/ogrenci/OgrenciPathProvider';
import WhatsAppChatButton from '@/components/communication/WhatsAppChatButton';
import { downloadBlob } from '@/lib/download-file';
import { formatPhoneDisplay, phoneDigits } from '@/lib/phone-format';

export type QuickInfoPhone = {
  numara: string;
  etiket?: string;
};

export type QuickInfoVeli = {
  id: number;
  ad_soyad: string;
  telefon?: string;
  telefonlar?: QuickInfoPhone[];
  yakinlik_display?: string;
};

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
  veliler?: QuickInfoVeli[];
};

interface Props {
  ogrenci: QuickInfoOgrenci;
  avatarColorClass: string;
  initials: string;
  onClose: () => void;
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

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.68 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.55 2.81.68A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function vcardEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function contactTel(phone: string): string {
  let digits = phoneDigits(phone);
  if (digits.startsWith('90') && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `+90${digits}`;
  return `+${phoneDigits(phone)}`;
}

function fileSlug(name: string): string {
  const map: Record<string, string> = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c', İ: 'i' };
  const slug = name
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/[ğüşıöçİ]/g, (ch) => map[ch] || ch)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'kisi';
}

function buildVCard(name: string, phone: string, note: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const soyad = parts.length > 1 ? parts[parts.length - 1] : '';
  const ad = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || name;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N;CHARSET=UTF-8:${vcardEscape(soyad)};${vcardEscape(ad)};;;`,
    `FN;CHARSET=UTF-8:${vcardEscape(name.trim() || 'Kişi')}`,
    `TEL;TYPE=CELL:${contactTel(phone)}`,
    `NOTE;CHARSET=UTF-8:${vcardEscape(note)}`,
    'END:VCARD',
  ].join('\r\n');
}

async function saveContactCard(name: string, phone: string, note: string): Promise<'shared' | 'downloaded'> {
  const vcf = buildVCard(name, phone, note);
  const filename = `${fileSlug(name)}.vcf`;
  const file = new File([vcf], filename, { type: 'text/vcard' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'shared';
    }
  }
  downloadBlob(new Blob([vcf], { type: 'text/vcard;charset=utf-8' }), filename);
  return 'downloaded';
}

function phonesOf(veli: QuickInfoVeli): QuickInfoPhone[] {
  const listed = (veli.telefonlar || []).filter((p) => p.numara?.trim());
  if (listed.length > 0) return listed;
  if (veli.telefon?.trim()) return [{ numara: veli.telefon, etiket: 'Telefon' }];
  return [];
}

function fallbackParents(ogrenci: QuickInfoOgrenci): QuickInfoVeli[] {
  const rawName = (ogrenci.veli_ad_soyad || '').trim();
  const rawPhone = (ogrenci.veli_telefon || '').trim();
  if (!rawName && !rawPhone) return [];
  const names = rawName.split(/\s·\s/).map((s) => s.trim()).filter(Boolean);
  const phones = rawPhone.split(/\s·\s/).map((s) => s.trim()).filter(Boolean);
  const relations = (ogrenci.veli_yakinlik_display || '').split(/\s·\s/).map((s) => s.trim());
  const count = Math.max(names.length, phones.length, 1);
  return Array.from({ length: count }, (_, index) => {
    let name = names[index] || (count === 1 ? rawName : 'Veli');
    const inlineRelation = name.match(/\(([^)]+)\)\s*$/);
    if (inlineRelation) name = name.replace(/\s*\([^)]+\)\s*$/, '').trim();
    return {
      id: index === 0 && ogrenci.veli_id ? ogrenci.veli_id : -(index + 1),
      ad_soyad: name || 'Veli',
      telefon: phones[index] || '',
      yakinlik_display: relations[index] || inlineRelation?.[1] || '',
    };
  });
}

function ContactActions({
  phone,
  personName,
  ogrenciId,
  veliId,
  chatTitle,
  note,
}: {
  phone: string;
  personName: string;
  ogrenciId: number;
  veliId?: number;
  chatTitle: string;
  note: string;
}) {
  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const display = formatPhoneDisplay(phone) || phone.trim();
  const telHref = phoneDigits(phone) ? `tel:${contactTel(phone)}` : undefined;

  const handleCopy = useCallback(async () => {
    if (!display) return;
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* panoya yazılamadı */
    }
  }, [display]);

  const handleSave = useCallback(async () => {
    setSaveNote('');
    try {
      const result = await saveContactCard(personName, phone, note);
      setSaveNote(
        result === 'downloaded'
          ? 'Kişi kartı indirildi. Dosyayı açınca rehbere eklenir.'
          : '',
      );
    } catch {
      setSaveNote('Rehbere kaydedilemedi.');
    }
  }, [note, personName, phone]);

  return (
    <>
      <div className="oqim-contact-actions">
        {telHref && (
          <a className="oqim-action oqim-action--call" href={telHref}>
            <PhoneIcon />
            Ara
          </a>
        )}
        <WhatsAppChatButton
          phone={phone}
          ogrenciId={ogrenciId}
          veliId={veliId}
          contactLabel={personName}
          title={chatTitle}
          variant="pill"
          label="Mesaj"
        />
        <button
          type="button"
          className={`oqim-icon-btn ${copied ? 'oqim-icon-btn--success' : ''}`}
          onClick={handleCopy}
          title="Bu numarayı kopyala"
          aria-label={`${personName} numarasını kopyala`}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
        <button
          type="button"
          className="oqim-icon-btn"
          onClick={handleSave}
          title="Rehbere kaydet"
          aria-label={`${personName} kişisini rehbere kaydet`}
        >
          <ContactIcon />
        </button>
      </div>
      {saveNote && <p className="oqim-save-note">{saveNote}</p>}
    </>
  );
}

function PhoneBlock({
  phone,
  label,
  personName,
  ogrenciId,
  veliId,
  chatTitle,
  note,
}: {
  phone?: string;
  label: string;
  personName: string;
  ogrenciId: number;
  veliId?: number;
  chatTitle: string;
  note: string;
}) {
  const display = phone ? formatPhoneDisplay(phone) || phone.trim() : '';
  return (
    <div className="oqim-contact-row">
      <div className="oqim-phone-block">
        <span className="oqim-phone-label">{label}</span>
        <span className={`oqim-phone-value ${!display ? 'oqim-phone-value--empty' : ''}`}>
          {display || 'Telefon girilmemiş'}
        </span>
      </div>
      {display && (
        <ContactActions
          phone={phone!}
          personName={personName}
          ogrenciId={ogrenciId}
          veliId={veliId}
          chatTitle={chatTitle}
          note={note}
        />
      )}
    </div>
  );
}

export default function OgrenciQuickInfoModal({ ogrenci, avatarColorClass, initials, onClose }: Props) {
  const { href } = useOgrenciPath();
  const tamAd = `${ogrenci.ad} ${ogrenci.soyad}`.trim();
  const parents = ogrenci.veliler && ogrenci.veliler.length > 0
    ? ogrenci.veliler
    : fallbackParents(ogrenci);

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
            <PhoneBlock
              phone={ogrenci.telefon}
              label="Telefon"
              personName={tamAd}
              ogrenciId={ogrenci.id}
              chatTitle="Öğrenciye mesaj gönder"
              note={[
                '3K Kampüs öğrenci',
                ogrenci.okul_no ? `No ${ogrenci.okul_no}` : '',
                ogrenci.sinif_seviyesi || '',
              ].filter(Boolean).join(' · ')}
            />
          </section>

          <section className="oqim-section">
            <h3 className="oqim-section-title">
              <span className="oqim-section-dot oqim-section-dot--parent" />
              {parents.length > 1 ? 'Veliler' : 'Veli'}
            </h3>
            {parents.length === 0 ? (
              <div className="oqim-veli-card">
                <span className="oqim-veli-name">Veli bilgisi girilmemiş</span>
              </div>
            ) : (
              <div className="oqim-veli-list">
                {parents.map((veli) => {
                  const phones = phonesOf(veli);
                  const name = veli.ad_soyad || 'Veli';
                  return (
                    <div key={veli.id} className="oqim-veli-card">
                      <div className="oqim-veli-top">
                        <span className="oqim-veli-name">{name}</span>
                        {veli.yakinlik_display && (
                          <span className="oqim-veli-relation">{veli.yakinlik_display}</span>
                        )}
                      </div>
                      {phones.length === 0 ? (
                        <span className="oqim-phone-value oqim-phone-value--empty">Telefon girilmemiş</span>
                      ) : (
                        <div className="oqim-veli-phones">
                          {phones.map((item, index) => (
                            <PhoneBlock
                              key={`${veli.id}-${item.numara}-${index}`}
                              phone={item.numara}
                              label={phones.length > 1 ? (item.etiket || `Telefon ${index + 1}`) : 'Telefon'}
                              personName={name}
                              ogrenciId={ogrenci.id}
                              veliId={veli.id > 0 ? veli.id : undefined}
                              chatTitle={`${name} kişisine mesaj gönder`}
                              note={`3K Kampüs — ${tamAd} velisi${veli.yakinlik_display ? ` (${veli.yakinlik_display})` : ''}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
