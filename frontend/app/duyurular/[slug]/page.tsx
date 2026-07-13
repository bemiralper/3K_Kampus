import Link from 'next/link';
import { fetchDuyuruDetail } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import { notFound } from 'next/navigation';
import ContentDetailView from '@/components/website-content/ContentDetailView';
import '@/app/duyurular/content.css';

type Props = { params: { slug: string } };

export default async function DuyuruDetailPage({ params }: Props) {
  const duyuru = await fetchDuyuruDetail(LANDING_KURUM_KOD, params.slug);
  if (!duyuru) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <Link href="/duyurular" className="text-sm font-medium text-[#0262a7] hover:underline">← Duyurular</Link>
          <Link href="/" className="text-sm text-slate-500 hover:underline">Anasayfa</Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ContentDetailView item={duyuru} />
      </div>
    </div>
  );
}
