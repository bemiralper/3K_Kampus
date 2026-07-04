'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { studentExamApi } from '@/components/olcme/api';
import type { StudentExamResponse } from '@/components/olcme/types';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function fmt(n: number, d = 1) {
  return Number(n).toFixed(d);
}

interface SinavlarTabProps {
  studentId: number;
}

export default function SinavlarTab({ studentId }: SinavlarTabProps) {
  const [data, setData] = useState<StudentExamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await studentExamApi.results(studentId);
      setData(result);
    } catch {
      setError('Sınav verileri yüklenemedi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const exams = useMemo(() => data?.exams ?? [], [data]);
  const kpi = data?.kpi ?? null;

  if (loading) {
    return (
      <div className="student360-panel">
        <div className="coach-kpi-row">
          {[1, 2, 3].map((i) => (
            <div key={i} className="coach-kpi-mini">
              <div className="coach-skeleton" style={{ height: 24, marginBottom: 6 }} />
              <div className="coach-skeleton" style={{ height: 12 }} />
            </div>
          ))}
        </div>
        {[1, 2].map((i) => (
          <div key={i} className="coach-list-card">
            <div className="coach-skeleton coach-skeleton-line w60" />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">⚠️</div>
          <h4>{error || 'Veri yok'}</h4>
          <button type="button" className="coach-link-btn" onClick={load}>
            Tekrar dene
          </button>
        </div>
      </div>
    );
  }

  if (!exams.length && !kpi) {
    return (
      <div className="student360-panel">
        <div className="coach-empty-state">
          <div className="coach-empty-icon">🎯</div>
          <h4>Sınav kaydı yok</h4>
          <p>Henüz sınav sonucu bulunmuyor.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="student360-panel">
      {kpi && (
        <div className="coach-kpi-row">
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{kpi.toplam_sinav}</div>
            <div className="coach-kpi-mini-label">Toplam sınav</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">{fmt(kpi.ortalama_net)}</div>
            <div className="coach-kpi-mini-label">Ort. net</div>
          </div>
          <div className="coach-kpi-mini">
            <div className="coach-kpi-mini-value">
              {kpi.max_net != null ? fmt(kpi.max_net) : '—'}
            </div>
            <div className="coach-kpi-mini-label">En yüksek</div>
          </div>
        </div>
      )}

      {exams.slice().reverse().map((exam) => (
        <article key={exam.exam_id} className="coach-list-card">
          <div className="coach-list-card-header">
            <h3 className="coach-list-card-title">{exam.exam_name}</h3>
            <span className="coach-badge blue">{exam.exam_type_display || exam.exam_type}</span>
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {fmtDate(exam.exam_date)} · Net: <strong>{fmt(exam.total_net)}</strong>
            {exam.kurum_ici_sira > 0 && (
              <span style={{ marginLeft: 10 }}>Sıra: {exam.kurum_ici_sira}</span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
