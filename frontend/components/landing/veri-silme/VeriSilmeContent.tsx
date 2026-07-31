'use client';

import { useState } from 'react';
import YasalMetinContent from '@/components/landing/yasal/YasalMetinContent';
import { submitIletisimForm } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { formatPhoneDisplay, formatPhoneInput, phoneDigits } from '@/lib/phone-format';
import {
  VERI_SILME_META,
  VERI_SILME_NAV,
  VERI_SILME_SECTIONS,
} from '@/lib/veri-silme-content';

type FormState = { ad_soyad: string; telefon: string; mesaj: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.ad_soyad.trim()) errors.ad_soyad = 'Ad soyad zorunludur';
  if (phoneDigits(form.telefon).length < 10) errors.telefon = 'Geçerli bir telefon girin';
  if (!form.mesaj.trim()) errors.mesaj = 'Talebinizi kısaca yazın';
  return errors;
}

export default function VeriSilmeContent() {
  const [form, setForm] = useState<FormState>({ ad_soyad: '', telefon: '', mesaj: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await submitIletisimForm(LANDING_KURUM_KOD, {
        ad_soyad: form.ad_soyad.trim(),
        telefon: formatPhoneDisplay(form.telefon),
        mesaj: `[Veri Silme Talebi]\n\n${form.mesaj.trim()}`,
      });
      if (res.success) {
        setStatus('success');
        setForm({ ad_soyad: '', telefon: '', mesaj: '' });
      } else {
        setStatus('error');
        setErrorMsg(res.error || 'Gönderilemedi. Lütfen daha sonra tekrar deneyin.');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Bağlantı hatası. Lütfen daha sonra tekrar deneyin.');
    }
  };

  return (
    <>
      <YasalMetinContent
        meta={VERI_SILME_META}
        nav={VERI_SILME_NAV}
        sections={VERI_SILME_SECTIONS}
        ctaLabel="Başvuru Formuna Git"
        ctaHref="#basvuru"
      />

      <section id="basvuru" className="veri-silme-form-section">
        <div className="mx-auto max-w-xl px-4 pb-16 lg:px-8">
          <form onSubmit={handleSubmit} className="veri-silme-form" noValidate>
            <h2>Veri Silme Başvuru Formu</h2>
            <p>Talebinizi iletin; en geç 30 gün içinde dönüş yapacağız.</p>

            {status === 'success' && (
              <div className="veri-silme-alert ok">Başvurunuz alındı. En kısa sürede dönüş yapacağız.</div>
            )}
            {status === 'error' && (
              <div className="veri-silme-alert err">{errorMsg}</div>
            )}

            <label>
              Ad Soyad *
              <input
                value={form.ad_soyad}
                onChange={(e) => setForm((f) => ({ ...f, ad_soyad: e.target.value }))}
                autoComplete="name"
                required
              />
              {fieldErrors.ad_soyad && <span>{fieldErrors.ad_soyad}</span>}
            </label>

            <label>
              Telefon *
              <input
                value={form.telefon}
                onChange={(e) => setForm((f) => ({ ...f, telefon: formatPhoneInput(e.target.value) }))}
                type="tel"
                autoComplete="tel"
                required
              />
              {fieldErrors.telefon && <span>{fieldErrors.telefon}</span>}
            </label>

            <label>
              Talebiniz *
              <textarea
                rows={5}
                value={form.mesaj}
                onChange={(e) => setForm((f) => ({ ...f, mesaj: e.target.value }))}
                placeholder="Hangi hesabınız/kayıtınız için silme talep ettiğinizi yazın"
                required
              />
              {fieldErrors.mesaj && <span>{fieldErrors.mesaj}</span>}
            </label>

            <button type="submit" disabled={status === 'loading'}>
              {status === 'loading' ? 'Gönderiliyor…' : 'Başvuruyu Gönder'}
            </button>
          </form>
        </div>
      </section>

      <style jsx>{`
        .veri-silme-form-section {
          background: #f8fafc;
          border-top: 1px solid #e2e8f0;
        }
        .veri-silme-form {
          display: grid;
          gap: 0.85rem;
          padding: 1.75rem;
          border-radius: 1rem;
          background: #fff;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.04);
        }
        .veri-silme-form h2 {
          margin: 0;
          font-size: 1.35rem;
          color: #0f172a;
        }
        .veri-silme-form > p {
          margin: 0;
          color: #64748b;
          font-size: 0.95rem;
        }
        .veri-silme-form label {
          display: grid;
          gap: 0.35rem;
          font-size: 0.875rem;
          font-weight: 600;
          color: #334155;
        }
        .veri-silme-form input,
        .veri-silme-form textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 0.65rem;
          padding: 0.7rem 0.85rem;
          font: inherit;
          font-weight: 400;
          color: #0f172a;
          background: #fff;
        }
        .veri-silme-form label span {
          color: #dc2626;
          font-weight: 500;
          font-size: 0.8rem;
        }
        .veri-silme-form button {
          margin-top: 0.25rem;
          border: 0;
          border-radius: 0.65rem;
          padding: 0.85rem 1.1rem;
          background: #0f172a;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
        }
        .veri-silme-form button:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .veri-silme-alert {
          padding: 0.75rem 0.9rem;
          border-radius: 0.65rem;
          font-size: 0.9rem;
        }
        .veri-silme-alert.ok {
          background: #ecfdf5;
          color: #065f46;
        }
        .veri-silme-alert.err {
          background: #fef2f2;
          color: #991b1b;
        }
      `}</style>
    </>
  );
}
