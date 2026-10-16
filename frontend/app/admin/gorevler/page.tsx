import GorevListClient from '@/components/gorev/GorevListClient';
import '@/components/gorev/gorev.css';

export default function AdminGorevlerPage() {
  return (
    <div className="gorev-admin-page">
      <GorevListClient
        basePath="/admin/gorevler"
        takvimHref="/admin/gorevler/takvim"
        showCreateLink
        createHref="/admin/gorevler/yeni"
        adminView
      />
    </div>
  );
}
