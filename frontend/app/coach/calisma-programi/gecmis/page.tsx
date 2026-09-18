'use client';

import Link from 'next/link';
import { StudyProgramHistory } from '@/components/coach/study-plans/StudyPlanWorkspace';

export default function CoachStudyHistoryPage() {
  return (
    <div className="coach-calisma-page">
      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Geçmiş Programlar</h2>
          <p>Geçmiş haftalar salt okunur. Kurallar bu haftaya uygulanır; slot kopyalanmaz.</p>
        </div>
      </header>
      <p className="spl-preview" style={{ marginBottom: 12 }}>
        <Link href="/coach/calisma-programi">← Programa dön</Link>
      </p>
      <StudyProgramHistory />
    </div>
  );
}
