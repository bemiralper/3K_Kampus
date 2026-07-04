'use client';

import { useState } from 'react';
import { formatPhoneInput } from '@/lib/phone-format';
import type { SubeFormState } from '@/lib/sube-form';

type KurumOption = { id: number; ad: string };

type SubeDrawerFormProps = {
  form: SubeFormState;
  onChange: (form: SubeFormState) => void;
  kurumOptions: KurumOption[];
};

type TabId = 'genel' | 'iletisim' | 'ticari';

const TABS: { id: TabId; label: string }[] = [
  { id: 'genel', label: 'Genel' },
  { id: 'iletisim', label: 'İletişim' },
  { id: 'ticari', label: 'Ticari & Yönetim' },
];

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="sube-field">
      <span>
        {label}
        {required && <em> *</em>}
      </span>
      {hint && <small>{hint}</small>}
      {children}
    </label>
  );
}

export default function SubeDrawerForm({ form, onChange, kurumOptions }: SubeDrawerFormProps) {
  const [tab, setTab] = useState<TabId>('genel');

  const set = <K extends keyof SubeFormState>(key: K, value: SubeFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="sube-studio">
      <div className="sube-hero">
        <div className="sube-hero-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10z" />
          </svg>
        </div>
        <div className="sube-hero-text">
          <strong>{form.ad || 'Yeni şube'}</strong>
          <span>{form.resmi_ad || form.kod ? `Kod: ${form.kod || '—'}` : 'Şube bilgilerini doldurun'}</span>
        </div>
        <label className={`sube-status${form.aktif_mi ? ' is-active' : ''}`}>
          <input
            type="checkbox"
            checked={form.aktif_mi}
            onChange={e => set('aktif_mi', e.target.checked)}
          />
          {form.aktif_mi ? 'Aktif' : 'Pasif'}
        </label>
      </div>

      <nav className="sube-tabs" aria-label="Şube form sekmeleri">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            className={`sube-tab${tab === t.id ? ' is-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'genel' && (
        <div className="sube-panel">
          <Field label="Bağlı kurum" required>
            <select
              className="sube-input"
              value={form.kurum_id}
              onChange={e => set('kurum_id', e.target.value)}
            >
              <option value="">Kurum seçin</option>
              {kurumOptions.map(k => (
                <option key={k.id} value={String(k.id)}>{k.ad}</option>
              ))}
            </select>
          </Field>
          <div className="sube-grid-2">
            <Field label="Şube adı" required hint="Kısa görünen ad">
              <input
                type="text"
                className="sube-input"
                value={form.ad}
                onChange={e => set('ad', e.target.value)}
                placeholder="Örn: Kadıköy Şubesi"
              />
            </Field>
            <Field label="Şube kodu" hint="Benzersiz kod">
              <input
                type="text"
                className="sube-input"
                value={form.kod}
                onChange={e => set('kod', e.target.value)}
                placeholder="Örn: S001"
              />
            </Field>
          </div>
          <Field label="Şube resmi adı" hint="Resmi belgelerde kullanılacak tam unvan">
            <input
              type="text"
              className="sube-input"
              value={form.resmi_ad}
              onChange={e => set('resmi_ad', e.target.value)}
              placeholder="Örn: 3K Kampüs Kadıköy Eğitim Kurumu"
            />
          </Field>
        </div>
      )}

      {tab === 'iletisim' && (
        <div className="sube-panel">
          <Field label="Web adresi">
            <input
              type="url"
              className="sube-input"
              value={form.web_adresi}
              onChange={e => set('web_adresi', e.target.value)}
              placeholder="https://www.ornek.com"
            />
          </Field>
          <div className="sube-grid-2">
            <Field label="E-posta">
              <input
                type="email"
                className="sube-input"
                value={form.eposta}
                onChange={e => set('eposta', e.target.value)}
                placeholder="sube@3kkampus.com"
              />
            </Field>
            <Field label="Telefon">
              <input
                type="tel"
                className="sube-input"
                value={form.telefon}
                onChange={e => set('telefon', formatPhoneInput(e.target.value))}
                placeholder="0212 555 00 00"
              />
            </Field>
          </div>
          <Field label="Adres">
            <textarea
              className="sube-input sube-textarea"
              rows={4}
              value={form.adres}
              onChange={e => set('adres', e.target.value)}
              placeholder="Açık adres"
            />
          </Field>
        </div>
      )}

      {tab === 'ticari' && (
        <div className="sube-panel">
          <Field label="Ticari ünvan">
            <input
              type="text"
              className="sube-input"
              value={form.ticari_unvan}
              onChange={e => set('ticari_unvan', e.target.value)}
              placeholder="Özgün Sınav Öğretim Eğitim A.Ş."
            />
          </Field>
          <div className="sube-grid-2">
            <Field label="Vergi dairesi">
              <input
                type="text"
                className="sube-input"
                value={form.vergi_dairesi}
                onChange={e => set('vergi_dairesi', e.target.value)}
              />
            </Field>
            <Field label="Vergi numarası">
              <input
                type="text"
                className="sube-input"
                value={form.vergi_no}
                onChange={e => set('vergi_no', e.target.value)}
              />
            </Field>
          </div>
          <Field label="Ticaret sicil no">
            <input
              type="text"
              className="sube-input"
              value={form.ticaret_sicil_no}
              onChange={e => set('ticaret_sicil_no', e.target.value)}
            />
          </Field>
          <div className="sube-divider" />
          <div className="sube-grid-2">
            <Field label="Kurs müdürü">
              <input
                type="text"
                className="sube-input"
                value={form.kurs_muduru}
                onChange={e => set('kurs_muduru', e.target.value)}
                placeholder="Ad Soyad"
              />
            </Field>
            <Field label="Kurs müdürü telefon">
              <input
                type="tel"
                className="sube-input"
                value={form.kurs_muduru_telefon}
                onChange={e => set('kurs_muduru_telefon', formatPhoneInput(e.target.value))}
                placeholder="05XX XXX XX XX"
              />
            </Field>
          </div>
        </div>
      )}

      <style jsx global>{`
        .sube-studio {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin: -4px 0 0;
        }
        .sube-hero {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0262a7 100%);
          color: #fff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
        }
        .sube-hero-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.12);
          flex-shrink: 0;
        }
        .sube-hero-text {
          flex: 1;
          min-width: 0;
        }
        .sube-hero-text strong {
          display: block;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sube-hero-text span {
          display: block;
          margin-top: 2px;
          font-size: 12px;
          opacity: 0.85;
        }
        .sube-status {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          background: rgba(255, 255, 255, 0.12);
          cursor: pointer;
          user-select: none;
          flex-shrink: 0;
        }
        .sube-status.is-active {
          background: rgba(16, 185, 129, 0.22);
        }
        .sube-status input {
          accent-color: #10b981;
        }
        .sube-tabs {
          display: flex;
          gap: 4px;
          padding: 4px;
          background: #f1f5f9;
          border-radius: 12px;
        }
        .sube-tab {
          flex: 1;
          border: none;
          background: transparent;
          border-radius: 9px;
          padding: 10px 8px;
          font-size: 13px;
          font-weight: 600;
          color: #64748b;
          cursor: pointer;
          transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        }
        .sube-tab.is-active {
          background: #fff;
          color: #0262a7;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
        }
        .sube-panel {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .sube-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sube-field > span {
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .sube-field > span em {
          color: #dc2626;
          font-style: normal;
        }
        .sube-field > small {
          margin-top: -2px;
          font-size: 11px;
          color: #94a3b8;
        }
        .sube-input {
          width: 100%;
          padding: 11px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          font-size: 14px;
          color: #0f172a;
          background: #fff;
          transition: border-color 0.15s, box-shadow 0.15s;
          box-sizing: border-box;
        }
        .sube-input:focus {
          outline: none;
          border-color: #0262a7;
          box-shadow: 0 0 0 3px rgba(2, 98, 167, 0.12);
        }
        .sube-input::placeholder {
          color: #94a3b8;
        }
        .sube-textarea {
          resize: vertical;
          min-height: 96px;
          line-height: 1.5;
        }
        .sube-grid-2 {
          display: grid;
          gap: 14px;
        }
        .sube-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 4px 0;
        }
        @media (min-width: 560px) {
          .sube-grid-2 {
            grid-template-columns: 1fr 1fr;
          }
        }
      `}</style>
    </div>
  );
}
