import GorevRecordPage from '@/components/gorev/GorevRecordPage';
import '@/components/gorev/gorev.css';

type Props = { params: { id: string } };

export default function CoachGorevRecordPage({ params }: Props) {
  return (
    <div className="coach-gorevler-page">
      <GorevRecordPage gorevId={params.id} listHref="/coach/gorevler" mode="assignee" />
    </div>
  );
}
