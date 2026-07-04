'use client';

import { useState, type ReactNode } from 'react';
import type { SiteSettings } from '@/lib/website-api';
import { submitIletisimForm } from '@/lib/website-api';
import { formatPhoneDisplay, formatPhoneInput, phoneDigits } from '@/lib/phone-format';
import { LANDING_COLORS, LANDING_KURUM_KOD } from '@/lib/landing-theme';

type IletisimSectionProps = {
  settings: SiteSettings | null;
};

type FormState = { ad_soyad: string; telefon: string; mesaj: string };
type FieldErrors = Partial<Record<keyof FormState, string>>;

function validateForm(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.ad_soyad.trim()) errors.ad_soyad = 'Ad soyad zorunludur';
  const digits = phoneDigits(form.telefon);
  if (!digits) errors.telefon = 'Telefon zorunludur';
  else if (digits.length < 10) errors.telefon = 'Geçerli bir telefon numarası girin';
  return errors;
}

function ContactCard({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="iletisim-card-icon">{icon}</span>
      <span className="iletisim-card-body">
        <span className="iletisim-card-label">{label}</span>
        <span className="iletisim-card-value">{value}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <a href={href} className="iletisim-card iletisim-card-link">
        {inner}
      </a>
    );
  }

  return <div className="iletisim-card">{inner}</div>;
}

export default function IletisimSection({ settings }: IletisimSectionProps) {
  const [form, setForm] = useState<FormState>({ ad_soyad: '', telefon: '', mesaj: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const whatsappHref = settings?.whatsapp
    ? `https://wa.me/${settings.whatsapp.replace(/\D/g, '')}`
    : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setStatus('loading');
    setErrorMsg('');
    try {
      const payload = {
        ad_soyad: form.ad_soyad.trim(),
        telefon: formatPhoneDisplay(form.telefon),
        mesaj: form.mesaj.trim(),
      };
      const res = await submitIletisimForm(LANDING_KURUM_KOD, payload);
      if (res.success) {
        setStatus('success');
        setForm({ ad_soyad: '', telefon: '', mesaj: '' });
        setFieldErrors({});
      } else {
        setStatus('error');
        setErrorMsg(res.error || 'Gönderilemedi');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Bağlantı hatası');
    }
  };

  return (
    <section id="iletisim" className="iletisim-section">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <div className="iletisim-header">
          <p className="iletisim-eyebrow">Bize Ulaşın</p>
          <h2>İletişim</h2>
          <p className="iletisim-lead">
            Sorularınız, kayıt talepleriniz veya bilgi almak için formu doldurun; en kısa sürede size dönüş yapalım.
          </p>
        </div>

        <div className="iletisim-grid">
          <div className="iletisim-info">
            <div className="iletisim-cards">
              {settings?.telefon && (
                <ContactCard
                  label="Telefon"
                  value={formatPhoneDisplay(settings.telefon)}
                  href={`tel:${phoneDigits(settings.telefon)}`}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </svg>
                  }
                />
              )}
              {settings?.whatsapp && (
                <ContactCard
                  label="WhatsApp"
                  value="Hızlı mesaj gönderin"
                  href={whatsappHref}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  }
                />
              )}
              {settings?.eposta && (
                <ContactCard
                  label="E-posta"
                  value={settings.eposta}
                  href={`mailto:${settings.eposta}`}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                    </svg>
                  }
                />
              )}
              {settings?.adres && (
                <ContactCard
                  label="Adres"
                  value={settings.adres}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z" />
                    </svg>
                  }
                />
              )}
            </div>

            {settings?.calisma_saatleri && (
              <div className="iletisim-hours">
                <h3>Çalışma Saatleri</h3>
                <pre>{settings.calisma_saatleri}</pre>
              </div>
            )}

            {settings?.harita_embed_url && (
              <div className="iletisim-map">
                <iframe src={settings.harita_embed_url} title="3K Kampüs konum" loading="lazy" />
              </div>
            )}
          </div>

          <div className="iletisim-form-wrap">
            <form onSubmit={handleSubmit} className="iletisim-form" noValidate>
              <div className="iletisim-form-head">
                <h3>İletişim Formu</h3>
                <p>Bilgilerinizi bırakın, sizi arayalım.</p>
              </div>

              {status === 'success' && (
                <div className="iletisim-alert iletisim-alert-success">
                  Mesajınız alındı. En kısa sürede dönüş yapacağız.
                </div>
              )}
              {status === 'error' && (
                <div className="iletisim-alert iletisim-alert-error">{errorMsg}</div>
              )}

              <div className="iletisim-fields">
                <div className={`iletisim-field ${fieldErrors.ad_soyad ? 'has-error' : ''}`}>
                  <label htmlFor="iletisim-ad">
                    Ad Soyad <span className="required">*</span>
                  </label>
                  <input
                    id="iletisim-ad"
                    name="ad_soyad"
                    required
                    autoComplete="name"
                    placeholder="Adınız ve soyadınız"
                    value={form.ad_soyad}
                    onChange={e => {
                      setForm(f => ({ ...f, ad_soyad: e.target.value }));
                      if (fieldErrors.ad_soyad) setFieldErrors(er => ({ ...er, ad_soyad: undefined }));
                    }}
                  />
                  {fieldErrors.ad_soyad && <span className="field-error">{fieldErrors.ad_soyad}</span>}
                </div>

                <div className={`iletisim-field ${fieldErrors.telefon ? 'has-error' : ''}`}>
                  <label htmlFor="iletisim-tel">
                    Telefon <span className="required">*</span>
                  </label>
                  <input
                    id="iletisim-tel"
                    name="telefon"
                    required
                    type="tel"
                    autoComplete="tel"
                    placeholder="0212 555 00 00"
                    value={form.telefon}
                    onChange={e => {
                      setForm(f => ({ ...f, telefon: formatPhoneInput(e.target.value) }));
                      if (fieldErrors.telefon) setFieldErrors(er => ({ ...er, telefon: undefined }));
                    }}
                  />
                  {fieldErrors.telefon && <span className="field-error">{fieldErrors.telefon}</span>}
                </div>

                <div className="iletisim-field">
                  <label htmlFor="iletisim-mesaj">Mesajınız</label>
                  <textarea
                    id="iletisim-mesaj"
                    name="mesaj"
                    rows={4}
                    placeholder="Sormak istediğiniz konu (isteğe bağlı)"
                    value={form.mesaj}
                    onChange={e => setForm(f => ({ ...f, mesaj: e.target.value }))}
                  />
                </div>

                <p className="iletisim-required-note">
                  <span className="required">*</span> Zorunlu alanlar
                </p>

                <button type="submit" disabled={status === 'loading'} className="iletisim-submit">
                  {status === 'loading' ? 'Gönderiliyor...' : 'Gönder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .iletisim-section {
          padding: 4rem 0 5rem;
          background: linear-gradient(180deg, #f8fafc 0%, #fff 40%, #f1f5f9 100%);
        }
        .iletisim-header {
          max-width: 36rem;
          margin: 0 auto 2.5rem;
          text-align: center;
        }
        .iletisim-eyebrow {
          margin: 0;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${LANDING_COLORS.accent};
        }
        .iletisim-header h2 {
          margin: 0.5rem 0 0;
          font-size: clamp(1.75rem, 4vw, 2.25rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: ${LANDING_COLORS.navy};
        }
        .iletisim-lead {
          margin: 0.75rem 0 0;
          font-size: 15px;
          line-height: 1.65;
          color: #64748b;
        }
        .iletisim-grid {
          display: grid;
          gap: 1.5rem;
          align-items: start;
        }
        @media (min-width: 1024px) {
          .iletisim-grid {
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
          }
        }
        .iletisim-cards {
          display: grid;
          gap: 0.75rem;
        }
        @media (min-width: 640px) {
          .iletisim-cards { grid-template-columns: 1fr 1fr; }
        }
        .iletisim-card {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
          padding: 1rem 1.1rem;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
          transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
        }
        .iletisim-card-link {
          text-decoration: none;
          color: inherit;
        }
        .iletisim-card-link:hover {
          border-color: rgba(2, 98, 167, 0.35);
          box-shadow: 0 8px 24px rgba(2, 98, 167, 0.1);
          transform: translateY(-1px);
        }
        .iletisim-card-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          border-radius: 12px;
          background: rgba(2, 98, 167, 0.1);
          color: ${LANDING_COLORS.accent};
        }
        .iletisim-card-body {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }
        .iletisim-card-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #94a3b8;
        }
        .iletisim-card-value {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
          color: ${LANDING_COLORS.navy};
          word-break: break-word;
        }
        .iletisim-hours {
          margin-top: 1.25rem;
          padding: 1.15rem 1.25rem;
          border-radius: 16px;
          border: 1px solid #e2e8f0;
          background: #fff;
        }
        .iletisim-hours h3 {
          margin: 0 0 0.5rem;
          font-size: 14px;
          font-weight: 700;
          color: ${LANDING_COLORS.navy};
        }
        .iletisim-hours pre {
          margin: 0;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.65;
          color: #475569;
          white-space: pre-line;
        }
        .iletisim-map {
          margin-top: 1.25rem;
          aspect-ratio: 16 / 10;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid #e2e8f0;
          box-shadow: 0 8px 30px rgba(15, 23, 42, 0.08);
        }
        .iletisim-map iframe {
          width: 100%;
          height: 100%;
          border: 0;
        }
        .iletisim-form-wrap {
          position: sticky;
          top: 5.5rem;
        }
        .iletisim-form {
          padding: 1.75rem;
          border-radius: 24px;
          border: 1px solid #e2e8f0;
          background: #fff;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
        }
        @media (min-width: 1024px) {
          .iletisim-form { padding: 2rem; }
        }
        .iletisim-form-head h3 {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 800;
          color: ${LANDING_COLORS.navy};
        }
        .iletisim-form-head p {
          margin: 0.35rem 0 0;
          font-size: 14px;
          color: #64748b;
        }
        .iletisim-alert {
          margin-top: 1.25rem;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.5;
        }
        .iletisim-alert-success {
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
        }
        .iletisim-alert-error {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }
        .iletisim-fields {
          margin-top: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .iletisim-field label {
          display: block;
          margin-bottom: 0.4rem;
          font-size: 13px;
          font-weight: 600;
          color: #334155;
        }
        .iletisim-field .required {
          color: #dc2626;
        }
        .iletisim-field input,
        .iletisim-field textarea {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 12px;
          border: 1.5px solid #e2e8f0;
          background: #f8fafc;
          font-size: 14px;
          color: #0f172a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
        }
        .iletisim-field input:focus,
        .iletisim-field textarea:focus {
          border-color: ${LANDING_COLORS.accent};
          background: #fff;
          box-shadow: 0 0 0 3px rgba(2, 98, 167, 0.12);
        }
        .iletisim-field.has-error input {
          border-color: #f87171;
          background: #fff5f5;
        }
        .field-error {
          display: block;
          margin-top: 0.35rem;
          font-size: 12px;
          color: #dc2626;
        }
        .iletisim-required-note {
          margin: 0;
          font-size: 12px;
          color: #94a3b8;
        }
        .iletisim-submit {
          width: 100%;
          padding: 0.85rem 1.25rem;
          border: none;
          border-radius: 14px;
          background: linear-gradient(135deg, ${LANDING_COLORS.navy}, ${LANDING_COLORS.accent});
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: opacity 0.15s, transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 14px rgba(2, 98, 167, 0.35);
        }
        .iletisim-submit:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(2, 98, 167, 0.4);
        }
        .iletisim-submit:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </section>
  );
}
