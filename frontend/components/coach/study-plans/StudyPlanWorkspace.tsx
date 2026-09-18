'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCoachStudents, type CoachPortalStudent } from '@/lib/coach-api';
import {
  fetchStudyProgram,
  fetchStudyPrograms,
  fetchStudyTemplates,
  generateStudyProgram,
  previewStudyTemplate,
  regenerateStudyProgram,
  type GeneratePreview,
  type StudyProgram,
  type StudyProgramListItem,
  type StudyTemplate,
} from '@/lib/study-plans-api';
import './study-plans.css';

function mondayOf(value: Date): Date {
  const copy = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  return copy;
}

function toIso(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12, 0, 0, 0);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatWeek(startIso: string): string {
  const start = new Date(`${startIso}T12:00:00`);
  const end = addDays(start, 6);
  const left = start.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  const right = end.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  return `${left} – ${right}`;
}

function weekOptions(around = new Date()): { value: string; label: string }[] {
  const current = mondayOf(around);
  return [-2, -1, 0, 1, 2].map((offset) => {
    const start = addDays(current, offset * 7);
    const value = toIso(start);
    const tag = offset === 0 ? 'Bu hafta' : offset === 1 ? 'Gelecek hafta' : '';
    return { value, label: `${formatWeek(value)}${tag ? ` · ${tag}` : ''}` };
  });
}

export default function StudyPlanWorkspace({
  initialStudentId,
  templatesHref,
  historyHref,
}: {
  initialStudentId?: number;
  templatesHref: string;
  historyHref: string;
}) {
  const [students, setStudents] = useState<CoachPortalStudent[]>([]);
  const [templates, setTemplates] = useState<StudyTemplate[]>([]);
  const [studentId, setStudentId] = useState<number | ''>(initialStudentId || '');
  const [weekStart, setWeekStart] = useState(toIso(mondayOf(new Date())));
  const [templateId, setTemplateId] = useState<number | ''>('');
  const [preview, setPreview] = useState<GeneratePreview | null>(null);
  const [program, setProgram] = useState<StudyProgram | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyExists, setAlreadyExists] = useState(false);
  const weeks = useMemo(() => weekOptions(), []);

  useEffect(() => {
    const loadLookups = () => {
      fetchCoachStudents().then((res) => {
        if (res.success && res.data) setStudents(res.data);
      });
      fetchStudyTemplates().then((res) => {
        if (res.success && res.data) {
          setTemplates(res.data);
          const standart = res.data.find((t) => t.scenario === 'STANDART') || res.data[0];
          if (standart) setTemplateId((current) => current || standart.id);
        }
      });
    };
    loadLookups();
    window.addEventListener('3k:context-updated', loadLookups);
    return () => window.removeEventListener('3k:context-updated', loadLookups);
  }, []);

  const loadExisting = useCallback(async (sid: number, start: string) => {
    const list = await fetchStudyPrograms({ student_id: sid, week_start: start });
    const first = list.data?.[0];
    if (!first) {
      setProgram(null);
      return;
    }
    const detail = await fetchStudyProgram(first.id);
    if (detail.success && detail.data && detail.data.week_start === start) {
      setProgram(detail.data);
      return;
    }
    setProgram(null);
  }, []);

  useEffect(() => {
    if (!studentId) return;
    loadExisting(Number(studentId), weekStart);
  }, [studentId, weekStart, loadExisting]);

  useEffect(() => {
    if (!studentId || !templateId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    previewStudyTemplate(Number(templateId), {
      student_id: Number(studentId),
      week_start: weekStart,
    }).then((res) => {
      if (!cancelled && res.success && res.data) setPreview(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, templateId, weekStart]);

  async function onCreate() {
    if (!studentId || !templateId) return;
    setLoading(true);
    setError(null);
    setAlreadyExists(false);
    const res = await generateStudyProgram({
      student_id: Number(studentId),
      week_start: weekStart,
      template_id: Number(templateId),
    });
    setLoading(false);
    if (res.already_exists && res.data) {
      if (res.data.week_start !== weekStart) {
        setError('Üretilen program seçilen haftaya ait değil.');
        return;
      }
      setProgram(res.data);
      setAlreadyExists(true);
      return;
    }
    if (!res.success || !res.data) {
      setError(res.error || 'Program oluşturulamadı.');
      return;
    }
    if (res.data.week_start !== weekStart) {
      setError('Üretilen program seçilen haftaya ait değil.');
      return;
    }
    setProgram(res.data);
  }

  async function onRegenerate() {
    if (!program) return;
    setLoading(true);
    setError(null);
    const res = await regenerateStudyProgram(program.id, {
      lock_past: true,
      template_id: Number(templateId) || undefined,
    });
    setLoading(false);
    if (!res.success || !res.data) {
      setError(res.error || 'Yeniden üretilemedi.');
      return;
    }
    setProgram(res.data);
    setAlreadyExists(false);
  }

  const leftoverBits = program?.leftovers || [];

  return (
    <div className="spl-root">
      <div className="spl-entry">
        <div className="spl-field">
          <label htmlFor="spl-student">Öğrenci</label>
          <select
            id="spl-student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Seçin</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.tam_ad}
              </option>
            ))}
          </select>
        </div>
        <div className="spl-field">
          <label htmlFor="spl-week">Hafta</label>
          <select id="spl-week" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>
            {weeks.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
        <div className="spl-field">
          <label htmlFor="spl-template">Şablon</label>
          <select
            id="spl-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">Seçin</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="spl-create" onClick={onCreate} disabled={!studentId || !templateId || loading}>
          {loading ? 'Üretiliyor…' : 'Program Oluştur'}
        </button>
      </div>

      <div className="spl-links">
        <Link href={templatesHref}>Şablonları Yönet</Link>
        <Link href={historyHref}>Geçmiş Programlar</Link>
      </div>

      {preview && (
        <p className={`spl-preview${preview.overflow_sources ? ' is-warn' : ''}`}>{preview.label}</p>
      )}
      {error && <p className="spl-error">{error}</p>}
      {alreadyExists && program && !program.is_readonly && (
        <div className="spl-actions">
          <span className="spl-preview">Bu hafta için program zaten var.</span>
          <button type="button" className="spl-ghost" onClick={onRegenerate} disabled={loading}>
            Yeniden üret (geçmiş günler kilitli)
          </button>
        </div>
      )}

      {!program && (
        <div className="spl-empty">Öğrenci, hafta ve şablon seçip Program Oluştur’a basın.</div>
      )}

      {program && (
        <div className="spl-board">
          <div>
            <div className="spl-days">
              {program.days.map((day) => (
                <article
                  key={day.id}
                  className={`spl-day is-${day.load_level.toLowerCase()}${day.is_locked ? ' is-locked' : ''}`}
                >
                  <div className="spl-day-chip">{day.chip}</div>
                  <div className="spl-day-meta">
                    {day.planned_tests} test · {day.planned_questions} soru
                    {day.is_locked ? ' · kilitli' : ''}
                  </div>
                  {day.slots.map((slot) => (
                    <div key={slot.id} className="spl-slot">
                      <div className="spl-slot-title">{slot.lesson_name || slot.title}</div>
                      <div className="spl-slot-units">
                        {slot.planned_tests} test · {slot.planned_questions} soru · {slot.planned_minutes} dk
                      </div>
                      {slot.assignment_title && (
                        <div className="spl-slot-src">Ödev: {slot.assignment_title}</div>
                      )}
                    </div>
                  ))}
                </article>
              ))}
            </div>

            {leftoverBits.length > 0 && (
              <section className="spl-leftover">
                <h3>
                  Bekleyen:{' '}
                  {[
                    program.summary.leftover_tests ? `${program.summary.leftover_tests} test` : '',
                    program.summary.leftover_questions ? `${program.summary.leftover_questions} soru` : '',
                  ]
                    .filter(Boolean)
                    .join(', ') || `${leftoverBits.length} birim`}
                </h3>
                <ul>
                  {leftoverBits.map((item) => (
                    <li key={item.id}>
                      {item.lesson_name || item.title}
                      {item.lesson_name && item.title ? ` · ${item.title}` : ''} —{' '}
                      {[
                        item.remaining_tests ? `${item.remaining_tests} test` : '',
                        item.remaining_questions ? `${item.remaining_questions} soru` : '',
                        item.remaining_minutes ? `${item.remaining_minutes} dk` : '',
                      ]
                        .filter(Boolean)
                        .join(', ')}{' '}
                      ({item.reason_display})
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="spl-summary">
            <h2>Haftalık Özet</h2>
            <div className="spl-stat">
              <span>Görev</span>
              <span>
                {program.summary.tasks.done}/{program.summary.tasks.total}
              </span>
            </div>
            <div className="spl-stat">
              <span>Soru</span>
              <span>
                {program.summary.questions.done}/{program.summary.questions.total}
              </span>
            </div>
            <div className="spl-stat">
              <span>Test</span>
              <span>
                {program.summary.tests.done}/{program.summary.tests.total}
              </span>
            </div>
            <div className="spl-stat">
              <span>Süre</span>
              <span>
                {program.summary.minutes.done_label} / {program.summary.minutes.total_label}
              </span>
            </div>
            <div className="spl-stat">
              <span>Tamamlanma</span>
              <span>%{program.summary.completion_percent}</span>
            </div>
            {program.summary.missing.length > 0 && (
              <ul className="spl-missing">
                {program.summary.missing.map((row) => (
                  <li key={row}>{row}</li>
                ))}
              </ul>
            )}
            <div className="spl-subjects">
              {program.summary.subjects.map((s) => (
                <div key={s.lesson} className="spl-subject-row">
                  <span>{s.lesson}</span>
                  <span>%{s.percent}</span>
                  <div className="spl-bar">
                    <i style={{ width: `${s.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {!program.is_readonly && (
              <div className="spl-actions">
                <button type="button" className="spl-ghost" onClick={onRegenerate} disabled={loading}>
                  Kalan günlere yeniden üret
                </button>
              </div>
            )}
            {program.is_readonly && <p className="spl-preview">Geçmiş hafta salt okunur.</p>}
          </aside>
        </div>
      )}
    </div>
  );
}

export function StudyTemplateList() {
  const [templates, setTemplates] = useState<StudyTemplate[]>([]);
  useEffect(() => {
    fetchStudyTemplates().then((res) => {
      if (res.success && res.data) setTemplates(res.data);
    });
  }, []);
  return (
    <div className="spl-list">
      <table>
        <thead>
          <tr>
            <th>Ad</th>
            <th>Senaryo</th>
            <th>Günler</th>
            <th>Tavan</th>
            <th>Kullanım</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.scenario_display}</td>
              <td>{(t.active_weekdays || []).length} gün</td>
              <td>
                {t.max_tests_per_day} test · {t.max_questions_per_day} soru · {t.max_minutes_per_day} dk
              </td>
              <td>{t.usage_count ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudyProgramHistory({ studentId }: { studentId?: number }) {
  const [rows, setRows] = useState<StudyProgramListItem[]>([]);
  useEffect(() => {
    fetchStudyPrograms({ student_id: studentId }).then((res) => {
      if (res.success && res.data) setRows(res.data);
    });
  }, [studentId]);
  return (
    <div className="spl-list">
      <table>
        <thead>
          <tr>
            <th>Öğrenci</th>
            <th>Hafta</th>
            <th>Şablon</th>
            <th>Koç</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.student_name}</td>
              <td>
                {formatWeek(row.week_start)}
                {row.is_readonly ? ' · salt okunur' : ''}
              </td>
              <td>{row.template_name}</td>
              <td>{row.coach_name}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
