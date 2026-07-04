import GorevListClient from '@/components/gorev/GorevListClient';
import '@/components/gorev/gorev.css';

export default function AdminGorevlerPage() {
  return (
    <div className="gorev-admin-page">
      <header className="gorev-admin-header">
        <div>
          <h1>Görev Yönetimi</h1>
          <p>Kurum genelinde görevleri takip edin, filtreleyin ve yönetin.</p>
        </div>
      </header>
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
