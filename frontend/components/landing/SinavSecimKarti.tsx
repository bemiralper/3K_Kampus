'use client';

import { resolveMediaUrl, type SinavTakvim } from '@/lib/website-api';
import { formatDateTRLong } from '@/lib/format-date';
import { sinavTurLabel } from '@/lib/landing-theme';
import { chipTone } from './MonthCalendarGrid';

const MONTH_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function clock(value?: string | null) {
  return value ? value.slice(0, 5) : '';
}

function panelDate(iso: string) {
  const long = formatDateTRLong(iso);
  const [weekday, rest] = long.split(', ');
  return rest ? `${rest}, ${weekday}` : long;
}

type SinavSecimKartiProps = {
  sinav: SinavTakvim;
  kurumAdi?: string;
  onPosterClick?: () => void;
  titleId?: string;
};

export default function SinavSecimKarti({ sinav, kurumAdi = '3K Kampüs', onPosterClick, titleId }: SinavSecimKartiProps) {
  const tone = chipTone(sinav.tur);
  const poster = resolveMediaUrl(sinav.gorsel_url);
  const day = sinav.tarih ? Number(sinav.tarih.slice(8, 10)) : null;
  const month = sinav.tarih ? Number(sinav.tarih.slice(5, 7)) - 1 : null;

  const image = poster ? <img src={poster} alt={sinav.baslik} /> : null;

  return (
    <>
      <p className="stk-side-kicker">Seçilen sınav</p>
      <div className="stk-side-date">
        <b>{day || '—'}</b>
        <span>{month != null && month >= 0 ? MONTH_SHORT[month].toLocaleUpperCase('tr') : ''}</span>
      </div>
      {sinav.yayin_adi && <p className="stk-side-pub">{sinav.yayin_adi}</p>}
      <h3 id={titleId}>{sinav.baslik}</h3>
      <div className="stk-side-tags">
        <span style={{ background: tone.fg }}>{sinavTurLabel(sinav.tur)}</span>
        <span>{sinav.kapsam === 'yerel' ? 'Kurum içi' : 'Türkiye Geneli'}</span>
      </div>
      <dl>
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          <dt>Tarih</dt>
          <dd>{sinav.tarih ? panelDate(sinav.tarih) : '—'}</dd>
        </div>
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></svg>
          <dt>Başlangıç</dt>
          <dd>{clock(sinav.saat) || '—'}</dd>
        </div>
        <div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
          <dt>Yer</dt>
          <dd>{kurumAdi}</dd>
        </div>
      </dl>
      {image && (
        onPosterClick ? (
          <button type="button" className="stk-poster" onClick={onPosterClick}>
            {image}
          </button>
        ) : (
          <div className="stk-poster">{image}</div>
        )
      )}
      <div className="stk-wa">
        <strong>Sonuçlar WhatsApp’ta</strong>
        <p>Sınav sonuç belgen, sonuçlar açıklandığında sistemde kayıtlı öğrenci ve veli numaralarına gönderilir.</p>
      </div>
      {sinav.aciklama && <p className="stk-note">{sinav.aciklama}</p>}
    </>
  );
}
