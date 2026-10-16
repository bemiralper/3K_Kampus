import GorevRecordPage from '@/components/gorev/GorevRecordPage';
import '@/components/gorev/gorev.css';

type Props = { params: { id: string } };

export default function MuhasebeGorevRecordPage({ params }: Props) {
  return (
    <div>
      <GorevRecordPage gorevId={params.id} listHref="/muhasebe/gorevler" mode="assignee" />
    </div>
  );
}
