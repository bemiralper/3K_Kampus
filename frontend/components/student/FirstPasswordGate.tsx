'use client';

import { useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/contexts/AuthContext';
import { studentPortalApi } from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

export default function FirstPasswordGate() {
  const { logout } = useAuth();
  const { identity, resolvedTheme, applyUpdatedIdentity } = useStudentPortal();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!identity) return null;

  const hasMinLen = newPassword.length >= 8;
  const hasLetterAndNum = /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const matches = newPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hasMinLen || !matches) {
      setError('Lütfen en az 8 karakterli ve birbiriyle eşleşen bir şifre belirleyin.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await studentPortalApi.changePassword({
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      applyUpdatedIdentity(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Şifre güncellenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const branding = identity.institution.branding;
  const logoSrc =
    resolvedTheme === 'dark'
      ? branding?.dark_logo_url || branding?.app_logo_url || '/img/beyaz-logo.png'
      : branding?.app_logo_url || branding?.dark_logo_url || '/img/3k-logo.png';

  return (
    <div className="sp-gate-backdrop">
      <div className="sp-gate-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div className="sp-gate-badge">
            <ShieldCheck size={18} />
            <span>İlk Giriş Güvenlik Adımı</span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt={branding?.display_name || identity.institution.sube_name}
            style={{ maxHeight: 40, maxWidth: 110, objectFit: 'contain' }}
          />
        </div>

        <h1>Hoş geldin, {identity.student.first_name}!</h1>
        <p className="sp-gate-desc">
          {identity.institution.kurum_name} öğrenci portalına devam etmeden önce
          sana verilen tek kullanımlık geçici şifreyi yalnızca senin bildiğin yeni bir
          şifreyle değiştirmen gerekiyor.
        </p>

        <form onSubmit={handleSubmit} className="sp-gate-form">
          <label className="sp-field">
            <span>Yeni Şifren</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="En az 8 karakter"
              autoComplete="new-password"
              required
            />
          </label>

          <label className="sp-field">
            <span>Yeni Şifre (Tekrar)</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Yeni şifreni tekrar yaz"
              autoComplete="new-password"
              required
            />
          </label>

          <ul className="sp-gate-rules">
            <li data-ok={hasMinLen ? '1' : '0'}>
              <CheckCircle2 size={15} /> En az 8 karakter uzunluğunda
            </li>
            <li data-ok={hasLetterAndNum ? '1' : '0'}>
              <CheckCircle2 size={15} /> Harf ve rakam içeriyor
            </li>
            <li data-ok={matches ? '1' : '0'}>
              <CheckCircle2 size={15} /> İki şifre alanı birbiriyle eşleşiyor
            </li>
          </ul>

          {error ? <div className="sp-inline-error">{error}</div> : null}

          <div className="sp-gate-actions">
            <button
              type="submit"
              className="sp-btn sp-btn-primary sp-btn-lg"
              disabled={submitting || !hasMinLen || !matches}
            >
              <KeyRound size={17} />
              <span>{submitting ? 'Kaydediliyor…' : 'Şifremi Kaydet ve Portala Gir'}</span>
            </button>

            <button
              type="button"
              className="sp-btn sp-btn-ghost"
              onClick={() => logout()}
            >
              <LogOut size={16} />
              <span>Çıkış Yap</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
