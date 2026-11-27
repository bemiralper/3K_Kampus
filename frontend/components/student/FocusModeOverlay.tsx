'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { useStudentPortal } from '@/lib/student-portal-context';

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function FocusModeOverlay() {
  const {
    focusSession,
    toggleFocusRunning,
    setFocusMinimized,
    extendActiveFocus,
    cancelFocus,
    finishFocusAndSave,
    celebrationBadges,
    dismissCelebration,
  } = useStudentPortal();
  const [saving, setSaving] = useState(false);

  const handleFinish = async (markDone: boolean) => {
    setSaving(true);
    try {
      await finishFocusAndSave(markDone);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {celebrationBadges.length > 0 ? (
        <div
          className="sp-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissCelebration();
          }}
        >
          <div
            className="sp-modal-sheet"
            style={{
              maxWidth: 460,
              textAlign: 'center',
              background:
                'radial-gradient(circle at top, rgba(245, 158, 11, 0.22), transparent 62%), var(--sp-surface)',
              border: '1.5px solid rgba(245, 158, 11, 0.45)',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.35)',
              padding: '28px 24px',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 999,
                background: 'var(--sp-warm-soft)',
                color: 'var(--sp-warm)',
                fontWeight: 700,
                fontSize: 12,
                marginBottom: 14,
              }}
            >
              <Sparkles size={14} />
              <span>YENİ BAŞARI KİLİDİ AÇILDI!</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 14 }}>
              {celebrationBadges.map((b) => (
                <div
                  key={b.id || b.badge_type}
                  style={{
                    width: 78,
                    height: 78,
                    borderRadius: 24,
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.22), rgba(37,99,235,0.16))',
                    border: '2px solid rgba(245, 158, 11, 0.5)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 38,
                    boxShadow: '0 10px 28px rgba(245, 158, 11, 0.25)',
                  }}
                >
                  {b.icon || '🏅'}
                </div>
              ))}
            </div>

            <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>
              {celebrationBadges.map((b) => b.title).join(' & ')}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--sp-muted)', lineHeight: 1.5 }}>
              {celebrationBadges.map((b) => b.description).filter(Boolean).join(' · ') ||
                'Harika gidiyorsun! Disiplinli çalışman yeni bir rozet kazandırdı.'}
            </p>

            <button
              type="button"
              className="sp-btn sp-btn-primary"
              onClick={dismissCelebration}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <span>Harika! Çalışmaya Devam Et</span>
            </button>
          </div>
        </div>
      ) : null}

      {focusSession && focusSession.minimized ? (
        <div className="sp-focus-pill">
          <span className="sp-live-dot" />
          <div className="sp-focus-pill-info">
            <strong>
              {focusSession.mode === 'pomodoro'
                ? formatClock(focusSession.targetSeconds - focusSession.elapsedSeconds)
                : formatClock(focusSession.elapsedSeconds)}
            </strong>
            <span>
              {focusSession.block
                ? `${focusSession.block.subject}${focusSession.block.topic ? ` · ${focusSession.block.topic}` : ''}`
                : focusSession.homeworkTask
                  ? `${focusSession.homeworkTask.subject} · ${focusSession.homeworkTask.title}`
                  : focusSession.customTitle || 'Serbest Odak'}
            </span>
          </div>
          <button
            type="button"
            className="sp-icon-btn"
            onClick={toggleFocusRunning}
            title={focusSession.running ? 'Duraklat' : 'Devam Et'}
          >
            {focusSession.running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            className="sp-icon-btn"
            onClick={() => setFocusMinimized(false)}
            title="Tam Ekran Odak Modu"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      ) : null}

      {focusSession && !focusSession.minimized ? (
        <div className="sp-zen-overlay" role="dialog" aria-modal="true">
          <div className="sp-zen-card">
            <div className="sp-zen-topbar">
              <span className="sp-chip sp-chip-accent">
                <Flame size={14} />
                {focusSession.mode === 'pomodoro' ? 'Pomodoro Odak Modu' : 'Serbest Kronometre'}
              </span>
              <div className="sp-zen-top-actions">
                <button
                  type="button"
                  className="sp-btn sp-btn-ghost sp-btn-sm"
                  onClick={() => setFocusMinimized(true)}
                  title="Küçült ve ders notlarını incelemeye devam et"
                >
                  <Minimize2 size={15} />
                  <span>Küçült (Notlarla Çalış)</span>
                </button>
                <button
                  type="button"
                  className="sp-icon-btn"
                  onClick={cancelFocus}
                  title="Kaydetmeden kapat"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="sp-zen-subject">
              <h2>
                {focusSession.block
                  ? focusSession.block.subject
                  : focusSession.homeworkTask
                    ? `${focusSession.homeworkTask.subject} — ${focusSession.homeworkTask.title}`
                    : focusSession.customTitle || 'Serbest Çalışma Oturumu'}
              </h2>
              {focusSession.block ? (
                <p>
                  {focusSession.block.topic || focusSession.block.task_type_label}
                  {focusSession.block.resource_name
                    ? ` · ${focusSession.block.resource_name}`
                    : ''}
                  {focusSession.block.question_count
                    ? ` · ${focusSession.block.question_count} Soru`
                    : ''}
                </p>
              ) : focusSession.homeworkTask ? (
                <p>
                  {focusSession.homeworkTask.book_name
                    ? `${focusSession.homeworkTask.book_name} · `
                    : ''}
                  {focusSession.homeworkTask.topic_name || focusSession.homeworkTask.task_type_label}
                  {focusSession.homeworkTask.question_count
                    ? ` · ${focusSession.homeworkTask.question_count} Soru`
                    : ''}
                  {focusSession.homeworkTask.k3_mode_label
                    ? ` · 3K: ${focusSession.homeworkTask.k3_mode_label}`
                    : ''}
                </p>
              ) : (
                <p>Dikkat dağıtıcıları kapat, yalnızca önündeki hedefe odaklan.</p>
              )}
            </div>

            <div className="sp-zen-dial">
              <div className="sp-zen-time">
                {focusSession.mode === 'pomodoro'
                  ? formatClock(focusSession.targetSeconds - focusSession.elapsedSeconds)
                  : formatClock(focusSession.elapsedSeconds)}
              </div>
              <div className="sp-zen-subtime">
                <Timer size={14} />
                <span>
                  Geçen süre: {Math.floor(focusSession.elapsedSeconds / 60)} dk{' '}
                  {focusSession.elapsedSeconds % 60} sn
                </span>
              </div>
              {focusSession.mode === 'pomodoro' ? (
                <div className="sp-zen-progress">
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (focusSession.elapsedSeconds / focusSession.targetSeconds) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              ) : null}
            </div>

            <div className="sp-zen-controls">
              <button
                type="button"
                className="sp-btn sp-btn-secondary sp-btn-lg"
                onClick={toggleFocusRunning}
              >
                {focusSession.running ? <Pause size={18} /> : <Play size={18} />}
                <span>{focusSession.running ? 'Duraklat' : 'Devam Et'}</span>
              </button>

              {focusSession.mode === 'pomodoro' ? (
                <button
                  type="button"
                  className="sp-btn sp-btn-secondary sp-btn-lg"
                  onClick={() => extendActiveFocus(5)}
                >
                  <Timer size={17} />
                  <span>+5 dk Ekle</span>
                </button>
              ) : null}

              {focusSession.block ? (
                <button
                  type="button"
                  className="sp-btn sp-btn-primary sp-btn-lg"
                  disabled={saving}
                  onClick={() => handleFinish(true)}
                >
                  <CheckCircle2 size={18} />
                  <span>
                    {saving ? 'Kaydediliyor…' : 'Görevi Tamamla & Süreyi Kaydet'}
                  </span>
                </button>
              ) : focusSession.homeworkTask ? (
                <>
                  <button
                    type="button"
                    className="sp-btn sp-btn-secondary sp-btn-lg"
                    disabled={saving}
                    onClick={() => handleFinish(false)}
                  >
                    <Timer size={17} />
                    <span>Sadece Süreyi Kaydet</span>
                  </button>
                  <button
                    type="button"
                    className="sp-btn sp-btn-primary sp-btn-lg"
                    disabled={saving}
                    onClick={() => handleFinish(true)}
                  >
                    <CheckCircle2 size={18} />
                    <span>
                      {saving ? 'Kaydediliyor…' : 'Testi Çözdüm & Süreyi Kaydet'}
                    </span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="sp-btn sp-btn-primary sp-btn-lg"
                  onClick={cancelFocus}
                >
                  <CheckCircle2 size={18} />
                  <span>Oturumu Bitir</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
