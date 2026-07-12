'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import LoginForm from './LoginForm';
import {
  getLoginLogo,
  getHeaderLogo,
  mergeBranding,
  type KurumBranding,
} from '@/lib/kurum-branding';

type LoginModalProps = {
  open: boolean;
  onClose: () => void;
  branding: KurumBranding;
  kurumKod?: string;
};

const TRUST_POINTS: { icon: JSX.Element; title: string; desc: string }[] = [
  {
    title: 'Güvenli giriş',
    desc: 'Şifreli bağlantı ve KVKK uyumlu veri güvenliği',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    title: 'Tek platform',
    desc: 'Öğrenci, veli ve koç aynı ekranda',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    title: 'Anlık takip',
    desc: 'Akademik gelişim ve deneme analizleri',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
  },
];

export default function LoginModal({ open, onClose, branding, kurumKod = '3K' }: LoginModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const b = mergeBranding(branding);
  const panelLogo = getLoginLogo(b);
  const formLogo = getHeaderLogo(b);
  const bg1 = b.login_arkaplan_rengi;
  const bg2 = b.login_arkaplan_rengi_2;

  const handleClose = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('giris');
    const q = params.toString();
    router.replace(q ? `/?${q}` : '/', { scroll: false });
    onClose();
  }, [router, searchParams, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open) return;
    if (searchParams.get('giris') !== '1') {
      const params = new URLSearchParams(searchParams.toString());
      params.set('giris', '1');
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [open, router, searchParams]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <motion.div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
        className="relative z-10 flex w-full max-w-4xl max-h-[92vh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-3xl md:flex-row"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Marka paneli */}
        <div
          className="relative hidden shrink-0 flex-col justify-between overflow-hidden p-8 text-white md:flex md:w-[44%]"
          style={{ background: `linear-gradient(150deg, ${bg1} 0%, ${bg2} 100%)` }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12]"
            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
          />
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, white 0%, transparent 70%)' }}
          />

          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={panelLogo} alt={b.gorunen_ad} className="mb-6 h-12 w-auto max-w-[180px] object-contain" />
            <h2 className="text-2xl font-bold leading-tight tracking-tight">{b.gorunen_ad}</h2>
            {b.slogan && <p className="mt-2 text-sm leading-relaxed text-white/80">{b.slogan}</p>}
          </div>

          <ul className="relative mt-8 space-y-4">
            {TRUST_POINTS.map((p) => (
              <li key={p.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/20">
                  {p.icon}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{p.title}</span>
                  <span className="block text-xs leading-snug text-white/70">{p.desc}</span>
                </span>
              </li>
            ))}
          </ul>

          <p className="relative mt-8 text-[11px] uppercase tracking-widest text-white/50">
            {b.gorunen_ad} · Eğitim Yönetim Platformu
          </p>
        </div>

        {/* Form paneli */}
        <div className="relative flex flex-1 flex-col overflow-y-auto p-6 sm:p-8">
          <button
            type="button"
            onClick={handleClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Kapat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          {/* Mobil marka başlığı */}
          <div
            className="-mx-6 -mt-6 mb-6 flex items-center gap-3 px-6 py-5 text-white sm:-mx-8 sm:px-8 md:hidden"
            style={{ background: `linear-gradient(135deg, ${bg1} 0%, ${bg2} 100%)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={panelLogo} alt={b.gorunen_ad} className="h-9 w-auto max-w-[130px] object-contain" />
          </div>

          <div className="mb-6 hidden md:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={formLogo} alt={b.gorunen_ad} className="mb-4 h-10 w-auto max-w-[150px] object-contain" />
          </div>

          <h1 id="login-modal-title" className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Hoş geldiniz
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Hesabınıza giriş yaparak kaldığınız yerden devam edin.
          </p>

          <div className="mt-6">
            <LoginForm branding={branding} kurumKod={kurumKod} onSuccess={handleClose} compact />
          </div>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Güvenli bağlantı · KVKK uyumlu</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
