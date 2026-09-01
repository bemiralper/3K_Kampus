"use client";

import { getK3Meta, type K3ShareRow } from "@/lib/k3-mode";

type OverallPerf = {
  total_assignments: number;
  assignment_success_percent: number;
  full_assignments: number;
  partial_assignments: number;
  not_brought_assignments: number;
  not_done_assignments: number;
  total_tasks_all: number;
  done_tasks_all: number;
  partial_tasks_all: number;
  not_done_tasks_all: number;
  total_questions_all: number;
  completed_questions_all: number;
  overall_completion_percent: number;
  question_completion_percent_all: number;
};

function ntr(value: number): string {
  return (value || 0).toLocaleString("tr-TR");
}

export default function OdevPerformanceDashboard({
  overall,
  k3Shares,
}: {
  overall: OverallPerf;
  k3Shares: K3ShareRow[];
}) {
  const odevPct = overall.assignment_success_percent || 0;
  const testPct = overall.total_tasks_all > 0
    ? Math.round((overall.done_tasks_all / overall.total_tasks_all) * 100)
    : 0;
  const soruPct = overall.question_completion_percent_all || 0;
  const performans = overall.overall_completion_percent || 0;
  const assignmentCount = overall.total_assignments || 0;

  const scoreHint = assignmentCount === 1
    ? "Bu ödevdeki çalışma ve tamamlama performansına göre."
    : `Son ${assignmentCount} ödevdeki çalışma ve tamamlama performansına göre.`;

  const metrics = [
    {
      key: "odev",
      pct: odevPct,
      label: "Ödev Tamamlama",
      hint: `${assignmentCount} ödev üzerinden`,
    },
    {
      key: "test",
      pct: testPct,
      label: "Test Tamamlama",
      hint: overall.total_tasks_all > 0
        ? `${ntr(overall.done_tasks_all)} / ${ntr(overall.total_tasks_all)} test`
        : "Tamamlanan test / toplam test",
    },
    {
      key: "soru",
      pct: soruPct,
      label: "Soru Tamamlama",
      hint: overall.total_questions_all > 0
        ? `${ntr(overall.completed_questions_all)} / ${ntr(overall.total_questions_all)} soru`
        : "Çözülen / toplam soru",
    },
  ];

  const statusRows = [
    { key: "full", icon: "✅", value: overall.full_assignments || 0, label: "Tamamlandı", color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
    { key: "partial", icon: "⚠️", value: overall.partial_assignments || 0, label: "Eksik", color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
    { key: "not_brought", icon: "🚫", value: overall.not_brought_assignments || 0, label: "Getirmedi", color: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
    { key: "not_done", icon: "❌", value: overall.not_done_assignments || 0, label: "Yapmadı", color: "#7f1d1d", bg: "#fef2f2", border: "#fecaca" },
  ];

  const testRows = [
    { key: "done", icon: "🟢", value: overall.done_tasks_all || 0, label: "Başarılı", color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
    { key: "partial", icon: "🟡", value: overall.partial_tasks_all || 0, label: "Geliştirilmeli", color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
    { key: "need", icon: "🔴", value: overall.not_done_tasks_all || 0, label: "Desteğe İhtiyaç Var", color: "#991b1b", bg: "#fef2f2", border: "#fecaca" },
  ];

  return (
    <div className="ok-report-perf ok-report-dash">
      <div className="ok-report-dash-kicker">ÖDEV PERFORMANSI</div>

      <div className="ok-report-dash-hero" title="Tüm testlerin ağırlıklı ortalaması (eksik ve yapmadı dahil)">
        <div className="ok-report-dash-score">
          <span className="ok-report-dash-score-num">{performans}</span>
          <span className="ok-report-dash-score-den"> / 100</span>
        </div>
        <div className="ok-report-dash-score-label">Genel Çalışma Skoru</div>
        <p className="ok-report-dash-score-hint">{scoreHint}</p>
      </div>

      <div className="ok-report-dash-metrics">
        {metrics.map((m) => (
          <div key={m.key} className="ok-report-dash-metric">
            <div className="ok-report-dash-metric-pct">%{m.pct}</div>
            <div className="ok-report-dash-metric-label">{m.label}</div>
            <div className="ok-report-dash-metric-hint">{m.hint}</div>
          </div>
        ))}
      </div>

      <div className="ok-report-dash-split">
        <section className="ok-report-dash-panel">
          <h3 className="ok-report-dash-h">Ödev Durumu</h3>
          <div className="ok-report-dash-status">
            {statusRows.map((row) => (
              <div
                key={row.key}
                className="ok-report-dash-status-item"
                style={{ background: row.bg, borderColor: row.border, color: row.color }}
              >
                <span className="ok-report-dash-status-icon">{row.icon}</span>
                <span className="ok-report-dash-status-num">{row.value}</span>
                <span className="ok-report-dash-status-label">{row.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="ok-report-dash-panel">
          <h3 className="ok-report-dash-h">Test Sonuçları</h3>
          <div className="ok-report-dash-tests">
            {testRows.map((row) => (
              <div
                key={row.key}
                className="ok-report-dash-test-row"
                style={{ background: row.bg, borderColor: row.border }}
              >
                <span className="ok-report-dash-test-icon">{row.icon}</span>
                <span className="ok-report-dash-test-num" style={{ color: row.color }}>{ntr(row.value)}</span>
                <span className="ok-report-dash-test-label" style={{ color: row.color }}>{row.label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {overall.total_questions_all > 0 && (
        <section className="ok-report-dash-panel ok-report-dash-questions">
          <h3 className="ok-report-dash-h">Soru Çözümü</h3>
          <div className="ok-report-dash-qrow">
            <div>
              <div className="ok-report-dash-qfrac">
                {ntr(overall.completed_questions_all)}
                <span> / {ntr(overall.total_questions_all)}</span>
              </div>
              <div className="ok-report-dash-qpct">%{soruPct} tamamlandı</div>
            </div>
            <div className="ok-report-dash-qbar">
              <div className="ok-report-dash-qfill" style={{ width: `${Math.min(100, Math.max(0, soruPct))}%` }} />
            </div>
          </div>
        </section>
      )}

      {k3Shares.length > 0 && (
        <section className="ok-report-dash-panel">
          <h3 className="ok-report-dash-h">3K Modları</h3>
          <div className="ok-report-dash-k3bar">
            {k3Shares.map((row) => {
              const meta = getK3Meta(row.mode);
              return (
                <div
                  key={row.mode}
                  title={`${row.label} %${row.percent}`}
                  style={{
                    width: `${Math.max(row.percent, 0)}%`,
                    background: meta?.color || "#94a3b8",
                    minWidth: row.percent > 0 ? 4 : 0,
                  }}
                />
              );
            })}
          </div>
          <div className="ok-report-dash-k3list">
            {k3Shares.map((row) => {
              const meta = getK3Meta(row.mode);
              return (
                <div
                  key={row.mode}
                  className="ok-report-dash-k3item"
                  style={{
                    color: meta?.color || "#334155",
                    background: meta?.bg || "#f8fafc",
                    borderColor: meta?.border || "#e2e8f0",
                  }}
                >
                  <span>{row.label}</span>
                  <strong>%{row.percent}</strong>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
