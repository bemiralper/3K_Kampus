'use client';

import Link from 'next/link';
import { StudyTemplateList } from '@/components/coach/study-plans/StudyPlanWorkspace';

export default function CoachStudyTemplatesPage() {
  return (
    <div className="coach-calisma-page">
      <header className="coach-page-header">
        <div className="coach-page-header-text">
          <h2>Şablonları Yönet</h2>
          <p>Kurum şablonları — kural paketi, öğrenci kopyası değil.</p>
        </div>
      </header>
      <p className="spl-preview" style={{ marginBottom: 12 }}>
        <Link href="/coach/calisma-programi">← Programa dön</Link>
      </p>
      <StudyTemplateList />
    </div>
  );
}
