import GorevFormClient from '@/components/gorev/GorevFormClient';
import '@/components/gorev/gorev.css';

type Props = {
  params: { id: string };
};

export default function GorevDuzenlePage({ params }: Props) {
  return (
    <div style={{ padding: '24px' }}>
      <GorevFormClient gorevId={params.id} />
    </div>
  );
}
