'use client';

import PublicContentShell from '@/components/landing/PublicContentShell';
import DuyurularListClient from '@/app/duyurular/DuyurularListClient';
import type { Duyuru, LandingData } from '@/lib/website-api';

type Props = {
  initialData: LandingData | null;
  initialItems: Duyuru[];
};

export default function DuyurularPageClient({ initialData, initialItems }: Props) {
  return (
    <PublicContentShell
      initialData={initialData}
      documentTitle="Duyurular"
      heroEyebrow="Güncel"
      heroTitle="Duyurular & Haberler"
      heroSubtitle="Kurumumuzdan duyurular, haberler ve önemli bilgilendirmeler. Arama ve filtre ile istediğiniz içeriğe hızlıca ulaşın."
      breadcrumb={[{ label: 'Duyurular', href: '/duyurular' }]}
    >
      <DuyurularListClient initialItems={initialItems} />
    </PublicContentShell>
  );
}
