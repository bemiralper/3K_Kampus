'use client';

import type { SinavTakvim } from '@/lib/website-api';
import { resolveMediaUrl } from '@/lib/website-api';
import { formatDateTRLong } from '@/lib/format-date';
import { sinavTurColor, sinavTurLabel } from '@/lib/landing-theme';
import './public-home.css';

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
    <div className="stk-modal">
      <div className="stk-modal__shade" onClick={onClose} aria-hidden />
      <div
        className="stk-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sinav-modal-title"
      >
        <div className="stk-modal__hero">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={sinav.baslik} />
          ) : (
            <div className="stk-modal__fallback">
              <span style={{ backgroundColor: color }}>{sinavTurLabel(sinav.tur)}</span>
            </div>
          )}
          <button type="button" onClick={onClose} className="stk-modal__x" aria-label="Kapat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="stk-modal__tags">
            <span style={{ backgroundColor: color }}>{sinavTurLabel(sinav.tur)}</span>
            <span>{isTurkiyeGeneli ? 'Türkiye Geneli' : 'Yerel'}</span>
          </div>
        </div>

        <div className="stk-modal__body">
          {sinav.yayin_adi && <p className="stk-modal__pub">{sinav.yayin_adi}</p>}
          <h3 id="sinav-modal-title">{sinav.baslik}</h3>
          <dl className="stk-facts">
            <div>
              <dt>Tarih</dt>
              <dd>{tarihStr}</dd>
            </div>
            {saatStr && (
              <div>
                <dt>{sinav.saat && sinav.saat_bitis ? 'Saat aralığı' : 'Saat'}</dt>
                <dd>{saatStr}</dd>
              </div>
            )}
            <div>
              <dt>Kapsam</dt>
              <dd>{kapsamLabel}</dd>
            </div>
          </dl>
          {sinav.aciklama && <p className="stk-modal__note">{sinav.aciklama}</p>}
          <button type="button" onClick={onClose} className="stk-modal__done">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
