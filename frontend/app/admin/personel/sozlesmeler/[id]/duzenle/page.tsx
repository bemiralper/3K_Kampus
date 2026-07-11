import SozlesmeEditorClient from '../../components/SozlesmeEditorClient';

interface Props {
  params: { id: string };
}

export default function SozlesmeDuzenlePage({ params }: Props) {
  const id = parseInt(params.id, 10);
  return <SozlesmeEditorClient mode="edit" sozlesmeId={id} />;
}
