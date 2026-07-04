import type { ComponentType } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchLandingData, fetchYasalDetail } from '@/lib/website-api';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import { KVKK_META } from '@/lib/kvkk-content';
import { GIZLILIK_META } from '@/lib/gizlilik-content';
import YasalShellClient from '@/components/landing/yasal/YasalShellClient';
import KvkkContent from '@/components/landing/yasal/KvkkContent';
import GizlilikContent from '@/components/landing/yasal/GizlilikContent';
import { notFound } from 'next/navigation';

type Props = { params: { tur: string } };

const STATIC_YASAL: Record<string, { meta: typeof KVKK_META; Content: ComponentType }> = {
  kvkk: { meta: KVKK_META, Content: KvkkContent },
  gizlilik: { meta: GIZLILIK_META, Content: GizlilikContent },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const staticPage = STATIC_YASAL[params.tur];
  if (staticPage) {
    return {
      title: SITE_TAB_TITLE,
      description: staticPage.meta.intro,
    };
  }
  const metin = await fetchYasalDetail(LANDING_KURUM_KOD, params.tur);
  if (!metin) return { title: SITE_TAB_TITLE };
  return { title: SITE_TAB_TITLE, description: metin.baslik };
}

export default async function YasalDetailPage({ params }: Props) {
  const staticPage = STATIC_YASAL[params.tur];
  if (staticPage) {
    const initialData = await fetchLandingData(LANDING_KURUM_KOD);
    const { meta, Content } = staticPage;
    return (
      <YasalShellClient initialData={initialData}>
        <Content />
      </YasalShellClient>
    );
  }

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
