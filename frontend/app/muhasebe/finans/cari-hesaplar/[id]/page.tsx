import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MuhasebeCariDetayPage({ params }: Props) {
  const { id } = await params;
  redirect(`/muhasebe/finans/cari-hesaplar-v2/${id}`);
}
