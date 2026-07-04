import PersonelDetayClient from './PersonelDetayClient';

interface Props {
  params: Promise<{ personelId: string }>;
}

export default async function PersonelDetayPage({ params }: Props) {
  const { personelId } = await params;
  return <PersonelDetayClient personelId={Number(personelId)} />;
}
