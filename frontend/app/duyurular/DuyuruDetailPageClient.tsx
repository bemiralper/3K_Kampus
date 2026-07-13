'use client';

import Link from 'next/link';
import PublicContentShell from '@/components/landing/PublicContentShell';
import ContentDetailView from '@/components/website-content/ContentDetailView';
import type { Duyuru, LandingData } from '@/lib/website-api';

type Props = {
  initialData: LandingData | null;
  duyuru: Duyuru;
};

export default function DuyuruDetailPageClient({ initialData, duyuru }: Props) {
  return (
    <PublicContentShell
      initialData={initialData}
      documentTitle={duyuru.baslik}
      heroEyebrow="Duyuru"
      heroTitle={duyuru.baslik}
      heroSubtitle={duyuru.ozet || undefined}
      breadcrumb={[
        { label: 'Duyurular', href: '/duyurular' },
        { label: duyuru.baslik, href: `/duyurular/${duyuru.slug}` },
      ]}
    >
      <Link href="/duyurular" className="wc-back-link wc-scope">
        ← Tüm duyurular
      </Link>
      <ContentDetailView item={duyuru} variant="embedded" />
    </PublicContentShell>
  );
}
