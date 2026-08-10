'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchPrograms,
  type WeeklyProgramListItem,
  LOAD_LEVEL_META,
} from '@/lib/study-program-api';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
  });
}

interface ProgramTabProps {
  studentId: number;
  /** programId verilirse o program açılır; yoksa editör listesi */
  onOpenProgram?: (programId?: number) => void;
}

export default function ProgramTab({ studentId, onOpenProgram }: ProgramTabProps) {
  const [programs, setPrograms] = useState<WeeklyProgramListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPrograms({ student_id: studentId, is_template: false });
      if (res.success && Array.isArray(res.data)) {
        setPrograms(res.data);
      } else {
        setError(res.error || 'Programlar yüklenemedi');
        setPrograms([]);
      }
    } catch {
      setError('Programlar yüklenirken hata oluştu');
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const currentWeek = programs[0] ?? null;

  if (loading) {
    return (
      <div className="student360-panel">
        <div className="coach-list-card">
          <div className="coach-skeleton coach-skeleton-line w60" />
          <div className="coach-skeleton coach-skeleton-line w80" style={{ marginTop: 8 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="student360-panel">
      {onOpenProgram && currentWeek && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            className="coach-link-btn"
            onClick={() => onOpenProgram(currentWeek.id)}
          >
            Programı düzenle
          </button>
        </div>
      )}

      {error && (
        <div className="coach-empty-state">
          <div className="coach-empty-icon">⚠️</div>
          <h4>{error}</h4>
          <button type="button" className="coach-link-btn" onClick={load}>
            Tekrar dene
          </button>
        </div>
      )}

      {!error && currentWeek ? (
        <article
          className="coach-list-card"
          role="button"
          tabIndex={0}
          onClick={() => onOpenProgram?.(currentWeek.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenProgram?.(currentWeek.id);
            }
          }}
          style={{ cursor: onOpenProgram ? 'pointer' : 'default' }}
        >
          <div className="coach-list-card-header">
            <h3 className="coach-list-card-title">Bu hafta</h3>
            {currentWeek.load_level && (
              <span
                className="coach-badge"
                style={{
                  background: `${LOAD_LEVEL_META[currentWeek.load_level]?.color}22`,
                  color: LOAD_LEVEL_META[currentWeek.load_level]?.color,
                }}
              >
                {LOAD_LEVEL_META[currentWeek.load_level]?.label || currentWeek.load_level}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {fmtDate(currentWeek.week_start)} – {fmtDate(currentWeek.week_end)}
          </div>
          <div style={{ fontSize: 13, marginTop: 8 }}>
            {currentWeek.total_block_count} içerik · {currentWeek.total_question_count} soru
          </div>
        </article>
      ) : !error ? (
        <div className="coach-empty-state">
          <div className="coach-empty-icon">📅</div>
          <h4>Çalışma programı yok</h4>
          <p>Bu öğrenci için henüz haftalık program oluşturulmamış.</p>
          {onOpenProgram && (
            <button
              type="button"
              className="coach-link-btn"
              style={{ marginTop: 12 }}
              onClick={() => onOpenProgram()}
            >
              Program oluştur
            </button>
          )}
        </div>
      ) : null}

      {!error && programs.length > 1 && (
        <>
          <h3 className="coach-section-title" style={{ marginTop: 20 }}>
            Geçmiş haftalar
          </h3>
          {programs.slice(1, 5).map((p) => (
            <article
              key={p.id}
              className="coach-list-card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenProgram?.(p.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenProgram?.(p.id);
                }
              }}
              style={{ cursor: onOpenProgram ? 'pointer' : 'default' }}
            >
              <div className="coach-list-card-header">
                <h3 className="coach-list-card-title" style={{ fontSize: 14 }}>
                  {fmtDate(p.week_start)} – {fmtDate(p.week_end)}
                </h3>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {p.total_block_count} içerik · {p.total_question_count} soru
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  );
}
