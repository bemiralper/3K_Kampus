import CariDetayClient from "./CariDetayClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CariDetayPage({ params }: Props) {
  const { id } = await params;
  return <CariDetayClient cariHesapId={Number(id)} />;
}
