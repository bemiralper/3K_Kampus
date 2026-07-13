import Link from 'next/link';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';
import DuyurularListClient from './DuyurularListClient';
import '@/app/duyurular/content.css';

export default async function DuyurularListPage() {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  const duyurular = data?.duyurular ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-4xl items-center px-4">
          <Link href="/" className="text-sm font-medium text-[#0262a7] hover:underline">← Anasayfa</Link>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900">Duyurular & Haberler</h1>
        <p className="mt-2 text-slate-500">Kurumdan güncel duyuru ve haberler</p>
        <div className="mt-8">
          <DuyurularListClient initialItems={duyurular} />
        </div>
      </div>
    </div>
  );
}
