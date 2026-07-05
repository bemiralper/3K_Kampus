'use client';

import type { SinavTakvim } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { formatDateTRLong } from '@/lib/format-date';
import { LANDING_COLORS, sinavTurColor } from '@/lib/landing-theme';

function formatSinavSaatAraligi(sinav: SinavTakvim): string | null {
  const { saat, saat_bitis: bitis } = sinav;
  if (saat && bitis) return `${saat} – ${bitis}`;
  if (saat) return saat;
  if (bitis) return bitis;
  return null;
}

type SinavDetailModalProps = {
  sinav: SinavTakvim | null;
  onClose: () => void;
};

export default function SinavDetailModal({ sinav, onClose }: SinavDetailModalProps) {
  if (!sinav) return null;

  const kapsamLabel = sinav.kapsam === 'yerel' ? 'Yerel' : 'Türkiye Geneli';
  const isTurkiyeGeneli = sinav.kapsam === 'turkiye_geneli';
  const color = sinavTurColor(sinav.tur);
  const imageUrl = resolveMediaUrl(sinav.gorsel_url);
  const tarihStr = formatDateTRLong(sinav.tarih);
  const saatStr = formatSinavSaatAraligi(sinav);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={onClose} aria-hidden />

      <div
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sinav-modal-title"
      >
        {/* Görsel — 16:9, yalnızca detay penceresinde */}
        <div className="relative shrink-0">
          {imageUrl ? (
            <div className="relative aspect-[16/9] w-full bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={sinav.baslik}
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          ) : (
            <div
              className="flex aspect-[16/9] w-full items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${color}22 0%, ${LANDING_COLORS.navy}18 100%)` }}
            >
              <span
                className="rounded-2xl px-6 py-3 text-2xl font-bold text-white shadow-lg"
                style={{ backgroundColor: color }}
              >
                {sinav.tur}
              </span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg backdrop-blur transition hover:bg-white"
            aria-label="Kapat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="absolute bottom-3 left-4 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-white shadow-md"
              style={{ backgroundColor: color }}
            >
              {sinav.tur}
            </span>
            {isTurkiyeGeneli && (
              <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-[#0262a7] shadow-md backdrop-blur">
                Türkiye Geneli
              </span>
            )}
            {sinav.kapsam === 'yerel' && (
              <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-600 shadow-md backdrop-blur">
                Yerel
              </span>
            )}
          </div>
        </div>

        {/* İçerik */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-5">
          {sinav.yayin_adi && (
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{sinav.yayin_adi}</p>
          )}
          <h3 id="sinav-modal-title" className="mt-1 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
            {sinav.baslik}
          </h3>

          <div className="mt-5 grid gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#0262a7] shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <div>
                <p className="text-xs font-medium text-slate-400">Tarih</p>
                <p className="text-sm font-semibold capitalize text-slate-800">{tarihStr}</p>
              </div>
            </div>

            {saatStr && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#0262a7] shadow-sm">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs font-medium text-slate-400">
                    {sinav.saat && sinav.saat_bitis ? 'Saat aralığı' : 'Saat'}
                  </p>
                  <p className="text-sm font-semibold text-slate-800">{saatStr}</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#0262a7] shadow-sm">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
              </span>
              <div>
                <p className="text-xs font-medium text-slate-400">Kapsam</p>
                <p className="text-sm font-semibold text-slate-800">{kapsamLabel}</p>
              </div>
            </div>
          </div>

          {sinav.aciklama && (
            <div className="mt-5 rounded-xl border border-slate-100 bg-white px-4 py-3">
              <p className="mb-1 text-xs font-medium text-slate-400">Açıklama</p>
              <p className="text-sm leading-relaxed text-slate-600">{sinav.aciklama}</p>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${LANDING_COLORS.accent}, ${LANDING_COLORS.navy})` }}
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
