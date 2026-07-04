import Link from 'next/link';
import { fetchDuyuruDetail } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { notFound } from 'next/navigation';

type Props = { params: { slug: string } };

export default async function DuyuruDetailPage({ params }: Props) {
  const duyuru = await fetchDuyuruDetail(LANDING_KURUM_KOD, params.slug);
  if (!duyuru) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" className="text-sm font-medium text-[#0262a7] hover:underline">← Anasayfa</Link>
        </div>
      </header>
      <article className="mx-auto max-w-3xl px-4 py-10">
        {duyuru.yayin_tarihi && (
          <time className="text-sm text-slate-400">{new Date(duyuru.yayin_tarihi).toLocaleDateString('tr-TR')}</time>
        )}
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{duyuru.baslik}</h1>
        <div
          className="prose prose-slate mt-6 max-w-none"
          dangerouslySetInnerHTML={{ __html: duyuru.icerik || duyuru.ozet }}
        />
      </article>
    </div>
  );
}
