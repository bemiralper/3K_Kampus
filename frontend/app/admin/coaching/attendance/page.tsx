'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  fetchAttendanceFollowup,
  fetchAttendanceFollowupAnalysis,
  type AttendanceAnalysisPayload,
  type AttendanceFollowupPayload,
  type AttendanceFollowupStudent,
  type AttendanceRangeParams,
} from '@/lib/coaching-api';
import YoklamaStudentDrawer from '@/components/gorev/YoklamaStudentDrawer';
import './attendance-followup-admin.css';

type Tab = 'ozet' | 'ogrenciler' | 'tekrarlayan' | 'takip';
type RangePreset = 'today' | 'week' | 'month' | 'term' | 'all' | 'custom';
type FrequencyFilter = '' | 'tek_seferlik' | 'tekrarlayan' | 'art_arda';
type FollowupFilter = '' | 'normal' | 'takip' | 'incelenecek';
type FocusFilter = '' | 'absent' | 'late';
const EMPTY_OPTION = '__none__';

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO() {
  return localISO(new Date());
}

function shiftISO(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localISO(d);
}

function monthStart(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(1);
  return localISO(d);
}

function formatShort(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

function formatRange(start?: string, end?: string) {
  if (!start && !end) return 'Seçili aralık';
  if (start && end && start !== end) return `${formatShort(start)} - ${formatShort(end)}`;
  return formatShort(end || start);
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
  return 'Normal';
}

function frequencyLabel(value?: string) {
  if (value === 'art_arda') return 'Art arda';
  if (value === 'tekrarlayan') return 'Tekrarlayan';
  if (value === 'tek_seferlik') return 'Tek seferlik';
  return 'Normal';
}

function followupLabel(value?: string) {
  if (value === 'incelenecek') return 'İncelenecek';
  if (value === 'takip') return 'Takipte';
  return 'Takip gerekmez';
}

function todayLabel(row: AttendanceFollowupStudent) {
  if (row.today_absent) return 'Bugün gelmedi';
  if (row.today_late) return row.today_exit ? 'Bugün geç / çıkış' : 'Bugün geç';
  if (row.today_exit) return 'Bugün çıkış';
  if (row.today_status === 'PRESENT') return 'Bugün geldi';
  if (row.today_status === 'EXCUSED') return 'Bugün izinli';
  return 'Bugün kayıt yok';
}

function AttendanceFollowupAdmin() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const basePath = pathname.startsWith('/coach')
    ? '/coach/yoklama-takibi'
    : '/admin/coaching/attendance';
  const [tab, setTab] = useState<Tab>((searchParams.get('tab') as Tab) || 'ozet');
  const [date, setDate] = useState(searchParams.get('date') || todayISO());
  const [range, setRange] = useState<RangePreset>((searchParams.get('range') as RangePreset) || 'week');
  const [startDate, setStartDate] = useState(searchParams.get('start_date') || shiftISO(todayISO(), -6));
  const [endDate, setEndDate] = useState(searchParams.get('end_date') || todayISO());
  const [search, setSearch] = useState('');
  const [coachId, setCoachId] = useState(searchParams.get('coach') || '');
  const [classId, setClassId] = useState(searchParams.get('class') || '');
  const [frequency, setFrequency] = useState<FrequencyFilter>('');
  const [followup, setFollowup] = useState<FollowupFilter>('');
  const [focus, setFocus] = useState<FocusFilter>('');
  const requestSeq = useRef(0);
  const [data, setData] = useState<AttendanceFollowupPayload | null>(null);
  const [analysis, setAnalysis] = useState<AttendanceAnalysisPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentId, setStudentId] = useState(Number(searchParams.get('student') || 0) || null);

  const rangeParams = useMemo<AttendanceRangeParams>(() => {
    if (range === 'today') return { date, range: 'today', start_date: date, end_date: date };
    if (range === 'week') return { date, range: 'week', start_date: shiftISO(date, -6), end_date: date };
    if (range === 'month') return { date, range: 'month', start_date: monthStart(date), end_date: date };
    if (range === 'all') return { date, range: 'all' };
    if (range === 'custom') return { date: endDate || date, range: 'custom', start_date: startDate, end_date: endDate };
    return { date, range: 'term' };
  }, [date, endDate, range, startDate]);

  const syncUrl = useCallback((next: {
    tab?: Tab;
    date?: string;
    range?: RangePreset;
    start?: string;
    end?: string;
    student?: number | null;
    coach?: string;
    classId?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextTab = next.tab ?? tab;
    const nextDate = next.date ?? date;
    const nextRange = next.range ?? range;
    const nextStart = next.start ?? startDate;
    const nextEnd = next.end ?? endDate;
    const nextStudent = next.student === undefined ? studentId : next.student;
    const nextCoach = next.coach === undefined ? coachId : next.coach;
    const nextClass = next.classId === undefined ? classId : next.classId;
    if (nextTab && nextTab !== 'ozet') params.set('tab', nextTab);
    else params.delete('tab');
    params.set('date', nextDate);
    params.set('range', nextRange);
    if (nextRange === 'custom') {
      params.set('start_date', nextStart);
      params.set('end_date', nextEnd);
    } else {
      params.delete('start_date');
      params.delete('end_date');
    }
    if (nextStudent) params.set('student', String(nextStudent));
    else params.delete('student');
    if (nextCoach) params.set('coach', nextCoach);
    else params.delete('coach');
    if (nextClass) params.set('class', nextClass);
    else params.delete('class');
    router.replace(`${basePath}?${params.toString()}`, { scroll: false });
  }, [basePath, classId, coachId, date, endDate, range, router, searchParams, startDate, studentId, tab]);

  const load = useCallback(async (params: AttendanceRangeParams) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError('');
    try {
      const [listRes, analysisRes] = await Promise.all([
        fetchAttendanceFollowup(params),
        fetchAttendanceFollowupAnalysis(params),
      ]);
      if (seq !== requestSeq.current) return;
      if (listRes.success && listRes.data) setData(listRes.data);
      else {
        setData(null);
        setError(listRes.error || 'Devamsızlık listesi yüklenemedi.');
      }
      setAnalysis(analysisRes.success && analysisRes.data ? analysisRes.data : null);
    } catch {
      if (seq !== requestSeq.current) return;
      setData(null);
      setAnalysis(null);
      setError('Devamsızlık listesi yüklenemedi.');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(rangeParams);
  }, [load, rangeParams]);

  const changeDate = (next: string) => {
    setDate(next);
    if (range === 'week') {
      setStartDate(shiftISO(next, -6));
      setEndDate(next);
    } else if (range === 'month') {
      setStartDate(monthStart(next));
      setEndDate(next);
    }
    syncUrl({ date: next });
  };

  const changeRange = (next: RangePreset) => {
    setRange(next);
    if (next === 'week') {
      setStartDate(shiftISO(date, -6));
      setEndDate(date);
    } else if (next === 'month') {
      setStartDate(monthStart(date));
      setEndDate(date);
    } else if (next === 'today') {
      setStartDate(date);
      setEndDate(date);
    }
    syncUrl({ range: next });
  };

  const openStudent = (id: number) => {
    setStudentId(id);
    syncUrl({ student: id });
  };

  const closeStudent = () => {
    setStudentId(null);
    syncUrl({ student: null });
  };

  const clearListFilters = () => {
    setFrequency('');
    setFollowup('');
    setFocus('');
  };

  const showTab = (next: Tab) => {
    setTab(next);
    clearListFilters();
    syncUrl({ tab: next });
  };

  const showStudents = (nextFocus: FocusFilter) => {
    setTab('ogrenciler');
    setFrequency('');
    setFollowup('');
    setFocus(nextFocus);
    syncUrl({ tab: 'ogrenciler' });
  };

  const optionId = (kind: 'classes' | 'coaches', name: string) => {
    const found = (data?.filters?.[kind] || []).find(
      (item) => item.name.localeCompare(name, 'tr', { sensitivity: 'accent' }) === 0,
    );
    return found ? String(found.id) : '';
  };

  const openClass = (name: string) => {
    const id = optionId('classes', name) || (name === 'Sınıf yok' ? EMPTY_OPTION : '');
    setClassId(id);
    setCoachId('');
    setTab('ogrenciler');
    clearListFilters();
    syncUrl({ tab: 'ogrenciler', classId: id, coach: '' });
  };

  const openCoach = (name: string) => {
    const id = optionId('coaches', name) || (name === 'Koç yok' ? EMPTY_OPTION : '');
    setCoachId(id);
    setClassId('');
    setTab('takip');
    clearListFilters();
    syncUrl({ tab: 'takip', coach: id, classId: '' });
  };

  const rows = useMemo(() => {
    const all = data?.students || [];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return all.filter((row) => {
      if (coachId === EMPTY_OPTION ? row.coach_id : coachId && String(row.coach_id || '') !== coachId) return false;
      if (classId === EMPTY_OPTION ? row.sinif_id : classId && String(row.sinif_id || '') !== classId) return false;
      if (focus === 'absent' && !row.absent_days) return false;
      if (focus === 'late' && !row.late_days) return false;
      if (frequency && row.frequency !== frequency) return false;
      if (followup && row.followup_status !== followup) return false;
      if (tab === 'tekrarlayan' && !['tekrarlayan', 'art_arda'].includes(row.frequency || '')) return false;
      if (tab === 'takip' && row.followup_status === 'normal') return false;
      if (q) {
        const hay = `${row.student_name} ${row.sinif_name || ''} ${row.coach_name || ''}`.toLocaleLowerCase('tr-TR');
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classId, coachId, data, focus, followup, frequency, search, tab]);

  const counts = data?.range_counts;
  const visibleStart = data?.start_date || rangeParams.start_date || date;
  const visibleEnd = data?.end_date || rangeParams.end_date || date;

  return (
    <div className="afa-page">
      <header className="afa-hero afa-hero--glass">
        <div>
          <p className="afa-kicker">Koçluk · Takip</p>
          <h1>Devamsızlık Takibi</h1>
          <p className="afa-lead">
            Alınmış yoklamalardan öğrenci devamsızlık geçmişini, tekrarları ve koçluk takip ihtiyacını izleyin.
          </p>
        </div>
        <div className="afa-range-summary">
          <span>Aralık</span>
          <strong>{formatRange(visibleStart, visibleEnd)}</strong>
        </div>
      </header>

      <section className="afa-toolbar">
        <div className="afa-date">
          <button type="button" onClick={() => changeDate(shiftISO(date, -1))} aria-label="Önceki gün">‹</button>
          <label>
            <span className="afa-sr">Bitiş tarihi</span>
            <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
          </label>
          <button type="button" onClick={() => changeDate(shiftISO(date, 1))} aria-label="Sonraki gün">›</button>
        </div>
        <div className="afa-preset" aria-label="Tarih aralığı">
          {([
            ['today', 'Bugün'],
            ['week', 'Bu hafta'],
            ['month', 'Bu ay'],
            ['term', 'Dönem'],
            ['all', 'Tüm zaman'],
            ['custom', 'Özel'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={range === value ? 'on' : ''}
              onClick={() => changeRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' ? (
          <div className="afa-custom-range">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                syncUrl({ start: e.target.value, range: 'custom' });
              }}
            />
            <span>—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDate(e.target.value);
                syncUrl({ end: e.target.value, date: e.target.value, range: 'custom' });
              }}
            />
          </div>
        ) : null}
      </section>

      <section className="afa-kpis">
        <button type="button" className={tab === 'ogrenciler' && !focus && !frequency && !followup ? 'on' : ''} onClick={() => showStudents('')}>
          <span>Öğrenci</span>
          <b>{counts?.total_students ?? 0}</b>
          <small>takip havuzu</small>
        </button>
        <button type="button" className={`absent${focus === 'absent' ? ' on' : ''}`} onClick={() => showStudents('absent')}>
          <span>Devamsızlığı olan</span>
          <b>{counts?.absent_students ?? 0}</b>
          <small>{counts?.total_absent_days ?? 0} devamsızlık günü</small>
        </button>
        <button type="button" className={`late${focus === 'late' ? ' on' : ''}`} onClick={() => showStudents('late')}>
          <span>Geç kalan</span>
          <b>{counts?.late_students ?? 0}</b>
          <small>{counts?.total_late_days ?? 0} geç kalma</small>
        </button>
        <button type="button" className={`warn${tab === 'tekrarlayan' && !frequency ? ' on' : ''}`} onClick={() => showTab('tekrarlayan')}>
          <span>Tekrarlayan</span>
          <b>{counts?.repeated_absent ?? 0}</b>
          <small>art arda veya tekrar</small>
        </button>
        <button type="button" className={`alarm${tab === 'takip' && !followup ? ' on' : ''}`} onClick={() => showTab('takip')}>
          <span>Takip bekleyen</span>
          <b>{counts?.followup_pending ?? 0}</b>
          <small>{counts?.alarm ?? 0} alarm</small>
        </button>
      </section>

      <section className="afa-filters">
        <div className="afa-tabs" role="tablist">
          {([
            ['ozet', 'Özet'],
            ['ogrenciler', 'Öğrenciler'],
            ['tekrarlayan', 'Tekrarlayanlar'],
            ['takip', 'Takip'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={tab === value ? 'on' : ''} onClick={() => showTab(value)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="afa-search"
          type="search"
          placeholder="Öğrenci, sınıf, koç ara"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={coachId} onChange={(e) => { setCoachId(e.target.value); syncUrl({ coach: e.target.value }); }}>
          <option value="">Koç: tümü</option>
          <option value={EMPTY_OPTION}>Koç yok</option>
          {(data?.filters?.coaches || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={classId} onChange={(e) => { setClassId(e.target.value); syncUrl({ classId: e.target.value }); }}>
          <option value="">Sınıf: tümü</option>
          <option value={EMPTY_OPTION}>Sınıf yok</option>
          {(data?.filters?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as FrequencyFilter)}>
          <option value="">Sıklık: tümü</option>
          <option value="tek_seferlik">Tek seferlik</option>
          <option value="tekrarlayan">Tekrarlayan</option>
          <option value="art_arda">Art arda</option>
        </select>
        <select value={followup} onChange={(e) => setFollowup(e.target.value as FollowupFilter)}>
          <option value="">Takip: tümü</option>
          <option value="normal">Takip gerekmez</option>
          <option value="takip">Takipte</option>
          <option value="incelenecek">İncelenecek</option>
        </select>
      </section>

      {loading ? (
        <div className="afa-empty">Devamsızlık verisi yükleniyor…</div>
      ) : error ? (
        <div className="afa-empty">{error}</div>
      ) : tab === 'ozet' ? (
        <div className="afa-dashboard">
          <section className="afa-card">
            <h3>Sınıfa göre devamsızlık</h3>
            {(analysis?.by_class || []).slice(0, 8).map((g) => (
              <button key={g.name} type="button" className="afa-group" onClick={() => openClass(g.name)}>
                <div>
                  <strong>{g.name}</strong>
                  <small>{g.students} öğrenci · {g.late_days} geç kalma</small>
                </div>
                <span>{g.absent_days} gün</span>
              </button>
            ))}
            {!analysis?.by_class?.length ? <p className="afa-hint">Bu aralıkta devamsızlık verisi yok.</p> : null}
          </section>
          <section className="afa-card">
            <h3>Koça göre takip yükü</h3>
            {(analysis?.by_coach || []).slice(0, 8).map((g) => (
              <button key={g.name} type="button" className="afa-group" onClick={() => openCoach(g.name)}>
                <div>
                  <strong>{g.name}</strong>
                  <small>{g.alarm} alarm · {g.attention} dikkat</small>
                </div>
                <span>{g.absent_days} gün</span>
              </button>
            ))}
            {!analysis?.by_coach?.length ? <p className="afa-hint">Koç kırılımı yok.</p> : null}
          </section>
          <section className="afa-card afa-card--wide">
            <h3>Öne çıkan öğrenciler</h3>
            <div className="afa-mini-grid">
              {(analysis?.top_absent || []).slice(0, 10).map((s) => (
                <button key={s.student_id} type="button" className="afa-mini" onClick={() => openStudent(s.student_id)}>
                  <strong>{s.student_name}</strong>
                  <small>{s.absent_days} devamsızlık · {s.late_days} geç · {s.coach_name || 'Koç yok'}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : rows.length === 0 ? (
        <div className="afa-empty">Bu filtrelerle öğrenci bulunamadı.</div>
      ) : (
        <section className="afa-table-card">
          <div className="afa-table-head">
            <span />
            <span>Öğrenci</span>
            <span>Devamsızlık</span>
            <span>Son kayıt</span>
            <span>Sıklık</span>
            <span>Takip</span>
          </div>
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
                <span className="afa-stack afa-stack--count">
                  <b>{row.absent_days}</b>
                  <small>{row.excused_days ? `${row.excused_days} izinli · ` : ''}{row.late_days} geç</small>
                </span>
                <span className="afa-stack afa-stack--last">
                  <b>{formatShort(row.last_absent_date)}</b>
                  <small>{row.absent_sources?.join(', ') || todayLabel(row)}</small>
                </span>
                <span className={`afa-pill afa-pill--freq is-${row.frequency || 'normal'}`}>{frequencyLabel(row.frequency)}</span>
                <span className={`afa-pill afa-pill--status afa-pill--${row.severity}`}>{followupLabel(row.followup_status)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {studentId ? (
        <YoklamaStudentDrawer
          studentId={studentId}
          date={date}
          rangeParams={rangeParams}
          onClose={closeStudent}
        />
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
