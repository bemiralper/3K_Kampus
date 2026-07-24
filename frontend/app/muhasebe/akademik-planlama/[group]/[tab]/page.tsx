import {
  akademikTabMetadata,
  generateAkademikStaticParams,
  renderAkademikTabPage,
} from '@/components/akademik/akademikTabPages';
import { MUHASEBE_AKADEMIK_BASE } from '@/lib/akademik-routes';

type PageProps = {
  params: { group: string; tab: string };
};

export const generateStaticParams = generateAkademikStaticParams;

export function generateMetadata({ params }: PageProps) {
  return akademikTabMetadata(params);
}

export default function MuhasebeAkademikTabPage({ params }: PageProps) {
  return renderAkademikTabPage(params, MUHASEBE_AKADEMIK_BASE);
}
