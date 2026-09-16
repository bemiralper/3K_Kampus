'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchPrograms,
  type WeeklyProgramListItem,
  LOAD_LEVEL_META,
} from '@/lib/study-program-api';
import Student360Icon from '@/components/coach/Student360Icon';

function fmtWeekRange(start?: string | null, end?: string | null) {
  if (!start && !end) return '—';
  const s = start
    ? new Date(start).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    : '—';
  const e = end
    ? new Date(end).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  return `${s} – ${e}`;
}

function monthKey(d?: string | null) {
  if (!d) return 'unknown';
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}`;
}

function monthLabel(key: string) {
  if (key === 'unknown') return 'Diğer';
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1),
  );
}

interface ProgramTabProps {
  studentId: number;
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
  const pastPrograms = programs.slice(1);

  const groupedPast = useMemo(() => {
    const map = new Map<string, WeeklyProgramListItem[]>();
    pastPrograms.forEach((p) => {
      const key = monthKey(p.week_start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return [...map.entries()];
  }, [pastPrograms]);

  if (loading) {
    return (
      <div className="student360-panel s360-program-panel">
        <div className="coach-skeleton" style={{ height: 48, borderRadius: 12 }} />
        <div className="coach-skeleton" style={{ height: 120, borderRadius: 14, marginTop: 12 }} />
      </div>
    );
  }

  return (
    <div className="student360-panel s360-program-panel">
      <div className="s360-program-head">
        <div>
          <h2 className="s360-panel-title">Çalışma programları</h2>
          <p className="s360-panel-sub">Haftalık planlar bu öğrenciye özel listelenir.</p>
        </div>
        {onOpenProgram && (
          <button type="button" className="s360-program-create-btn" onClick={() => onOpenProgram()}>
            <Student360Icon name="calendar" size={17} />
            Yeni program
          </button>
        )}
      </div>

      {error && (
        <div className="coach-empty-state">
          <div className="coach-empty-icon">⚠️</div>
          <h4>{error}</h4>
          <button type="button" className="coach-link-btn" onClick={load}>
            Tekrar dene
          </button>
        </div>
      )}

      {!error && !currentWeek && (
        <div className="coach-empty-state s360-program-empty">
          <div className="coach-empty-icon">📅</div>
          <h4>Çalışma programı yok</h4>
          <p>Bu öğrenci için henüz haftalık program oluşturulmamış.</p>
          {onOpenProgram && (
            <button
              type="button"
              className="s360-program-create-btn primary"
              style={{ marginTop: 14 }}
              onClick={() => onOpenProgram()}
            >
              Program oluştur
            </button>
          )}
        </div>
      )}

      {!error && currentWeek && (
        <section className="s360-program-section" aria-label="Bu hafta">
          <h3 className="s360-program-section-label">Bu hafta</h3>
          <ProgramCard program={currentWeek} highlight onOpen={onOpenProgram} />
        </section>
      )}

      {!error && groupedPast.length > 0 && (
        <section className="s360-program-timeline" aria-label="Geçmiş programlar">
          <h3 className="s360-program-section-label">Geçmiş</h3>
          {groupedPast.map(([key, items]) => (
            <div key={key} className="s360-program-month-group">
              <div className="s360-program-month-label">{monthLabel(key)}</div>
              <ul className="s360-program-month-list">
                {items.map((p) => (
                  <li key={p.id}>
                    <ProgramCard program={p} onOpen={onOpenProgram} compact />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function ProgramCard({
  program,
  onOpen,
  highlight = false,
  compact = false,
}: {
  program: WeeklyProgramListItem;
  onOpen?: (id: number) => void;
  highlight?: boolean;
  compact?: boolean;
}) {
  const loadMeta = program.load_level ? LOAD_LEVEL_META[program.load_level] : null;

  return (
    <article
      className={`s360-program-card${highlight ? ' is-current' : ''}${compact ? ' is-compact' : ''}`}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(program.id)}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(program.id);
        }
      }}
    >
      <div className="s360-program-card-main">
        <span className="s360-program-card-dates">
          {fmtWeekRange(program.week_start, program.week_end)}
        </span>
        <span className="s360-program-card-stats">
          {program.total_block_count} içerik · {program.total_question_count} soru
        </span>
      </div>
      {loadMeta && (
        <span
          className="s360-program-load-badge"
          style={{
            background: `${loadMeta.color}18`,
            color: loadMeta.color,
          }}
        >
          {loadMeta.label}
        </span>
      )}
      {onOpen && (
        <span className="s360-program-card-cta" aria-hidden>
          →
        </span>
      )}
    </article>
  );
}
