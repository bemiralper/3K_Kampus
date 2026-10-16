'use client';

import { useEffect, useRef, useState, type WheelEvent } from 'react';
import {
  downloadAttendanceCalendarPdf,
  fetchAttendanceStudentHistory,
  previewAttendanceCalendarNotify,
  sendAttendanceCalendarNotify,
  type AttendanceDayFlag,
  type AttendanceDayMark,
  type AttendanceNotifyRecipient,
  type AttendanceRangeParams,
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

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pdfDefaults(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return { start, end };
  const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
  if (months <= 4) return { start, end };
  const min = new Date(endDate);
  min.setMonth(min.getMonth() - 2);
  min.setDate(1);
  return { start: localISO(min), end };
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

function recipientKey(row: AttendanceNotifyRecipient) {
  if (row.recipient_type === 'ogrenci') return `ogrenci:${row.ogrenci_id}`;
  return `veli:${row.ogrenci_id}:${row.veli_id}`;
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
  rangeParams,
  onClose,
}: {
  studentId: number;
  date: string;
  rangeParams?: AttendanceRangeParams;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [history, setHistory] = useState<AttendanceStudentHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfStart, setPdfStart] = useState(date);
  const [pdfEnd, setPdfEnd] = useState(date);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifySending, setNotifySending] = useState(false);
  const [notifyError, setNotifyError] = useState('');
  const [notifySuccess, setNotifySuccess] = useState('');
  const [recipients, setRecipients] = useState<AttendanceNotifyRecipient[]>([]);
  const [notifyCounts, setNotifyCounts] = useState({ absent: 0, late: 0 });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const notifyOpenRef = useRef(false);
  notifyOpenRef.current = notifyOpen;

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
      if (e.key !== 'Escape') return;
      if (notifyOpenRef.current) {
        setNotifyOpen(false);
        return;
      }
      onClose();
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
    fetchAttendanceStudentHistory(studentId, rangeParams || date)
      .then((res) => {
        const next = res.success && res.data ? res.data : null;
        setHistory(next);
        if (next) {
          const end = next.end_date || date;
          const start = next.start_date || end;
          const bounds = pdfDefaults(start, end);
          setPdfStart(bounds.start);
          setPdfEnd(bounds.end);
        }
      })
      .catch(() => setHistory(null))
      .finally(() => setLoading(false));
  }, [studentId, date, rangeParams]);

  useEffect(() => {
    if (!notifyOpen) return undefined;
    let cancelled = false;
    setNotifyLoading(true);
    setNotifyError('');
    setNotifySuccess('');
    previewAttendanceCalendarNotify(studentId, { start_date: pdfStart, end_date: pdfEnd })
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data) {
          setRecipients([]);
          setNotifyError(res.error || 'Alıcılar yüklenemedi.');
          return;
        }
        setRecipients(res.data.recipients || []);
        setNotifyCounts({
          absent: res.data.gelmedigi_gun_sayisi,
          late: res.data.gec_geldigi_gun_sayisi,
        });
        setExcluded(new Set(
          (res.data.recipients || []).filter((row) => row.skip_reason).map(recipientKey),
        ));
      })
      .catch(() => {
        if (!cancelled) setNotifyError('Alıcılar yüklenemedi.');
      })
      .finally(() => {
        if (!cancelled) setNotifyLoading(false);
      });
    return () => { cancelled = true; };
  }, [notifyOpen, studentId, pdfStart, pdfEnd]);

  const downloadPdf = async () => {
    if (!pdfStart || !pdfEnd) {
      setPdfError('Tarih aralığı seçin.');
      return;
    }
    setPdfBusy(true);
    setPdfError('');
    try {
      await downloadAttendanceCalendarPdf(
        studentId,
        { date: pdfEnd, start_date: pdfStart, end_date: pdfEnd },
        'devamsizlik.pdf',
      );
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF indirilemedi.');
    } finally {
      setPdfBusy(false);
    }
  };

  const sendable = recipients.filter((row) => !row.skip_reason && !excluded.has(recipientKey(row)));

  const toggleRecipient = (row: AttendanceNotifyRecipient) => {
    if (row.skip_reason) return;
    const key = recipientKey(row);
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sendWhatsapp = async () => {
    if (!pdfStart || !pdfEnd || sendable.length === 0) return;
    setNotifySending(true);
    setNotifyError('');
    setNotifySuccess('');
    try {
      const res = await sendAttendanceCalendarNotify(studentId, {
        start_date: pdfStart,
        end_date: pdfEnd,
        veli_ids: sendable
          .filter((row) => row.recipient_type === 'veli' && row.veli_id)
          .map((row) => row.veli_id as number),
        include_student: sendable.some((row) => row.recipient_type === 'ogrenci'),
      });
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Gönderim başarısız.');
      }
      if (res.data.sent === 0) {
        throw new Error(res.data.errors?.[0] || 'Hiçbir alıcıya gönderilemedi.');
      }
      const extra = res.data.skipped > 0 && res.data.errors?.[0] ? ` ${res.data.errors[0]}` : '';
      setNotifySuccess(`${res.data.sent} kişiye WhatsApp ile gönderildi.${extra}`);
    } catch (err) {
      setNotifyError(err instanceof Error ? err.message : 'Gönderim başarısız.');
    } finally {
      setNotifySending(false);
    }
  };

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
                <div><b>{history.excused_days || 0}</b><span>İzinli</span></div>
                <div className="late"><b>{history.late_days}</b><span>Geç</span></div>
                <div><b>{history.exit_days}</b><span>Çıkış</span></div>
                <div><b>{history.consecutive_absent}</b><span>Ardışık</span></div>
              </div>
              <section className="ysd-pdf">
                <div className="ysd-pdf-head">
                  <h3>Takvim PDF</h3>
                </div>
                <div className="ysd-pdf-range">
                  <input type="date" value={pdfStart} aria-label="PDF başlangıç" onChange={(e) => setPdfStart(e.target.value)} />
                  <span>—</span>
                  <input type="date" value={pdfEnd} aria-label="PDF bitiş" onChange={(e) => setPdfEnd(e.target.value)} />
                </div>
                <div className="ysd-pdf-actions">
                  <button type="button" onClick={downloadPdf} disabled={pdfBusy}>
                    {pdfBusy ? 'Hazırlanıyor…' : 'PDF indir'}
                  </button>
                  <button
                    type="button"
                    className="ysd-wa-open"
                    onClick={() => setNotifyOpen((open) => !open)}
                    aria-expanded={notifyOpen}
                  >
                    WhatsApp
                  </button>
                </div>
                <p className="ysd-pdf-hint">Seçilen aylar takvim olur. Gelmediği ve geç kaldığı günler o güne yazılır.</p>
                {pdfError ? <p className="ysd-pdf-error">{pdfError}</p> : null}
                {notifyOpen ? (
                  <div className="ysd-wa">
                    {notifyLoading ? <p className="ysd-pdf-hint">Alıcılar yükleniyor…</p> : null}
                    {notifySuccess ? <p className="ysd-wa-ok">{notifySuccess}</p> : null}
                    {notifyError ? <p className="ysd-pdf-error">{notifyError}</p> : null}
                    {!notifyLoading && !notifySuccess ? (
                      <>
                        <p className="ysd-pdf-hint">
                          {notifyCounts.late} geç · {notifyCounts.absent} gelmedi. Ayrıntı ekteki PDF’te.
                        </p>
                        {recipients.map((row) => {
                          const key = recipientKey(row);
                          const checked = !row.skip_reason && !excluded.has(key);
                          return (
                            <label key={key} className={`ysd-wa-person${row.skip_reason ? ' is-skipped' : ''}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={Boolean(row.skip_reason) || notifySending}
                                onChange={() => toggleRecipient(row)}
                              />
                              <span>
                                <strong>
                                  {row.recipient_type === 'veli' ? 'Veli' : 'Öğrenci'}
                                  {row.display_name ? ` · ${row.display_name}` : ''}
                                </strong>
                                <small>
                                  {row.skip_reason || row.telefon || 'Telefon yok'}
                                </small>
                                {row.body ? <span className="ysd-wa-body">{row.body}</span> : null}
                              </span>
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          className="ysd-wa-send"
                          onClick={sendWhatsapp}
                          disabled={notifySending || sendable.length === 0}
                        >
                          {notifySending ? 'Gönderiliyor…' : `WhatsApp ile gönder (${sendable.length})`}
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>
              <div className="ysd-meta">
                <span className={`ysd-pill ysd-pill--${history.severity}`}>{severityLabel(history.severity)}</span>
                {history.last_absent_date ? <span>Son devamsızlık: {dayParts(history.last_absent_date).date}</span> : null}
                {history.absent_sources?.length ? <span>{history.absent_sources.join(', ')}</span> : null}
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
