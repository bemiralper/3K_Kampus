import {
  akademikTabMetadata,
  generateAkademikStaticParams,
  renderAkademikTabPage,
} from '@/components/akademik/akademikTabPages';
import { AKADEMIK_BASE } from '@/lib/akademik-routes';

type PageProps = {
  params: { group: string; tab: string };
};

export const generateStaticParams = generateAkademikStaticParams;

export function generateMetadata({ params }: PageProps) {
  return akademikTabMetadata(params);
}

export default function AkademikTabPage({ params }: PageProps) {
  return renderAkademikTabPage(params, AKADEMIK_BASE);
}
