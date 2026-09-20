'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchAttendanceFollowup,
  fetchAttendanceFollowupAnalysis,
  type AttendanceAnalysisPayload,
  type AttendanceFollowupPayload,
  type AttendanceFollowupStudent,
} from '@/lib/coaching-api';
import YoklamaStudentDrawer from '@/components/gorev/YoklamaStudentDrawer';
import './attendance-followup-admin.css';

type Tab = 'gun' | 'analiz';
type IssueFilter = '' | 'issues' | 'absent' | 'alarm';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatLong(iso: string) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      weekday: 'long',
    });
  } catch {
    return iso;
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function severityLabel(severity: string) {
  if (severity === 'alarm') return 'Alarm';
  if (severity === 'attention') return 'Dikkat';
  return 'Takip';
}

function todayLabel(row: AttendanceFollowupStudent) {
  if (row.today_absent) return 'Gelmedi';
  if (row.today_late) return row.today_exit ? 'Geç · Çıkış' : 'Geç';
  if (row.today_exit) return 'Çıkış';
  if (row.today_status === 'PRESENT') return 'Geldi';
  if (row.today_status === 'EXCUSED') return 'İzinli';
  return 'Kayıt yok';
}

function todayTone(row: AttendanceFollowupStudent) {
  if (row.today_absent) return 'absent';
  if (row.today_late) return 'late';
  if (row.today_exit) return 'exit';
  if (row.today_status === 'PRESENT') return 'present';
  if (row.today_status === 'EXCUSED') return 'excused';
  return 'none';
}

function AttendanceFollowupAdmin() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(searchParams.get('tab') === 'analiz' ? 'analiz' : 'gun');
  const [date, setDate] = useState(searchParams.get('date') || todayISO());
  const [search, setSearch] = useState('');
  const [coachId, setCoachId] = useState(searchParams.get('coach') || '');
  const [classId, setClassId] = useState(searchParams.get('class') || '');
  const [issue, setIssue] = useState<IssueFilter>('');
  const [data, setData] = useState<AttendanceFollowupPayload | null>(null);
  const [analysis, setAnalysis] = useState<AttendanceAnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState('');
  const [studentId, setStudentId] = useState(Number(searchParams.get('student') || 0) || null);

  const syncUrl = useCallback((next: { tab?: Tab; date?: string; student?: number | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextTab = next.tab ?? tab;
    const nextDate = next.date ?? date;
    const nextStudent = next.student === undefined ? studentId : next.student;
    if (nextTab === 'analiz') params.set('tab', 'analiz');
    else params.delete('tab');
    if (nextDate) params.set('date', nextDate);
    if (nextStudent) params.set('student', String(nextStudent));
    else params.delete('student');
    router.replace(`/admin/coaching/attendance?${params.toString()}`, { scroll: false });
  }, [date, router, searchParams, studentId, tab]);

  const loadDay = useCallback(async (day: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAttendanceFollowup(day);
      if (res.success && res.data) setData(res.data);
      else {
        setData(null);
        setError(res.error || 'Yoklama listesi yüklenemedi.');
      }
    } catch {
      setData(null);
      setError('Yoklama listesi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback(async (day: string) => {
    setAnalysisLoading(true);
    try {
      const res = await fetchAttendanceFollowupAnalysis(day);
      if (res.success && res.data) setAnalysis(res.data);
      else setAnalysis(null);
    } catch {
      setAnalysis(null);
    } finally {
      setAnalysisLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(date);
  }, [date, loadDay]);

  useEffect(() => {
    if (tab === 'analiz') loadAnalysis(date);
  }, [tab, date, loadAnalysis]);

  const changeDate = (next: string) => {
    setDate(next);
    syncUrl({ date: next });
  };

  const changeTab = (next: Tab) => {
    setTab(next);
    syncUrl({ tab: next });
  };

  const openStudent = (id: number) => {
    setStudentId(id);
    syncUrl({ student: id, tab: 'gun' });
    setTab('gun');
  };

  const closeStudent = () => {
    setStudentId(null);
    syncUrl({ student: null });
  };

  const rows = useMemo(() => {
    const all = data?.students || [];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return all.filter((row) => {
      if (coachId && String(row.coach_id || '') !== coachId) return false;
      if (classId && String(row.sinif_id || '') !== classId) return false;
      if (issue === 'issues' && row.severity === 'none' && !row.today_absent && !row.today_late && !row.today_exit) {
        return false;
      }
      if (issue === 'absent' && !row.today_absent) return false;
      if (issue === 'alarm' && row.severity !== 'alarm') return false;
      if (q) {
        const hay = `${row.student_name} ${row.sinif_name || ''} ${row.coach_name || ''}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classId, coachId, data, issue, search]);

  const counts = useMemo(() => ({
    total: rows.length,
    present: rows.filter((r) => r.today_status === 'PRESENT').length,
    late: rows.filter((r) => r.today_late).length,
    absent: rows.filter((r) => r.today_absent).length,
    exit: rows.filter((r) => r.today_exit).length,
    alarm: rows.filter((r) => r.severity === 'alarm').length,
  }), [rows]);

  return (
    <div className="afa-page">
      <header className="afa-hero">
        <div>
          <p className="afa-kicker">Koçluk · Takip</p>
          <h1>Yoklama Takibi</h1>
          <p className="afa-lead">Grup dersi ve kütüphane box yoklaması. Özel ders ve deneme kulübü bu listede yok.</p>
        </div>
        <div className="afa-seg" role="tablist">
          <button type="button" className={tab === 'gun' ? 'on' : ''} onClick={() => changeTab('gun')}>Gün</button>
          <button type="button" className={tab === 'analiz' ? 'on' : ''} onClick={() => changeTab('analiz')}>Analiz</button>
        </div>
      </header>

      <div className="afa-bar">
        <div className="afa-date">
          <button type="button" onClick={() => changeDate(shiftISO(date, -1))} aria-label="Önceki gün">‹</button>
          <label>
            <span className="afa-sr">Tarih</span>
            <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
          </label>
          <button type="button" onClick={() => changeDate(shiftISO(date, 1))} aria-label="Sonraki gün">›</button>
        </div>
        <p className="afa-date-label">{formatLong(date)}</p>
        {tab === 'gun' ? (
          <>
            <input
              className="afa-search"
              type="search"
              placeholder="Öğrenci, sınıf, koç"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
              <option value="">Koç: tümü</option>
              {(data?.filters?.coaches || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Sınıf: tümü</option>
              {(data?.filters?.classes || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="afa-chips">
              {([
                ['', 'Tümü'],
                ['issues', 'Sorun'],
                ['absent', 'Gelmedi'],
                ['alarm', 'Alarm'],
              ] as const).map(([value, label]) => (
                <button
                  key={value || 'all'}
                  type="button"
                  className={issue === value ? 'on' : ''}
                  onClick={() => setIssue(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {tab === 'gun' ? (
        <>
          <div className="afa-meters">
            <div><b>{counts.total}</b><span>Öğrenci</span></div>
            <div><b>{counts.present}</b><span>Geldi</span></div>
            <div className="late"><b>{counts.late}</b><span>Geç</span></div>
            <div className="absent"><b>{counts.absent}</b><span>Gelmedi</span></div>
            <div><b>{counts.exit}</b><span>Çıkış</span></div>
            <div className="alarm"><b>{counts.alarm}</b><span>Alarm</span></div>
          </div>
          {loading ? (
            <div className="afa-empty">Yükleniyor…</div>
          ) : error ? (
            <div className="afa-empty">{error}</div>
          ) : rows.length === 0 ? (
            <div className="afa-empty">Bu filtrelerle öğrenci yok.</div>
          ) : (
            <div className="afa-list">
              {rows.map((row) => (
                <button
                  key={row.student_id}
                  type="button"
                  className={`afa-row afa-row--${row.severity}`}
                  onClick={() => openStudent(row.student_id)}
                >
                  <span className="afa-av">{initials(row.student_name)}</span>
                  <span className="afa-who">
                    <strong>{row.student_name}</strong>
                    <small>{[row.sinif_name || 'Sınıf yok', row.coach_name || 'Koç yok'].join(' · ')}</small>
                  </span>
                  <span className={`afa-today afa-today--${todayTone(row)}`}>{todayLabel(row)}</span>
                  <span className="afa-stat"><b>{row.absent_days}</b> gelmedi</span>
                  <span className="afa-stat"><b>{row.late_days}</b> geç</span>
                  <span className={`afa-pill afa-pill--${row.severity}`}>
                    {severityLabel(row.severity)}
                    {row.consecutive_absent >= 2 ? ` · ${row.consecutive_absent} gün` : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : analysisLoading || !analysis ? (
        <div className="afa-empty">{analysisLoading ? 'Analiz yükleniyor…' : 'Analiz verisi yok.'}</div>
      ) : (
        <>
          <div className="afa-meters">
            <div><b>{analysis.kpis.total_students}</b><span>Öğrenci</span></div>
            <div className="absent"><b>{analysis.kpis.today_absent}</b><span>Bugün gelmedi</span></div>
            <div className="late"><b>{analysis.kpis.today_late}</b><span>Bugün geç</span></div>
            <div><b>{analysis.kpis.total_absent_days}</b><span>Toplam gün</span></div>
            <div><b>{analysis.kpis.attention}</b><span>Dikkat</span></div>
            <div className="alarm"><b>{analysis.kpis.alarm}</b><span>Alarm</span></div>
          </div>
          <div className="afa-split">
            <section>
              <h3>Sınıfa göre</h3>
              {analysis.by_class.map((g) => (
                <div key={g.name} className="afa-group">
                  <div>
                    <strong>{g.name}</strong>
                    <small>{g.students} öğrenci · bugün {g.today_absent} gelmedi</small>
                  </div>
                  <span>{g.absent_days} gün</span>
                </div>
              ))}
            </section>
            <section>
              <h3>Koça göre</h3>
              {analysis.by_coach.map((g) => (
                <div key={g.name} className="afa-group">
                  <div>
                    <strong>{g.name}</strong>
                    <small>{g.students} öğrenci · bugün {g.today_absent} gelmedi</small>
                  </div>
                  <span>{g.absent_days} gün</span>
                </div>
              ))}
            </section>
          </div>
          <div className="afa-split">
            <section>
              <h3>Ardışık gelmeme</h3>
              {analysis.consecutive.length === 0 ? <p className="afa-hint">Ardışık alarm yok.</p> : analysis.consecutive.map((s) => (
                <button key={s.student_id} type="button" className="afa-mini" onClick={() => openStudent(s.student_id)}>
                  <strong>{s.student_name}</strong>
                  <small>{s.consecutive_absent} ardışık · {s.absent_days} toplam</small>
                </button>
              ))}
            </section>
            <section>
              <h3>Yükselenler</h3>
              {analysis.rising.length === 0 ? <p className="afa-hint">Artış yok.</p> : analysis.rising.map((s) => (
                <button key={s.student_id} type="button" className="afa-mini" onClick={() => openStudent(s.student_id)}>
                  <strong>{s.student_name}</strong>
                  <small>Son 7 gün {s.recent_absent} · önceki {s.previous_absent}</small>
                </button>
              ))}
            </section>
          </div>
          <section className="afa-block">
            <h3>En çok devamsızlık</h3>
            {analysis.top_absent.map((s) => (
              <button key={s.student_id} type="button" className="afa-mini" onClick={() => openStudent(s.student_id)}>
                <strong>{s.student_name}</strong>
                <small>{s.absent_days} gün gelmedi · {s.late_days} geç · {s.coach_name || '—'}</small>
              </button>
            ))}
          </section>
        </>
      )}

      {studentId ? (
        <YoklamaStudentDrawer studentId={studentId} date={date} onClose={closeStudent} />
      ) : null}
    </div>
  );
}

export default function AttendanceFollowupAdminPage() {
  return (
    <Suspense fallback={<div className="afa-empty">Yükleniyor…</div>}>
      <AttendanceFollowupAdmin />
    </Suspense>
  );
}
