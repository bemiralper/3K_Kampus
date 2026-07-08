import { redirect } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CariDetayPage({ params }: Props) {
  const { id } = await params;
  redirect(`/finans/cari-hesaplar-v2/${id}`);
}
