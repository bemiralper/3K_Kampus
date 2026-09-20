'use client';

import { useEffect, useRef, useState, type WheelEvent } from 'react';
import {
  fetchAttendanceStudentHistory,
  type AttendanceDayFlag,
  type AttendanceDayMark,
  type AttendanceStudentHistory,
} from '@/lib/coaching-api';
import './yoklama-student-drawer.css';

function severityLabel(severity: string) {
  if (severity === 'alarm') return 'Alarm';
  if (severity === 'attention') return 'Dikkat';
  return 'Takip';
}

function capitalizeTr(value: string) {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('tr-TR') + value.slice(1);
}

function dayParts(iso: string) {
  try {
    const d = new Date(`${iso}T00:00:00`);
    return {
      weekday: capitalizeTr(d.toLocaleDateString('tr-TR', { weekday: 'long' })),
      date: d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }),
    };
  } catch {
    return { weekday: '', date: iso };
  }
}

function statusText(day: AttendanceDayFlag) {
  if (day.absent) return 'Gelmedi';
  if (day.late) return day.exit ? 'Geç · Çıkış' : 'Geç';
  if (day.exit) return 'Çıkış';
  if (day.attended) return 'Geldi';
  if (day.excused) return 'İzinli';
  return 'Kayıt';
}

function tone(day: AttendanceDayFlag) {
  if (day.absent) return 'absent';
  if (day.late) return 'late';
  if (day.exit) return 'exit';
  if (day.attended) return 'present';
  return '';
}

function markLabel(mark: AttendanceDayMark) {
  if (mark.source === 'library') {
    return mark.period_label ? `Kütüphane · ${mark.period_label}` : 'Kütüphane';
  }
  return 'Sınıf';
}

function visibleMarks(day: AttendanceDayFlag) {
  const seen = new Set<string>();
  const rows: AttendanceDayMark[] = [];
  for (const mark of day.marks || []) {
    const key = `${mark.source}:${mark.period || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(mark);
  }
  return rows;
}

export default function YoklamaStudentDrawer({
  studentId,
  date,
  onClose,
}: {
  studentId: number;
  date: string;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [history, setHistory] = useState<AttendanceStudentHistory | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    const locked = [html, document.body];
    document.querySelectorAll('.app-main, .app-content, .coach-main, .coach-content').forEach((el) => {
      locked.push(el as HTMLElement);
    });
    const prev = locked.map((el) => (el as HTMLElement).style.overflow);
    html.classList.add('ysd-lock');
    locked.forEach((el) => {
      (el as HTMLElement).style.overflow = 'hidden';
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      html.classList.remove('ysd-lock');
      locked.forEach((el, i) => {
        (el as HTMLElement).style.overflow = prev[i];
      });
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    setLoading(true);
    fetchAttendanceStudentHistory(studentId, date)
      .then((res) => setHistory(res.success && res.data ? res.data : null))
      .catch(() => setHistory(null))
      .finally(() => setLoading(false));
  }, [studentId, date]);

  return (
    <div className="ysd" role="dialog" aria-modal="true" aria-labelledby="ysd-title">
      <button type="button" className="ysd-back" aria-label="Kapat" onClick={onClose} />
      <aside
        className="ysd-panel"
        onWheel={(e: WheelEvent<HTMLElement>) => e.stopPropagation()}
      >
        <header className="ysd-head">
          <button type="button" className="ysd-x" onClick={onClose}>Kapat</button>
          <h2 id="ysd-title">{history?.student_name || 'Öğrenci'}</h2>
          <p>{history?.sinif_name || 'Sınıf yok'} · {history?.coach_name || 'Koç yok'}</p>
        </header>
        <div
          ref={bodyRef}
          className="ysd-body"
          onWheel={(e) => {
            const el = bodyRef.current;
            if (!el) return;
            const atTop = el.scrollTop <= 0 && e.deltaY < 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1 && e.deltaY > 0;
            if (atTop || atBottom) e.preventDefault();
            e.stopPropagation();
          }}
        >
          {loading ? (
            <p className="ysd-hint">Yükleniyor…</p>
          ) : !history ? (
            <p className="ysd-hint">Öğrenci geçmişi bulunamadı.</p>
          ) : (
            <>
              <div className="ysd-meters">
                <div className="absent"><b>{history.absent_days}</b><span>Gelmedi</span></div>
                <div className="late"><b>{history.late_days}</b><span>Geç</span></div>
                <div><b>{history.exit_days}</b><span>Çıkış</span></div>
                <div><b>{history.consecutive_absent}</b><span>Ardışık</span></div>
              </div>
              <div className="ysd-meta">
                <span className={`ysd-pill ysd-pill--${history.severity}`}>{severityLabel(history.severity)}</span>
                {history.threshold_label ? <span>{history.threshold_label}</span> : null}
                {history.recommended_action ? <span>{history.recommended_action}</span> : null}
              </div>
              <h3>Gün gün</h3>
              <div className="ysd-cal">
                {[...history.days].reverse().map((day) => {
                  const parts = dayParts(day.date);
                  const marks = visibleMarks(day);
                  return (
                    <div key={day.date} className={`ysd-cal-row${tone(day) ? ` is-${tone(day)}` : ''}`}>
                      <span className="ysd-cal-when">
                        <strong>{parts.weekday || parts.date}</strong>
                        {parts.weekday ? <small>{parts.date}</small> : null}
                      </span>
                      <span className="ysd-cal-right">
                        <span className="ysd-cal-status">{statusText(day)}</span>
                        {marks.length ? (
                          <span className="ysd-marks">
                            {marks.map((mark) => (
                              <span
                                key={`${day.date}-${mark.source}-${mark.period || 'x'}`}
                                className={`ysd-mark is-${mark.source === 'library' ? 'library' : 'class'}`}
                              >
                                {markLabel(mark)}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
