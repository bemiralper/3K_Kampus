import { redirect } from 'next/navigation';

export default function MuhasebeOgrenciLegacyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/muhasebe/ogrenci/liste/${params.id}`);
}
