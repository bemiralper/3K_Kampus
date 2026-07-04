"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCoachStudents, type CoachPortalStudent, type RiskSeviyesi } from "@/lib/coach-api";

function countByRisk(students: CoachPortalStudent[], level: RiskSeviyesi) {
  return students.filter((s) => s.risk_seviyesi === level).length;
}

export default function CoachRaporlarPage() {
  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchCoachStudents();
    if (res.success && res.data) {
      setStudents(res.data);
    } else {
      setError(res.error || "Rapor verisi yüklenemedi.");
      setStudents([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const overdueTotal = students.reduce(
      (sum, s) => sum + (s.overdue_homework_count ?? 0),
      0
    );
    return {
      studentCount: students.length,
      overdueTotal,
      riskDusuk: countByRisk(students, "low"),
      riskOrta: countByRisk(students, "medium"),
      riskYuksek: countByRisk(students, "high"),
      riskUnknown: students.filter((s) => !s.risk_seviyesi).length,
    };
  }, [students]);

  return (
    <div>
      <header className="coach-page-header">
        <h2>Raporlar</h2>
        <p>Koç kapsamınızdaki öğrenci özeti</p>
      </header>

      {loading && <div className="coach-loading">Raporlar yükleniyor…</div>}
      {!loading && error && <div className="coach-error">{error}</div>}

      {!loading && !error && (
        <>
          <div className="coach-kpi-row">
            <div className="coach-kpi-mini">
              <div className="coach-kpi-mini-value">{stats.studentCount}</div>
              <div className="coach-kpi-mini-label">Öğrenci</div>
            </div>
            <div className="coach-kpi-mini">
              <div className="coach-kpi-mini-value">{stats.overdueTotal}</div>
              <div className="coach-kpi-mini-label">Geciken ödev</div>
            </div>
            <div className="coach-kpi-mini">
              <div className="coach-kpi-mini-value">{stats.riskYuksek}</div>
              <div className="coach-kpi-mini-label">Yüksek risk</div>
            </div>
          </div>

          <section className="coach-list-card" style={{ marginBottom: 16 }}>
            <h3 className="coach-section-title">Risk dağılımı</h3>
            <ul className="coach-report-risk-list">
              <li>
                <span className="coach-risk-badge risk-yuksek">Yüksek</span>
                <strong>{stats.riskYuksek}</strong>
              </li>
              <li>
                <span className="coach-risk-badge risk-orta">Orta</span>
                <strong>{stats.riskOrta}</strong>
              </li>
              <li>
                <span className="coach-risk-badge risk-dusuk">Düşük</span>
                <strong>{stats.riskDusuk}</strong>
              </li>
              <li>
                <span className="coach-risk-badge risk-none">Belirsiz</span>
                <strong>{stats.riskUnknown}</strong>
              </li>
            </ul>
          </section>

          <div className="coach-report-export">
            <button type="button" className="coach-btn coach-btn-secondary" disabled title="Yakında">
              Dışa aktar (yakında)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
