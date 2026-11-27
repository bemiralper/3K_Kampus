'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  ShieldAlert,
  UserCheck,
  X,
} from 'lucide-react';
import {
  studentPortalApi,
  type CampusLifeResponse,
  type ScheduleDay,
  type ScheduleItem,
  type UnifiedScheduleResponse,
} from '@/lib/student-portal-api';

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeekMonday(base: Date): Date {
  const copy = new Date(base);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(base: Date, delta: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

export default function StudentScheduleAndAttendancePage() {
  const [tab, setTab] = useState<'hafta' | 'ay' | 'yoklama'>('hafta');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [selectedDayIso, setSelectedDayIso] = useState<string>(() => isoOf(new Date()));
  const [schedule, setSchedule] = useState<UnifiedScheduleResponse | null>(null);
  const [campus, setCampus] = useState<CampusLifeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<(ScheduleItem & { date: string }) | null>(null);

  const range = useMemo(() => {
    if (tab === 'ay') {
      const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const gridStart = startOfWeekMonday(first);
      const gridEnd = addDays(gridStart, 34);
      return { start: isoOf(gridStart), end: isoOf(gridEnd) };
    }
    const mon = startOfWeekMonday(anchorDate);
    return { start: isoOf(mon), end: isoOf(addDays(mon, 6)) };
  }, [anchorDate, tab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [schedData, campusData] = await Promise.all([
        studentPortalApi.schedule(range.start, range.end),
        studentPortalApi.campus(),
      ]);
      setSchedule(schedData);
      setCampus(campusData);
      if (schedData.days.length > 0) {
        const hasCurrent = schedData.days.some((d) => d.date === selectedDayIso);
        if (!hasCurrent) {
          const todayMatch = schedData.days.find((d) => d.is_today);
          setSelectedDayIso((todayMatch || schedData.days[0]).date);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [range.end, range.start, selectedDayIso]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedDay: ScheduleDay | null = useMemo(() => {
    if (!schedule) return null;
    return schedule.days.find((d) => d.date === selectedDayIso) || schedule.days[0] || null;
  }, [schedule, selectedDayIso]);

  const shiftPeriod = (dir: -1 | 1) => {
    if (tab === 'ay') {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1));
    } else {
      setAnchorDate(addDays(anchorDate, dir * 7));
    }
  };

  return (
    <>
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="sp-eyebrow">Akademik & Birebir Ajanda</span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Birleşik Takvim & Devamsızlık
            </h1>
          </div>

          <div className="sp-pill-bar">
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'hafta' ? '1' : '0'}
              onClick={() => setTab('hafta')}
            >
              Haftalık Akış
            </button>
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'ay' ? '1' : '0'}
              onClick={() => setTab('ay')}
            >
              Aylık Matris
            </button>
            <button
              type="button"
              className="sp-pill"
              data-active={tab === 'yoklama' ? '1' : '0'}
              onClick={() => setTab('yoklama')}
            >
              Yoklama & Devamsızlık
            </button>
          </div>
        </div>

        {tab !== 'yoklama' ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={() => shiftPeriod(-1)}
                aria-label="Önceki dönem"
              >
                <ChevronLeft size={16} />
              </button>
              <strong style={{ fontSize: 14 }}>
                {range.start} — {range.end}
              </strong>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={() => shiftPeriod(1)}
                aria-label="Sonraki dönem"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {schedule?.classroom ? (
                <span className="sp-chip sp-chip-accent">
                  Sınıf: {schedule.classroom.name}
                </span>
              ) : null}
              <button
                type="button"
                className="sp-btn sp-btn-secondary sp-btn-sm"
                onClick={() => {
                  const now = new Date();
                  setAnchorDate(now);
                  setSelectedDayIso(isoOf(now));
                }}
              >
                Bugüne Dön
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="sp-skeleton" style={{ height: 320 }} />
      ) : tab === 'yoklama' && campus ? (
        <div className="sp-bento-grid">
          <section className="sp-card sp-col-4">
            <span className="sp-eyebrow">Katılım Halkası</span>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '18px 0 8px',
                gap: 12,
              }}
            >
              <svg width="150" height="150" viewBox="0 0 150 150">
                <circle
                  cx="75"
                  cy="75"
                  r="60"
                  fill="none"
                  stroke="var(--sp-border-strong)"
                  strokeWidth="12"
                />
                <circle
                  cx="75"
                  cy="75"
                  r="60"
                  fill="none"
                  stroke="var(--sp-emerald)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${(campus.attendance.rate_percent / 100) * 377} 377`}
                  transform="rotate(-90 75 75)"
                />
                <text
                  x="75"
                  y="73"
                  textAnchor="middle"
                  fill="var(--sp-ink)"
                  fontSize="26"
                  fontWeight="800"
                >
                  %{campus.attendance.rate_percent}
                </text>
                <text
                  x="75"
                  y="95"
                  textAnchor="middle"
                  fill="var(--sp-muted)"
                  fontSize="11.5"
                >
                  Devam Oranı
                </text>
              </svg>

              <div
                className="sp-kpi-grid"
                style={{ width: '100%', gridTemplateColumns: 'repeat(2, 1fr)' }}
              >
                <div className="sp-kpi-box">
                  <span>Katıldı</span>
                  <strong style={{ color: 'var(--sp-emerald)' }}>
                    {campus.attendance.present_count}
                  </strong>
                </div>
                <div className="sp-kpi-box">
                  <span>Gelmedi</span>
                  <strong style={{ color: 'var(--sp-danger)' }}>
                    {campus.attendance.absent_count}
                  </strong>
                </div>
                <div className="sp-kpi-box">
                  <span>Geç Kaldı</span>
                  <strong style={{ color: 'var(--sp-warm)' }}>
                    {campus.attendance.late_count}
                  </strong>
                </div>
                <div className="sp-kpi-box">
                  <span>İzinli / Raporlu</span>
                  <strong>{campus.attendance.excused_count}</strong>
                </div>
              </div>
            </div>
          </section>

          <section className="sp-card sp-col-8">
            <div className="sp-card-header">
              <div>
                <span className="sp-eyebrow">Grup Dersi · Özel Ders · Etüt</span>
                <h2>Yoklama Geçmişi</h2>
              </div>
            </div>

            {campus.attendance.history.length === 0 ? (
              <div className="sp-empty-box">
                <UserCheck size={28} />
                <p>Henüz kaydedilmiş yoklama satırı bulunmuyor.</p>
              </div>
            ) : (
              <div className="sp-stack">
                {campus.attendance.history.map((row) => (
                  <div key={row.id} className="sp-row-card">
                    <div className="sp-row-left">
                      <div className="sp-time-pill">{row.date.slice(5)}</div>
                      <div className="sp-row-copy">
                        <strong>{row.title}</strong>
                        <span>
                          {row.kind_label}
                          {row.period_label ? ` · ${row.period_label}` : ''}
                        </span>
                      </div>
                    </div>
                    <span
                      className={`sp-chip ${
                        row.tone === 'ok'
                          ? 'sp-chip-emerald'
                          : row.tone === 'danger'
                            ? 'sp-chip-danger'
                            : row.tone === 'warn'
                              ? 'sp-chip-warm'
                              : ''
                      }`}
                    >
                      {row.status_label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : schedule ? (
        <>
          {/* Gün Seçim Şeridi / Aylık Nokta Matrisi */}
          <div
            className="sp-card"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {schedule.days.map((day) => {
              const selected = day.date === selectedDay?.date;
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedDayIso(day.date)}
                  style={{
                    padding: '10px 6px',
                    borderRadius: 14,
                    border: selected
                      ? '2px solid var(--sp-accent)'
                      : '1px solid var(--sp-border)',
                    background: selected
                      ? 'var(--sp-accent-soft)'
                      : day.is_holiday
                        ? 'var(--sp-danger-soft)'
                        : 'var(--sp-surface-2)',
                    color: 'var(--sp-ink)',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11,
                      color: 'var(--sp-muted)',
                      fontWeight: 600,
                    }}
                  >
                    {day.day_label.slice(0, 3)}
                  </span>
                  <strong style={{ display: 'block', fontSize: 16, marginTop: 2 }}>
                    {day.date.slice(8)}
                  </strong>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 3,
                      marginTop: 5,
                      minHeight: 7,
                    }}
                  >
                    {day.items.slice(0, 4).map((it) => (
                      <span
                        key={it.id}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 99,
                          backgroundColor: it.color,
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Seçili Günün Birleşik Çizelgesi */}
          {selectedDay ? (
            <section className="sp-card">
              <div className="sp-card-header">
                <div>
                  <span className="sp-eyebrow">{selectedDay.date}</span>
                  <h2>
                    {selectedDay.day_label} Programı ({selectedDay.items.length} kayıt)
                  </h2>
                </div>
                {selectedDay.is_holiday ? (
                  <span className="sp-chip sp-chip-danger">
                    <ShieldAlert size={13} /> Resmi Tatil
                  </span>
                ) : null}
              </div>

              {selectedDay.items.length === 0 ? (
                <div className="sp-empty-box">
                  <CalendarDays size={28} />
                  <p>Bu tarihte ders, özel ders veya sınav oturumu bulunmuyor.</p>
                </div>
              ) : (
                <div className="sp-stack">
                  {selectedDay.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="sp-row-card"
                      data-live={item.state === 'live' ? '1' : '0'}
                      onClick={() =>
                        setActiveItem({ ...item, date: selectedDay.date })
                      }
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="sp-row-left">
                        <div className="sp-time-pill">
                          {item.all_day
                            ? 'Tüm Gün'
                            : `${item.start_time}${item.end_time ? `\n${item.end_time}` : ''}`}
                        </div>
                        <span
                          className="sp-dot"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="sp-row-copy">
                          <strong>{item.title}</strong>
                          <span>
                            {item.subtitle}
                            {item.teacher_name ? ` · ${item.teacher_name}` : ''}
                            {item.room_name ? ` · ${item.room_name}` : ''}
                            {item.seat_no ? ` · Sıra #${item.seat_no}` : ''}
                          </span>
                          {item.covered_topic ? (
                            <span style={{ color: 'var(--sp-accent)', marginTop: 2 }}>
                              İşlenen Konu: {item.covered_topic}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <span className="sp-chip">Detay</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {/* Ders / Sınav Detay Çekmecesi */}
      {activeItem ? (
        <div
          className="sp-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveItem(null);
          }}
        >
          <div className="sp-modal-sheet">
            <div className="sp-card-header">
              <span className="sp-chip sp-chip-accent">{activeItem.subtitle}</span>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={() => setActiveItem(null)}
              >
                <X size={16} />
              </button>
            </div>
            <h2 style={{ marginTop: 0 }}>{activeItem.title}</h2>
            <div className="sp-stack" style={{ marginTop: 12 }}>
              <div className="sp-row-card">
                <div className="sp-row-left">
                  <Clock size={17} color="var(--sp-accent)" />
                  <div className="sp-row-copy">
                    <strong>Tarih & Saat</strong>
                    <span>
                      {activeItem.date} ·{' '}
                      {activeItem.all_day
                        ? 'Tüm Gün'
                        : `${activeItem.start_time} – ${activeItem.end_time || ''}`}
                    </span>
                  </div>
                </div>
              </div>

              {activeItem.teacher_name || activeItem.room_name ? (
                <div className="sp-row-card">
                  <div className="sp-row-left">
                    <MapPin size={17} color="var(--sp-warm)" />
                    <div className="sp-row-copy">
                      <strong>Öğretmen & Derslik / Salon</strong>
                      <span>
                        {activeItem.teacher_name || '—'} ·{' '}
                        {activeItem.room_name || 'Belirtilmedi'}
                        {activeItem.seat_no ? ` · Sıra #${activeItem.seat_no}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {activeItem.covered_topic ? (
                <div className="sp-row-card">
                  <div className="sp-row-copy">
                    <strong>Bu Derste İşlenen Konu</strong>
                    <span>{activeItem.covered_topic}</span>
                  </div>
                </div>
              ) : null}
            </div>

            {activeItem.exam_id ? (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Link
                  href={`/ogrenci/sinavlar?exam=${activeItem.exam_id}`}
                  className="sp-btn sp-btn-primary"
                  onClick={() => setActiveItem(null)}
                >
                  Sınav Analizini Gör
                </Link>
              </div>
            ) : activeItem.assignment_id ? (
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Link
                  href={`/ogrenci/calisma?tab=odevler&assignment=${activeItem.assignment_id}`}
                  className="sp-btn sp-btn-primary"
                  onClick={() => setActiveItem(null)}
                >
                  Ödev İçeriğini Aç
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
