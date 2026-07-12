import type { Metadata } from 'next';
import { fetchLandingData } from '@/lib/website-api';
import { LANDING_KURUM_KOD, SITE_TAB_TITLE } from '@/lib/landing-theme';
import IletisimPageClient from '@/components/landing/iletisim/IletisimPageClient';

export const metadata: Metadata = {
  title: `İletişim · ${SITE_TAB_TITLE}`,
  description:
    'Kayıt, bilgi ve iş birliği talepleriniz için 3K Kampüs ile telefon, WhatsApp, e-posta veya iletişim formu üzerinden iletişime geçin.',
};

export default async function IletisimPage() {
  const initialData = await fetchLandingData(LANDING_KURUM_KOD);
  return <IletisimPageClient initialData={initialData} />;
}
