import GorevListClient from '@/components/gorev/GorevListClient';
import '@/components/gorev/gorev.css';

export default function CoachGorevlerPage() {
  return (
    <div className="coach-gorevler-page">
      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Görevler</h2>
          <p>Bugünkü, geciken ve bekleyen görevleriniz</p>
        </div>
      </header>
      <GorevListClient basePath="/coach/gorevler" takvimHref="/coach/takvim" />
    </div>
  );
}
