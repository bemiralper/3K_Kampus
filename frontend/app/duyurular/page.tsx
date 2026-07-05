import Link from 'next/link';
import { fetchLandingData } from '@/lib/website-api';
import { formatDateTR } from '@/lib/format-date';
import { LANDING_KURUM_KOD } from '@/lib/landing-theme';

export default async function DuyurularListPage() {
  const data = await fetchLandingData(LANDING_KURUM_KOD);
  const duyurular = data?.duyurular ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" className="text-sm font-medium text-[#0262a7] hover:underline">← Anasayfa</Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900">Duyurular</h1>
        <ul className="mt-8 space-y-4">
          {duyurular.map(d => (
            <li key={d.id}>
              <Link href={`/duyurular/${d.slug}`} className="block rounded-xl border border-slate-200 bg-white p-5 hover:shadow-md">
                <h2 className="font-semibold text-slate-900">{d.baslik}</h2>
                {d.yayin_tarihi && <time className="text-xs text-slate-400">{formatDateTR(d.yayin_tarihi)}</time>}
                <p className="mt-2 text-sm text-slate-500">{d.ozet}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
