'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoginForm from './LoginForm';
import { getLoginLogo, mergeBranding, type KurumBranding } from '@/lib/kurum-branding';

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  branding: KurumBranding;
  kurumKod?: string;
};

export default function LoginModal({ open, onClose, branding, kurumKod = '3K' }: LoginModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const b = mergeBranding(branding);
  const loginLogo = getLoginLogo(b);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (searchParams.get('giris') !== '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.set('giris', '1');
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [open, router, searchParams]);

  if (!open) return null;

  const handleClose = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('giris');
    const q = params.toString();
    router.replace(q ? `/?${q}` : '/', { scroll: false });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={handleClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl sm:m-4"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Kapat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={loginLogo} alt={b.gorunen_ad} className="mx-auto mb-3 h-16 w-16 object-contain" />
          <h2 id="login-modal-title" className="text-xl font-bold text-slate-900">Hoş Geldiniz</h2>
          <p className="mt-1 text-sm text-slate-500">Devam etmek için giriş yapın</p>
        </div>
        <LoginForm branding={branding} kurumKod={kurumKod} onSuccess={handleClose} compact />
      </div>
    </div>
  );
}
