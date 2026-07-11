import SozlesmeDetayClient from '../components/SozlesmeDetayClient';

interface Props {
  params: { id: string };
}

export default function SozlesmeDetayPage({ params }: Props) {
  const id = parseInt(params.id, 10);
  return <SozlesmeDetayClient sozlesmeId={id} />;
}
