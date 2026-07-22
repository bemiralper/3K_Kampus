import {
  buildYasalTurMetadata,
  renderYasalTurPage,
  yasalStaticParams,
} from '@/lib/yasal-tur-page';

export const dynamic = 'force-dynamic';

type Props = { params: { tur: string } };

export function generateStaticParams() {
  return yasalStaticParams();
}

export async function generateMetadata({ params }: Props) {
  return buildYasalTurMetadata(params.tur);
}

export default async function YasalDetailPage({ params }: Props) {
  return renderYasalTurPage(params.tur);
}
