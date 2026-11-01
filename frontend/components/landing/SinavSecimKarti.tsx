'use client';

import type { SinavTakvim } from '@/lib/website-api';
import { formatDateTRLong } from '@/lib/format-date';
import { sinavTurLabel } from '@/lib/landing-theme';
import Icon from '@/components/olcme/ui/Icon';
import SinavPoster from './SinavPoster';
import s from './sinavDetail.module.css';

export default function SinavSecimKarti({ sinav, kurumAdi = '3K Kampüs', titleId }: {
  sinav: SinavTakvim;
  kurumAdi?: string;
  titleId?: string;
}) {
  const start = sinav.saat?.slice(0, 5);
  const end = sinav.saat_bitis?.slice(0, 5);
  return (
    <article className={s.detail}>
      <div className={s.visual}>
        <SinavPoster key={sinav.gorsel_url} url={sinav.gorsel_url} className={s.poster} />
        <div className={s.visualCaption}><Icon name="exam" size={16} /><span>Deneme sınavı</span></div>
      </div>
      <div className={s.content}>
        <div className={s.tags}>
          <span className={s.type}>{sinavTurLabel(sinav.tur)}</span>
          <span className={sinav.kapsam === 'turkiye_geneli' ? s.national : s.local}>
            {sinav.kapsam === 'turkiye_geneli' ? 'Türkiye Geneli' : 'Kurum içi'}
          </span>
        </div>
        {sinav.yayin_adi && <p className={s.publisher}>{sinav.yayin_adi}</p>}
        <h2 id={titleId} className={s.title}>{sinav.baslik}</h2>
        <p className={s.intro}>Sınav programı ve uygulama bilgileri</p>
        <div className={s.facts}>
          <div className={s.fact}><span className={s.icon}><Icon name="calendar" size={19} /></span>
            <dl><dt>Tarih</dt><dd>{sinav.tarih ? formatDateTRLong(sinav.tarih) : 'Henüz belirlenmedi'}</dd></dl>
          </div>
          <div className={s.timeRow}>
            <div className={s.fact}><span className={s.icon}><Icon name="clock" size={19} /></span>
              <dl><dt>Başlangıç</dt><dd>{start || 'Henüz belirlenmedi'}</dd></dl>
            </div>
            {end && <div className={s.fact}><span className={s.icon}><Icon name="clock" size={19} /></span>
              <dl><dt>Bitiş</dt><dd>{end}</dd></dl>
            </div>}
          </div>
          <div className={s.fact}><span className={s.icon}><Icon name="building" size={19} /></span>
            <dl><dt>Uygulama yeri</dt><dd>{kurumAdi}</dd></dl>
          </div>
        </div>
        {sinav.aciklama && <section className={s.notes}><h3>Sınav hakkında</h3><p>{sinav.aciklama}</p></section>}
        <div className={s.notice}><Icon name="info" size={17} /><p>Sonuçların paylaşım zamanı ve yöntemi kurum tarafından belirlenir.</p></div>
      </div>
    </article>
  );
}
