'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAttendanceFollowup,
  type AttendanceFollowupPayload,
  type AttendanceFollowupStudent,
} from '@/lib/coaching-api';
import YoklamaStudentDrawer from './YoklamaStudentDrawer';

function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDay(iso: string) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      weekday: 'long',
    });
  } catch {
    return iso;
  }
}

function severityLabel(severity: string) {
  if (severity === 'alarm') return 'Alarm';
  if (severity === 'attention') return 'Dikkat';
  return 'Takip';
}

function todayLabel(row: AttendanceFollowupStudent) {
  const bits: string[] = [];
  if (row.today_absent) bits.push('Gelmedi');
  if (row.today_late) bits.push('Geç');
  if (row.today_exit) bits.push('Çıkış');
  if (!bits.length && row.today_status === 'PRESENT') return 'Geldi';
  if (!bits.length && row.today_status === 'EXCUSED') return 'İzinli';
  return bits.join(' · ') || 'Kayıt yok';
}

type Props = {
  initialDate?: string;
  onDateChange?: (date: string) => void;
};

export default function YoklamaFollowupPanel({ initialDate, onDateChange }: Props) {
  const [date, setDate] = useState(initialDate || todayISO());
  const [data, setData] = useState<AttendanceFollowupPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentId, setStudentId] = useState<number | null>(null);

  const load = useCallback(async (day: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAttendanceFollowup(day);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        setData(null);
        setError(res.error || 'Yoklama özeti yüklenemedi.');
      }
    } catch {
      setData(null);
      setError('Yoklama özeti yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(date);
  }, [date, load]);

  const changeDate = (next: string) => {
    setDate(next);
    onDateChange?.(next);
  };

  const counts = data?.day_counts;
  const rows = data?.students || [];

  return (
    <div className="yf-panel">
      <div className="yf-toolbar">
        <div>
          <h3 className="yf-title">Yoklama takibi</h3>
          <p className="yf-sub">{formatDay(date)}</p>
        </div>
        <label className="yf-date">
          <span>Tarih</span>
          <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} />
        </label>
      </div>

      {counts && (
        <div className="yf-kpis">
          <div className="yf-kpi">
            <strong>{counts.total_students}</strong>
            <span>Öğrenci</span>
          </div>
          <div className="yf-kpi">
            <strong>{counts.present}</strong>
            <span>Geldi</span>
          </div>
          <div className="yf-kpi yf-kpi--late">
            <strong>{counts.late}</strong>
            <span>Geç</span>
          </div>
          <div className="yf-kpi yf-kpi--absent">
            <strong>{counts.absent}</strong>
            <span>Gelmedi</span>
          </div>
          <div className="yf-kpi">
            <strong>{counts.exit}</strong>
            <span>Çıkış</span>
          </div>
        </div>
      )}

      {loading ? (
        <p className="yf-empty">Yükleniyor…</p>
      ) : error ? (
        <p className="yf-empty">{error}</p>
      ) : rows.length === 0 ? (
        <p className="yf-empty">Bu gün için koç listenizde öğrenci yok.</p>
      ) : (
        <div className="yf-table-wrap">
          <table className="yf-table">
            <thead>
              <tr>
                <th>Öğrenci</th>
                <th>Bugün</th>
                <th>Gelmedi</th>
                <th>Geç</th>
                <th>Çıkış</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.student_id}
                  className={`yf-row yf-row--${row.severity}`}
                  onClick={() => setStudentId(row.student_id)}
                >
                  <td>
                    <div className="yf-name">{row.student_name}</div>
                    {row.sinif_name ? <div className="yf-class">{row.sinif_name}</div> : null}
                  </td>
                  <td>{todayLabel(row)}</td>
                  <td>{row.absent_days} gün</td>
                  <td>{row.late_days} gün</td>
                  <td>{row.exit_days} gün</td>
                  <td>
                    <span className={`yf-sev yf-sev--${row.severity}`}>{severityLabel(row.severity)}</span>
                    {row.consecutive_absent >= 2 ? (
                      <div className="yf-note">{row.consecutive_absent} ardışık gün gelmedi</div>
                    ) : null}
                    {row.recommended_action ? (
                      <div className="yf-note">{row.recommended_action}</div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {studentId ? (
        <YoklamaStudentDrawer
          studentId={studentId}
          date={date}
          onClose={() => setStudentId(null)}
        />
      ) : null}
    </div>
  );
}
