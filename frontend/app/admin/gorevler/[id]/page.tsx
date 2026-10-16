import GorevRecordPage from '@/components/gorev/GorevRecordPage';
import '@/components/gorev/gorev.css';

type Props = { params: { id: string } };

export default function AdminGorevRecordPage({ params }: Props) {
  return (
    <div className="gorev-admin-page">
      <GorevRecordPage gorevId={params.id} listHref="/admin/gorevler" mode="admin" />
    </div>
  );
}
