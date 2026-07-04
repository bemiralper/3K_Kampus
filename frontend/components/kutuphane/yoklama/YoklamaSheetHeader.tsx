'use client';

import { brandingFromKurum, getAppLogo, DEFAULT_BRANDING } from '@/lib/kurum-branding';
import { useKurum } from '@/lib/contexts/KurumContext';

type Props = {
  title: string;
  salonAdi: string;
  subeAdi?: string;
  tarihLabel: string;
  ogrenciSayisi?: number;
};

export default function YoklamaSheetHeader({ title, salonAdi, subeAdi, tarihLabel, ogrenciSayisi }: Props) {
  const { activeKurum } = useKurum();
  const branding = activeKurum ? brandingFromKurum(activeKurum) : null;
  const theme = branding?.tema_rengi || '#0262a7';
  const kurumAd = branding?.gorunen_ad || '3K Kampüs';
  const logo = getAppLogo(branding ?? DEFAULT_BRANDING);

  return (
    <div className="yok-sheet-header" style={{ borderBottom: `3px solid ${theme}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={kurumAd} width={48} height={48} style={{ objectFit: 'contain' }} />
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: theme }}>{title}</h2>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginTop: 2 }}>{kurumAd}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            {salonAdi}{subeAdi ? ` · ${subeAdi}` : ''} · {tarihLabel}
            {ogrenciSayisi != null ? ` · ${ogrenciSayisi} öğrenci` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
