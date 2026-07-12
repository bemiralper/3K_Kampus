import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchLandingData, fetchYasalDetail } from '@/lib/website-api';
import { buildLandingMetadata } from '@/lib/landing-seo';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import { notFound } from 'next/navigation';

type Props = { params: { tur: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  const base = buildLandingMetadata(data, `/yasal/${params.tur}`);
  const metin = await fetchYasalDetail(LANDING_KURUM_KOD, params.tur);
  if (!metin) return { ...base, title: SITE_TAB_TITLE };
  return { ...base, title: SITE_TAB_TITLE, description: metin.baslik };
}

export default async function YasalDetailPage({ params }: Props) {
  const metin = await fetchYasalDetail(LANDING_KURUM_KOD, params.tur);
  if (!metin) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" className="text-sm font-medium text-[#0262a7] hover:underline">← Anasayfa</Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900">{metin.baslik}</h1>
        <p className="mt-2 text-sm text-slate-400">
          Son güncelleme: {new Date(metin.updated_at).toLocaleDateString('tr-TR')}
        </p>
        <div
          className="prose prose-slate mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: metin.icerik }}
        />
      </article>
    </div>
  );
}
