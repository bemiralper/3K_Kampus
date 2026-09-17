'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import StudyProgramEditor from '@/components/coaching/study-program/StudyProgramEditor';
import {
  addDays,
  datesFromHomework,
  formatDateLocal,
  inclusiveDayCount,
  studyRangeEnd,
} from '@/components/coaching/study-program/programDateUtils';
import { stripCompletionTitleSuffix } from '@/components/odev/odevCompletionHelpers';
import {
  createProgram,
  fetchHomeworkPool,
  fetchPrograms,
  type HomeworkPoolItem,
  type WeeklyProgramListItem,
} from '@/lib/study-program-api';

interface ProgramTabProps {
  studentId: number;
  coachId?: number;
  initialProgramId?: number;
  initialWeekStart?: string;
  initialWeekEnd?: string;
  initialHomeworkId?: number;
  onOpenProgram?: (programId?: number) => void;
}

function fmtRange(start: string, end: string) {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const right = b.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: sameMonth ? undefined : 'short',
    year: 'numeric',
  });
  return `${left} – ${right}`;
}

function isExpired(weekEnd: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${weekEnd}T23:59:59`) < today;
}

function weekdayLabel(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', { weekday: 'short' });
}

export default function ProgramTab({
  studentId,
  coachId,
  initialProgramId,
  initialWeekStart,
  initialWeekEnd,
  initialHomeworkId,
  onOpenProgram,
}: ProgramTabProps) {
  const [editingId, setEditingId] = useState<number | null>(
    initialProgramId && Number.isFinite(initialProgramId) ? initialProgramId : null
  );
  const [programs, setPrograms] = useState<WeeklyProgramListItem[]>([]);
  const [homework, setHomework] = useState<HomeworkPoolItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [poolLoading, setPoolLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(initialWeekStart || '');
  const [weekEnd, setWeekEnd] = useState(initialWeekEnd || '');
  const [sourceHomeworkId, setSourceHomeworkId] = useState<number | null>(
    initialHomeworkId ?? null
  );
  const [showDone, setShowDone] = useState(false);

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPrograms({ student_id: studentId, is_template: false });
      setPrograms(res.success && res.data ? res.data : []);
    } catch {
      setError('Programlar yüklenemedi');
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const res = await fetchHomeworkPool({ student_id: studentId });
      const items = res.success && res.data ? (Array.isArray(res.data) ? res.data : []) : [];
      const seen = new Set<number>();
      setHomework(items.filter((hw) => (seen.has(hw.id) ? false : (seen.add(hw.id), true))));
    } catch {
      setHomework([]);
    } finally {
      setPoolLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadPrograms();
    void loadPool();
  }, [loadPrograms, loadPool]);

  useEffect(() => {
    if (initialProgramId && Number.isFinite(initialProgramId)) {
      setEditingId(initialProgramId);
    }
  }, [initialProgramId]);

  const openProgram = (id: number) => {
    setEditingId(id);
    onOpenProgram?.(id);
  };

  const closeProgram = () => {
    setEditingId(null);
    onOpenProgram?.(undefined);
    void loadPrograms();
  };

  const applyHomework = (hw: HomeworkPoolItem) => {
    const { start, end } = datesFromHomework(hw);
    if (start) setWeekStart(start);
    if (end) setWeekEnd(end);
    setSourceHomeworkId(hw.id);
  };

  const handleCreate = async () => {
    if (!weekStart || !weekEnd) return;
    setSaving(true);
    setError(null);
    try {
      const res = await createProgram({
        student: studentId,
        week_start: weekStart,
        week_end: weekEnd,
      });
      if (res.success && res.data) {
        setWeekStart('');
        setWeekEnd('');
        setSourceHomeworkId(null);
        openProgram(res.data.id);
      } else {
        setError(res.error || 'Program oluşturulamadı');
      }
    } catch {
      setError('Program oluşturulamadı');
    } finally {
      setSaving(false);
    }
  };

  const active = useMemo(
    () =>
      programs
        .filter((p) => p.completion_percent < 100)
        .sort((a, b) => b.week_start.localeCompare(a.week_start)),
    [programs]
  );
  const done = useMemo(
    () =>
      programs
        .filter((p) => p.completion_percent >= 100)
        .sort((a, b) => b.week_start.localeCompare(a.week_start)),
    [programs]
  );

  const canCreate = Boolean(weekStart && weekEnd && weekEnd >= weekStart && !saving);
  const studyDays =
    weekStart && weekEnd ? Math.max(0, inclusiveDayCount(weekStart, studyRangeEnd(weekEnd))) : 0;

  if (editingId) {
    return (
      <div className="s360p-shell is-editing">
        <StudyProgramEditor
          lockedStudentId={studentId}
          lockedCoachId={coachId}
          initialProgramId={editingId}
          embedded
          coachLayout
          onExit={closeProgram}
        />
      </div>
    );
  }

  return (
    <div className="s360p-shell">
      <div className="s360p-grid">
        <section className="s360p-composer" aria-label="Yeni program">
          <div className="s360p-composer-top">
            <span className="s360p-kicker">Yeni hafta</span>
            <h2>Tarih seç, programı aç</h2>
          </div>

          <div className="s360p-dates">
            <label>
              İlk gün
              <input
                type="date"
                value={weekStart}
                onChange={(e) => {
                  const next = e.target.value;
                  setWeekStart(next);
                  setSourceHomeworkId(null);
                  if (next && (!weekEnd || next > weekEnd)) {
                    setWeekEnd(formatDateLocal(addDays(new Date(`${next}T12:00:00`), 6)));
                  }
                }}
              />
            </label>
            <label>
              Kontrol
              <input
                type="date"
                value={weekEnd}
                min={weekStart || undefined}
                onChange={(e) => {
                  setWeekEnd(e.target.value);
                  setSourceHomeworkId(null);
                }}
              />
            </label>
          </div>

          {weekStart && weekEnd && (
            <p className="s360p-span">
              {weekdayLabel(weekStart)} {fmtRange(weekStart, weekEnd)}
              {studyDays > 0 ? ` · ${studyDays} gün` : ''}
            </p>
          )}

          <button
            type="button"
            className="s360p-create"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
          >
            {saving ? 'Açılıyor…' : 'Programı aç'}
          </button>

          <div className="s360p-hw">
            <div className="s360p-hw-head">
              <span>Ödevden tarih al</span>
              {poolLoading && <em>Yükleniyor</em>}
            </div>
            {!poolLoading && homework.length === 0 ? (
              <p className="s360p-muted">Aktif ödev yok.</p>
            ) : (
              <ul className="s360p-hw-list">
                {homework.map((hw) => {
                  const selected = sourceHomeworkId === hw.id;
                  const { start, end } = datesFromHomework(hw);
                  return (
                    <li key={hw.id}>
                      <button
                        type="button"
                        className={selected ? 'is-on' : undefined}
                        onClick={() => applyHomework(hw)}
                      >
                        <strong>{stripCompletionTitleSuffix(hw.title) || 'Ödev'}</strong>
                        <span>
                          {hw.lesson_name || hw.status_display || hw.status}
                          {start && end ? ` · ${fmtRange(start, end)}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="s360p-ledger" aria-label="Mevcut programlar">
          <div className="s360p-ledger-head">
            <span className="s360p-kicker">Haftalar</span>
            <strong>{programs.length}</strong>
          </div>

          {error && (
            <div className="s360p-error">
              {error}
              <button type="button" onClick={() => void loadPrograms()}>
                Yenile
              </button>
            </div>
          )}

          {loading ? (
            <div className="s360p-skel">
              {[1, 2, 3].map((i) => (
                <div key={i} className="coach-skeleton" style={{ height: 56, borderRadius: 4 }} />
              ))}
            </div>
          ) : programs.length === 0 ? (
            <div className="s360p-empty">Bu öğrenci için henüz haftalık program yok.</div>
          ) : (
            <>
              <ul className="s360p-rows">
                {active.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => openProgram(p.id)}>
                      <span className="s360p-when">
                        <b>{fmtRange(p.week_start, p.week_end)}</b>
                        {isExpired(p.week_end) && <em>süresi doldu</em>}
                      </span>
                      <span className="s360p-meta">
                        {p.total_block_count} blok
                        <i />
                        {p.total_question_count} soru
                      </span>
                      <span className="s360p-pct" data-tone={p.completion_percent >= 80 ? 'hi' : p.completion_percent >= 40 ? 'mid' : 'lo'}>
                        %{p.completion_percent}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {done.length > 0 && (
                <div className="s360p-done">
                  <button type="button" className="s360p-done-toggle" onClick={() => setShowDone((v) => !v)}>
                    Tamamlanan {done.length}
                    <span>{showDone ? '−' : '+'}</span>
                  </button>
                  {showDone && (
                    <ul className="s360p-rows is-done">
                      {done.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => openProgram(p.id)}>
                            <span className="s360p-when">
                              <b>{fmtRange(p.week_start, p.week_end)}</b>
                            </span>
                            <span className="s360p-meta">
                              {p.total_block_count} blok
                              <i />
                              {p.total_question_count} soru
                            </span>
                            <span className="s360p-pct" data-tone="hi">
                              %{p.completion_percent}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
