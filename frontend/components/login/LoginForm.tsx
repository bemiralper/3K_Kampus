'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/contexts/AuthContext';
import { resolvePostLoginRedirect, STORAGE_POST_LOGIN_ROUTING } from '@/lib/post-login-routing';
import { mergeBranding, type KurumBranding } from '@/lib/kurum-branding';

type LoginFormProps = {
  branding: KurumBranding;
  kurumKod?: string;
  onSuccess?: () => void;
  compact?: boolean;
};

export default function LoginForm({ branding, kurumKod = '3K', onSuccess, compact }: LoginFormProps) {
  const router = useRouter();
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const b = mergeBranding(branding);
  const theme = b.tema_rengi;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    const result = await login(username, password);
    if (result.success) {
      setIsRedirecting(true);
      onSuccess?.();
      const loggedInUser = result.user ?? user;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(STORAGE_POST_LOGIN_ROUTING, '1');
      }
      try {
        const nextPath = await resolvePostLoginRedirect(loggedInUser);
        if (typeof window !== 'undefined') {
          window.location.replace(nextPath);
        } else {
          router.replace(nextPath);
        }
      } finally {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem(STORAGE_POST_LOGIN_ROUTING);
        }
      }
    } else {
      setError(result.error || 'Giriş başarısız');
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isRedirecting && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
          Yönlendiriliyorsunuz…
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
        </div>
      )}
      <div>
        <label htmlFor="login-username" className="mb-1 block text-sm font-medium text-slate-700">
          Kullanıcı Adı
        </label>
        <input
          id="login-username"
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Kullanıcı adınız"
          required
          autoComplete="username"
          disabled={isSubmitting || isRedirecting}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-[var(--login-theme)] focus:bg-white focus:ring-4 focus:ring-[var(--login-theme)]/10"
          style={{ ['--login-theme' as string]: theme }}
        />
      </div>
      <div>
        <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">
          Şifre
        </label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Şifreniz"
          required
          autoComplete="current-password"
          disabled={isSubmitting || isRedirecting}
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 outline-none transition focus:border-[var(--login-theme)] focus:bg-white focus:ring-4 focus:ring-[var(--login-theme)]/10"
          style={{ ['--login-theme' as string]: theme }}
        />
      </div>
      <button
        type="submit"
        disabled={isSubmitting || isRedirecting}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-70"
        style={{ background: `linear-gradient(135deg, ${b.login_arkaplan_rengi}, ${b.login_arkaplan_rengi_2})` }}
      >
        {isRedirecting ? 'Yönlendiriliyorsunuz…' : isSubmitting ? 'Giriş yapılıyor...' : 'Giriş Yap'}
      </button>
      {!compact && (
        <p className="text-center text-xs text-slate-500">
          Kurum kodu: {kurumKod}
        </p>
      )}
    </form>
  );
}
