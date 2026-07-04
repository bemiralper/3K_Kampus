'use client';

import type { SiteSettings, BasariIstatistik } from '@/lib/website-api';
import { LANDING_COLORS } from '@/lib/landing-theme';

type TanitimSectionProps = {
  settings: SiteSettings | null;
  basariIstatistikleri: BasariIstatistik[];
};

export default function TanitimSection({ settings, basariIstatistikleri }: TanitimSectionProps) {
  const baslik = settings?.tanitim_baslik || '3K Kampüs Farkı';
  const icerik = settings?.tanitim_icerik || '';
  const videoId = settings?.youtube_video_id;

  return (
    <>
      <section id="3k-sistemi" className="py-16 lg:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight" style={{ color: LANDING_COLORS.navy }}>{baslik}</h2>
            <p className="mt-4 whitespace-pre-line text-slate-600 leading-relaxed">{icerik}</p>
          </div>
          <div className="aspect-video overflow-hidden rounded-2xl border border-slate-200 shadow-lg">
            {videoId ? (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title={baslik}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-slate-100 text-slate-400">Video yakında</div>
            )}
          </div>
        </div>
      </section>

      {basariIstatistikleri.length > 0 && (
        <section id="basarilarimiz" className="border-y border-slate-200 bg-white py-12">
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              {basariIstatistikleri.map(s => (
                <div key={s.id} className="text-center">
                  <div className="text-3xl font-bold" style={{ color: LANDING_COLORS.accent }}>{s.deger}</div>
                  <div className="mt-1 text-sm text-slate-500">{s.etiket}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
