'use client';

/**
 * Öğrenci Çalışma Merkezi — Genel Bakış.
 * Tek BFF isteği. Öncelikler + durum şeridi + iki bağlam kolonu.
 */

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CoachStudentProfileData,
  type CoachAttendanceEvent,
  type Student360ActionId,
  type Student360TabId,
} from '@/lib/coach-api';
import {
  COACH_RISK_LABELS,
  coachRiskCssClass,
  normalizeCoachRiskLevel,
} from '@/lib/coach-constants';
import Student360Icon, {
  type Student360IconName,
} from '@/components/coach/Student360Icon';
import PhoneContactLinks from '@/components/coach/PhoneContactLinks';

type PanelId = Exclude<Student360TabId, 'genel'>;

interface WorkspaceOverviewProps {
  profile: CoachStudentProfileData;
  onNavigateTab?: (tab: PanelId) => void;
  onAction?: (action: Student360ActionId) => void;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function daysSince(d?: string | null): number | null {
  if (!d) return null;
  const then = new Date(d);
  if (Number.isNaN(then.getTime())) return null;
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

function fmtDate(d?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('tr-TR', opts ?? { day: 'numeric', month: 'short' });
}

type Priority = {
  id: string;
  icon: Student360IconName;
  tone: 'danger' | 'warn' | 'info' | 'ok';
  title: string;
  cta: string;
  onClick: () => void;
};

function buildPriorities(
  profile: CoachStudentProfileData,
  onNavigateTab?: (tab: PanelId) => void,
  onAction?: (action: Student360ActionId) => void
): Priority[] {
  const qs = profile.quick_stats || {};
  const ov = asRecord(profile.overview);
  const overdue = Number(qs.overdue_homework_count ?? qs.overdue_homework ?? 0) || 0;
  const pending =
    Number(qs.pending_manual_assignments ?? ov?.pending_manual_assignments ?? qs.open_assignments ?? 0) || 0;
  const meetingDays = daysSince(profile.last_meeting?.date || qs.last_meeting_date || null);
  const riskLevel = normalizeCoachRiskLevel(profile.risk?.level ?? profile.risk?.label);
  const program = asRecord(ov?.current_week_program);
  const programPct = qs.program_completion_percent ?? qs.program_completion ?? program?.completion_percent;

  const items: Priority[] = [];

  if (overdue > 0) {
    items.push({
      id: 'overdue',
      icon: 'homework',
      tone: 'danger',
      title: `${overdue} geciken ödev`,
      cta: 'Ödevler',
      onClick: () => onNavigateTab?.('odevler'),
    });
  }

  if (riskLevel === 'high' || riskLevel === 'medium') {
    items.push({
      id: 'risk',
      icon: 'risk',
      tone: riskLevel === 'high' ? 'danger' : 'warn',
      title: `Risk: ${COACH_RISK_LABELS[riskLevel]}`,
      cta: 'Bildir',
      onClick: () => onAction?.('risk'),
    });
  }

  if (meetingDays != null && meetingDays >= 14) {
    items.push({
      id: 'stale-meeting',
      icon: 'meeting',
      tone: 'warn',
      title: `${meetingDays} gündür görüşme yok`,
      cta: 'Ekle',
      onClick: () => onAction?.('gorusme-ekle'),
    });
  }

  if (overdue === 0 && pending > 0) {
    items.push({
      id: 'pending',
      icon: 'homework',
      tone: 'info',
      title: `${pending} açık ödev`,
      cta: 'Ödevler',
      onClick: () => onNavigateTab?.('odevler'),
    });
  }

  if (!program && programPct == null) {
    items.push({
      id: 'no-program',
      icon: 'calendar',
      tone: 'info',
      title: 'Bu hafta program yok',
      cta: 'Oluştur',
      onClick: () => onAction?.('program'),
    });
  }

  if (items.length === 0) {
    items.push({
      id: 'ok',
      icon: 'check',
      tone: 'ok',
      title: 'Acil takip yok',
      cta: 'Ödev ver',
      onClick: () => onAction?.('odev-ver'),
    });
  }

  return items;
}

const KIND_LABEL: Record<string, string> = {
  late: 'Geç geldi',
  absent: 'Gelmedi',
  exit: 'Çıkış',
};

export default function WorkspaceOverview({
  profile,
  onNavigateTab,
  onAction,
}: WorkspaceOverviewProps) {
  const { student } = profile;
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceKind, setAttendanceKind] = useState<'all' | 'late' | 'absent' | 'exit'>('all');
  const qs = profile.quick_stats || {};
  const ov = asRecord(profile.overview);
  const exam = asRecord(ov?.exam_summary) || {};
  const program = asRecord(ov?.current_week_program);
  const hedef = asRecord(ov?.hedef);
  const hedefText = (hedef?.text as string | undefined) || profile.coach_context?.hedef || null;
  const riskLevel = normalizeCoachRiskLevel(profile.risk?.level ?? profile.risk?.label);
  const priorities = buildPriorities(profile, onNavigateTab, onAction);

  const overdue = Number(qs.overdue_homework_count ?? qs.overdue_homework ?? 0) || 0;
  const pending =
    Number(qs.pending_manual_assignments ?? ov?.pending_manual_assignments ?? 0) || 0;
  const lastNet = qs.last_exam_net ?? (exam.last_exam_net as number | undefined);
  const lastExamName = (exam.last_exam_name as string | undefined) || null;
  const programPct =
    qs.program_completion_percent ?? qs.program_completion ?? (program?.completion_percent as number | undefined);
  const meetingDays = daysSince(profile.last_meeting?.date || qs.last_meeting_date || null);

  const recentMeetings = Array.isArray(ov?.recent_meetings)
    ? (ov!.recent_meetings as Array<{
        id?: number;
        tarih?: string;
        gorusme_tarihi?: string;
        konu?: string;
      }>)
    : [];

  const veliAd = student.veli_adi || student.veli?.ad || student.veli_ad_soyad || null;
  const veliTuru =
    student.veli?.veli_turu_display ??
    student.veliler?.find((v) => v.varsayilan)?.veli_turu_display ??
    student.veliler?.[0]?.veli_turu_display ??
    null;
  const veliTelefon = student.veli_telefon || student.veli?.telefon || null;

  const attendance = profile.attendance;
  const attEvents = useMemo(() => {
    const rows = attendance?.events ?? [];
    if (attendanceKind === 'all') return rows;
    return rows.filter((row) => row.kind === attendanceKind);
  }, [attendance?.events, attendanceKind]);
  const todayLabel = new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="s360w-overview">
      <section className="s360w-today" aria-label="Bugünkü öncelikler">
        <div className="s360w-section-head">
          <div>
            <span className="s360-eyebrow">{todayLabel}</span>
            <h2>Bugün ne yapmalıyım?</h2>
          </div>
        </div>
        <div className="s360w-priority-row">
          {priorities.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`s360w-priority is-${p.tone}`}
              onClick={p.onClick}
            >
              <span className="s360w-priority-icon">
                <Student360Icon name={p.icon} size={16} />
              </span>
              <strong>{p.title}</strong>
              <span className="s360w-priority-cta">{p.cta} →</span>
            </button>
          ))}
        </div>
      </section>

      <section className="s360w-metrics" aria-label="Öğrenci durum özeti">
        <button
          type="button"
          className={`s360w-metric${overdue > 0 ? ' is-alert' : ''}`}
          onClick={() => onNavigateTab?.('odevler')}
        >
          <strong>{overdue}</strong>
          <span>Geciken</span>
        </button>
        <button type="button" className="s360w-metric" onClick={() => onNavigateTab?.('odevler')}>
          <strong>{pending}</strong>
          <span>Açık ödev</span>
        </button>
        <button type="button" className="s360w-metric" onClick={() => onNavigateTab?.('sinavlar')}>
          <strong>{lastNet != null ? Number(lastNet).toFixed(1) : '—'}</strong>
          <span>Son net</span>
          {lastExamName && <small className="s360w-metric-ellipsis">{lastExamName}</small>}
        </button>
        <button type="button" className="s360w-metric" onClick={() => onNavigateTab?.('program')}>
          <strong>{programPct != null ? `%${Math.round(Number(programPct))}` : '—'}</strong>
          <span>Program</span>
        </button>
        <button type="button" className="s360w-metric" onClick={() => onNavigateTab?.('gorusmeler')}>
          <strong>{qs.total_meetings ?? 0}</strong>
          <span>Görüşme</span>
          <small>
            {meetingDays == null ? 'Yok' : meetingDays === 0 ? 'Bugün' : `${meetingDays} gün`}
          </small>
        </button>
      </section>

      <section className="s360-surface-card s360w-att-card">
        <button type="button" className="s360w-att-hit" onClick={() => setAttendanceOpen(true)}>
          <div className="s360w-section-head">
            <div>
              <span className="s360-eyebrow">Yoklama</span>
              <h3 className="coach-section-title">Devamsızlık</h3>
            </div>
            <span className="s360w-priority-cta">Detay →</span>
          </div>
          <div className="s360w-att-stats">
            <div data-tone="late">
              <b>{attendance?.late ?? 0}</b>
              <span>Geç</span>
            </div>
            <div data-tone="absent">
              <b>{attendance?.absent ?? 0}</b>
              <span>Yok</span>
            </div>
            <div data-tone="exit">
              <b>{attendance?.exit ?? 0}</b>
              <span>Çıkış</span>
            </div>
          </div>
        </button>
      </section>

      <div className="s360w-columns">
        <div className="s360w-col-main">
          <section className="s360-surface-card">
            <div className="s360w-section-head">
              <div>
                <span className="s360-eyebrow">Görüşme</span>
                <h3 className="coach-section-title">Son konuşulan</h3>
              </div>
              <button type="button" className="coach-link-btn" onClick={() => onNavigateTab?.('gorusmeler')}>
                Tümü
              </button>
            </div>
            {profile.last_meeting?.date ? (
              <div className="s360w-last-meeting">
                <span className="s360w-last-meeting-date">{fmtDate(profile.last_meeting.date)}</span>
                <p>{profile.last_meeting.konu || 'Konu girilmemiş'}</p>
              </div>
            ) : (
              <div className="s360w-empty-inline">
                <p>Henüz görüşme kaydı yok.</p>
                <button type="button" className="coach-link-btn" onClick={() => onAction?.('gorusme-ekle')}>
                  İlk görüşmeyi ekle
                </button>
              </div>
            )}
            {recentMeetings.length > 1 && (
              <ul className="s360-timeline s360w-timeline">
                {recentMeetings.slice(1, 4).map((m, idx) => {
                  const d = m.gorusme_tarihi || m.tarih;
                  return (
                    <li key={m.id ?? idx}>
                      <span className="s360-timeline-marker">
                        <Student360Icon name="meeting" size={14} />
                      </span>
                      <span className="s360-timeline-date">{fmtDate(d)}</span>
                      <span className="s360-timeline-text">{m.konu || 'Görüşme'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {program && (
            <section className="s360-surface-card">
              <div className="s360w-section-head">
                <div>
                  <span className="s360-eyebrow">Bu hafta</span>
                  <h3 className="coach-section-title">Çalışma programı</h3>
                </div>
                <button type="button" className="coach-link-btn" onClick={() => onNavigateTab?.('program')}>
                  Düzenle
                </button>
              </div>
              <div className="s360w-program">
                <div className="s360w-program-meta">
                  <span>
                    {fmtDate(program.week_start as string)} – {fmtDate(program.week_end as string)}
                  </span>
                  {program.total_block_count != null && (
                    <span>{String(program.total_block_count)} blok</span>
                  )}
                </div>
                {programPct != null && (
                  <div className="s360w-program-progress">
                    <div className="s360w-program-bar">
                      <div
                        className="s360w-program-fill"
                        style={{ width: `${Math.min(100, Math.max(0, Number(programPct)))}%` }}
                      />
                    </div>
                    <strong>%{Math.round(Number(programPct))}</strong>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="s360w-col-side">
          {hedefText && (
            <section className="s360-surface-card s360w-hedef">
              <span className="s360-target-icon">
                <Student360Icon name="target" />
              </span>
              <div>
                <span className="s360-eyebrow">Hedef</span>
                <p>{hedefText}</p>
              </div>
            </section>
          )}

          {riskLevel && profile.risk?.reasons && profile.risk.reasons.length > 0 && (
            <section className="s360-surface-card s360w-risk">
              <div className="s360w-risk-head">
                <Student360Icon name="risk" size={18} />
                <div>
                  <span className="s360-eyebrow">Risk</span>
                  <span className={`coach-risk-badge ${coachRiskCssClass(riskLevel)}`}>
                    {COACH_RISK_LABELS[riskLevel]}
                  </span>
                </div>
              </div>
              <ul>
                {profile.risk.reasons.slice(0, 3).map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="s360-surface-card s360w-veli">
            <div className="s360w-section-head">
              <div>
                <span className="s360-eyebrow">Veli</span>
                <h3 className="coach-section-title">{veliAd || 'Kayıt yok'}</h3>
              </div>
              <button type="button" className="coach-link-btn" onClick={() => onNavigateTab?.('veli')}>
                Detay
              </button>
            </div>
            {veliTuru && <p className="s360w-veli-turu">{veliTuru}</p>}
            {veliTelefon ? (
              <PhoneContactLinks
                phone={veliTelefon}
                ogrenciId={student.id}
                veliId={
                  student.veli?.id ??
                  student.veliler?.find((v) => v.varsayilan)?.id ??
                  student.veliler?.[0]?.id ??
                  undefined
                }
                contactLabel={veliAd ? `${veliAd} (veli)` : 'Veli'}
              />
            ) : (
              <p className="s360w-muted">Telefon kayıtlı değil.</p>
            )}
          </section>
        </aside>
      </div>

      {attendanceOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="coach-drawer-overlay" onClick={() => setAttendanceOpen(false)}>
            <div
              className="coach-drawer coach-drawer-wide"
              role="dialog"
              aria-modal="true"
              aria-labelledby="s360w-att-title"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="coach-drawer-header">
                <div>
                  <span className="s360-eyebrow">Kütüphane ve sınıf</span>
                  <h2 className="coach-drawer-title" id="s360w-att-title">
                    Devamsızlık
                  </h2>
                </div>
                <button
                  type="button"
                  className="coach-drawer-close"
                  onClick={() => setAttendanceOpen(false)}
                  aria-label="Kapat"
                >
                  ×
                </button>
              </header>
              <div className="s360w-att-stats is-filter">
                {(['all', 'late', 'absent', 'exit'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    data-tone={kind === 'all' ? undefined : kind}
                    className={attendanceKind === kind ? 'is-on' : undefined}
                    onClick={() => setAttendanceKind(kind)}
                  >
                    <b>
                      {kind === 'all'
                        ? (attendance?.events.length ?? 0)
                        : kind === 'late'
                          ? attendance?.late ?? 0
                          : kind === 'absent'
                            ? attendance?.absent ?? 0
                            : attendance?.exit ?? 0}
                    </b>
                    <span>{kind === 'all' ? 'Tümü' : KIND_LABEL[kind]}</span>
                  </button>
                ))}
              </div>
              {attEvents.length === 0 ? (
                <p className="s360w-empty-inline">Bu seçimde kayıt yok.</p>
              ) : (
                <ul className="s360-timeline s360w-att-list">
                  {attEvents.map((row: CoachAttendanceEvent, idx) => (
                    <li key={`${row.date}-${row.kind}-${idx}`}>
                      <span className="s360-timeline-marker" data-tone={row.kind}>
                        <Student360Icon name={row.source === 'kutuphane' ? 'library' : 'academic'} size={14} />
                      </span>
                      <span className="s360-timeline-date">
                        {fmtDate(row.date)}
                        {row.period ? ` · ${row.period}` : ''}
                      </span>
                      <span className="s360-timeline-text">
                        {row.kind_label}
                        {' · '}
                        {row.source_label}
                        {row.time ? ` · ${row.time}` : ''}
                        {row.note?.trim() ? ` — ${row.note.trim()}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
