'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Circle,
  ClipboardList,
  Flame,
  MessageSquareQuote,
  Play,
  Plus,
  Send,
  Timer,
  Trophy,
} from 'lucide-react';
import {
  studentPortalApi,
  type StudyBlockItem,
  type StudyDayItem,
  type StudyWorkspaceResponse,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';
import StudentHomeworkWorkspace from '@/components/student/StudentHomeworkWorkspace';
import StudentAchievementsArena from '@/components/student/StudentAchievementsArena';

function StudentStudyAndFocusInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    identity,
    startFocus,
    setFocusPresets,
    studyRefreshNonce,
    pushCelebrationBadges,
  } = useStudentPortal();

  const rawTab = searchParams.get('tab');
  const urlTab: 'plan' | 'odevler' | 'rozetler' =
    rawTab === 'odevler' ? 'odevler' : rawTab === 'rozetler' ? 'rozetler' : 'plan';
  const urlAssignmentId = searchParams.get('assignment')
    ? Number(searchParams.get('assignment'))
    : null;

  const [mainTab, setMainTab] = useState<'plan' | 'odevler' | 'rozetler'>(urlTab);
  const [workspace, setWorkspace] = useState<StudyWorkspaceResponse | null>(null);
  const [addingPreset, setAddingPreset] = useState(false);
  const [newPresetVal, setNewPresetVal] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState<number | undefined>(undefined);
  const [selectedDayId, setSelectedDayId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyBlockId, setBusyBlockId] = useState<number | null>(null);

  // DailyFeedback state
  const [fbDifficulty, setFbDifficulty] = useState<string>('ORTA');
  const [fbTimeSufficient, setFbTimeSufficient] = useState<boolean>(true);
  const [fbUnclearTopic, setFbUnclearTopic] = useState<string>('');
  const [fbNote, setFbNote] = useState<string>('');
  const [fbSaving, setFbSaving] = useState(false);
  const [fbSavedBanner, setFbSavedBanner] = useState(false);

  useEffect(() => {
    setMainTab(urlTab);
  }, [urlTab]);

  const switchMainTab = (
    nextTab: 'plan' | 'odevler' | 'rozetler',
    assignmentId?: number,
  ) => {
    setMainTab(nextTab);
    const qs = new URLSearchParams(searchParams.toString());
    if (nextTab === 'odevler') {
      qs.set('tab', 'odevler');
      if (assignmentId) qs.set('assignment', String(assignmentId));
    } else if (nextTab === 'rozetler') {
      qs.set('tab', 'rozetler');
      qs.delete('assignment');
    } else {
      qs.delete('tab');
      qs.delete('assignment');
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    router.replace(`/ogrenci/calisma${suffix}`, { scroll: false });
  };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentPortalApi.studyWorkspace(selectedProgramId);
      setWorkspace(res);
      if (res.active_program && res.active_program.days.length > 0) {
        const keep = res.active_program.days.find((d) => d.id === selectedDayId);
        const todayDay = res.active_program.days.find((d) => d.is_today);
        const chosen = keep || todayDay || res.active_program.days[0];
        setSelectedDayId(chosen.id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedDayId, selectedProgramId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace, studyRefreshNonce]);

  const activeDay: StudyDayItem | null = useMemo(() => {
    if (!workspace?.active_program) return null;
    return (
      workspace.active_program.days.find((d) => d.id === selectedDayId) ||
      workspace.active_program.days[0] ||
      null
    );
  }, [selectedDayId, workspace?.active_program]);

  useEffect(() => {
    if (!activeDay) return;
    setFbSavedBanner(false);
    if (activeDay.feedback) {
      setFbDifficulty(activeDay.feedback.difficulty || 'ORTA');
      setFbTimeSufficient(activeDay.feedback.time_sufficient !== false);
      setFbUnclearTopic(activeDay.feedback.unclear_topic || '');
      setFbNote(activeDay.feedback.note || '');
    } else {
      setFbDifficulty('ORTA');
      setFbTimeSufficient(true);
      setFbUnclearTopic('');
      setFbNote('');
    }
  }, [activeDay]);

  const handleToggleBlock = async (block: StudyBlockItem) => {
    setBusyBlockId(block.id);
    try {
      const res = await studentPortalApi.completeStudyBlock(block.id, {
        is_completed: !block.is_completed,
      });
      if (res.new_badges?.length) {
        pushCelebrationBadges(res.new_badges);
      }
      await loadWorkspace();
    } finally {
      setBusyBlockId(null);
    }
  };

  const handleFeedbackSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeDay) return;
    setFbSaving(true);
    setFbSavedBanner(false);
    try {
      await studentPortalApi.submitDailyFeedback(activeDay.id, {
        difficulty: fbDifficulty,
        time_sufficient: fbTimeSufficient,
        unclear_topic: fbUnclearTopic,
        note: fbNote,
      });
      setFbSavedBanner(true);
      await loadWorkspace();
    } finally {
      setFbSaving(false);
    }
  };

  const activeHwCount =
    workspace?.assignments_summary?.active_count ??
    (workspace?.assignments || []).filter((a) => !a.is_completed).length;

  return (
    <>
      {/* Üst Kokpit, Ana Sekme Seçici ve Hızlı Odak Başlatıcı */}
      <div className="sp-card">
        <div className="sp-card-header" style={{ flexWrap: 'wrap' }}>
          <div>
            <span className="sp-eyebrow">Aktif Çalışma, Ödev & Pomodoro</span>
            <h1 style={{ margin: '4px 0 0', fontSize: 22 }}>
              Plan, Koç Ödevlerim & Odak Kokpiti
            </h1>
          </div>

          <div className="sp-pill-bar">
            {(identity?.preferences?.focus_presets?.length
              ? identity.preferences.focus_presets
              : [25, 40, 50]
            ).map((mins) => {
              const isDef = identity?.preferences?.focus_minutes === mins;
              return (
                <button
                  key={mins}
                  type="button"
                  className={`sp-btn ${isDef ? 'sp-btn-primary' : 'sp-btn-secondary'} sp-btn-sm`}
                  onClick={() =>
                    startFocus({
                      mode: 'pomodoro',
                      minutes: mins,
                      customTitle: `${mins} dk Pomodoro`,
                    })
                  }
                >
                  {isDef ? <Flame size={14} /> : <Timer size={14} />}
                  <span>{mins} dk Odak</span>
                </button>
              );
            })}

            <button
              type="button"
              className="sp-btn sp-btn-secondary sp-btn-sm"
              onClick={() =>
                startFocus({
                  mode: 'stopwatch',
                  customTitle: 'Serbest Kronometre',
                })
              }
            >
              <Play size={14} /> Kronometre
            </button>

            {addingPreset ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = Number(newPresetVal.trim());
                  if (Number.isInteger(v) && v >= 5 && v <= 180) {
                    const existing = identity?.preferences?.focus_presets || [25, 40, 50];
                    const merged = existing.includes(v) ? existing : [...existing, v];
                    await setFocusPresets(merged.slice(0, 8), v);
                    setNewPresetVal('');
                    setAddingPreset(false);
                  }
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={newPresetVal}
                  onChange={(e) => setNewPresetVal(e.target.value)}
                  placeholder="dk (5-180)"
                  style={{
                    width: 96,
                    padding: '6px 9px',
                    borderRadius: 10,
                    border: '1px solid var(--sp-border-strong)',
                    background: 'var(--sp-surface-2)',
                    color: 'var(--sp-ink)',
                    fontSize: 12.5,
                  }}
                />
                <button type="submit" className="sp-btn sp-btn-primary sp-btn-sm">
                  Kaydet
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="sp-btn sp-btn-ghost sp-btn-sm"
                onClick={() => setAddingPreset(true)}
                title="Kendi odak süreni ekle"
              >
                <Plus size={14} /> Süre Oluştur
              </button>
            )}
          </div>
        </div>

        {/* İki Ana Sekme Çubuğu: Haftalık Çalışma Planı vs Koç Ödevlerim */}
        <div
          className="sp-pill-bar"
          style={{
            paddingTop: 4,
            borderTop: '1px solid var(--sp-border)',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            className="sp-pill"
            data-active={mainTab === 'plan' ? '1' : '0'}
            onClick={() => switchMainTab('plan')}
            style={{ padding: '9px 16px', fontSize: 13.5 }}
          >
            <ClipboardList size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
            Haftalık Çalışma Planı
          </button>
          <button
            type="button"
            className="sp-pill"
            data-active={mainTab === 'odevler' ? '1' : '0'}
            onClick={() => switchMainTab('odevler')}
            style={{ padding: '9px 16px', fontSize: 13.5 }}
          >
            <BookOpen size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
            Koç Ödevlerim & İçerik Ağacı
            {activeHwCount > 0 ? ` (${activeHwCount} Aktif)` : ''}
          </button>
          <button
            type="button"
            className="sp-pill"
            data-active={mainTab === 'rozetler' ? '1' : '0'}
            onClick={() => switchMainTab('rozetler')}
            style={{ padding: '9px 16px', fontSize: 13.5 }}
          >
            <Trophy size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
            Rozetler, Seviye & Odak Ligi
            {identity?.gamification
              ? ` (${identity.gamification.unlocked_count}/${identity.gamification.total_count})`
              : ''}
          </button>
        </div>

        {mainTab === 'plan' && workspace ? (
          <div className="sp-kpi-grid" style={{ marginTop: 14 }}>
            <div className="sp-kpi-box">
              <span>Aktif Seri</span>
              <strong>🔥 {workspace.streak_days} Gün</strong>
              <small>Aralıksız çalışma serisi</small>
            </div>
            <div className="sp-kpi-box">
              <span>Haftalık Tamamlama</span>
              <strong>
                %{workspace.active_program ? workspace.active_program.completion_percent : 0}
              </strong>
              <small>
                {workspace.active_program
                  ? `${workspace.active_program.total_questions} hedef soru`
                  : 'Aktif program bekleniyor'}
              </small>
            </div>
            <div className="sp-kpi-box">
              <span>Toplam Odak Süresi</span>
              <strong>{workspace.total_focused_minutes} dk</strong>
              <small>Plan + ödev kayıtlı çalışma</small>
            </div>
            <div className="sp-kpi-box">
              <span>Kazanılan Rozet</span>
              <strong>🏅 {workspace.badges.length}</strong>
              <small>Kişisel başarı vitrini</small>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="sp-skeleton" style={{ height: 320 }} />
      ) : mainTab === 'rozetler' ? (
        <StudentAchievementsArena />
      ) : !workspace ? null : mainTab === 'odevler' ? (
        <StudentHomeworkWorkspace
          assignments={workspace.assignments || workspace.manual_assignments || []}
          summary={workspace.assignments_summary}
          initialAssignmentId={urlAssignmentId}
          onSelectAssignmentId={(id) => switchMainTab('odevler', id)}
          onAssignmentMutated={loadWorkspace}
        />
      ) : (
        <div className="sp-bento-grid">
          {/* Sol Ana Alan: Haftalık Program Blokları */}
          <section className="sp-card sp-col-8">
            {workspace.recent_programs.length > 1 ? (
              <div className="sp-pill-bar" style={{ marginBottom: 14 }}>
                {workspace.recent_programs.map((prog) => (
                  <button
                    key={prog.id}
                    type="button"
                    className="sp-pill"
                    data-active={
                      workspace.active_program?.id === prog.id ? '1' : '0'
                    }
                    onClick={() => setSelectedProgramId(prog.id)}
                  >
                    {prog.title || `${prog.week_start}`} (%{prog.completion_percent})
                  </button>
                ))}
              </div>
            ) : null}

            {!workspace.active_program ? (
              <div className="sp-empty-box">
                <ClipboardList size={32} />
                <p>
                  Koçun henüz aktif bir haftalık çalışma programı yayınlamamış. Üstteki
                  Pomodoro butonlarıyla serbest çalışma başlatabilir veya{' '}
                  <button
                    type="button"
                    className="sp-btn sp-btn-ghost sp-btn-sm"
                    onClick={() => switchMainTab('odevler')}
                    style={{ display: 'inline-flex', verticalAlign: 'middle' }}
                  >
                    Koç Ödevlerim
                  </button>{' '}
                  sekmesinden ödev içeriklerine geçebilirsin.
                </p>
              </div>
            ) : (
              <>
                {workspace.active_program.coach_note ? (
                  <div
                    className="sp-row-card"
                    style={{
                      marginBottom: 14,
                      background: 'var(--sp-accent-soft)',
                      borderColor: 'transparent',
                    }}
                  >
                    <div className="sp-row-left">
                      <MessageSquareQuote size={20} color="var(--sp-accent)" />
                      <div className="sp-row-copy">
                        <strong>
                          Koçunun Haftalık Notu
                          {workspace.active_program.coach_name
                            ? ` (${workspace.active_program.coach_name})`
                            : ''}
                        </strong>
                        <span style={{ color: 'var(--sp-ink-2)' }}>
                          {workspace.active_program.coach_note}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Gün Seçici */}
                <div className="sp-pill-bar" style={{ marginBottom: 16 }}>
                  {workspace.active_program.days.map((day) => (
                    <button
                      key={day.id}
                      type="button"
                      className="sp-pill"
                      data-active={activeDay?.id === day.id ? '1' : '0'}
                      onClick={() => setSelectedDayId(day.id)}
                    >
                      {day.day_label}
                      {day.is_today ? ' (Bugün)' : ''} · %{day.completion_percent}
                    </button>
                  ))}
                </div>

                {activeDay ? (
                  <>
                    {activeDay.coach_note ? (
                      <p
                        style={{
                          margin: '0 0 12px',
                          fontSize: 13,
                          color: 'var(--sp-muted)',
                        }}
                      >
                        📌 Günün koç notu: {activeDay.coach_note}
                      </p>
                    ) : null}

                    {activeDay.is_off_day ? (
                      <div className="sp-empty-box">
                        <p>Koçun bu günü dinlenme / izin günü olarak işaretlemiş. 🌿</p>
                      </div>
                    ) : activeDay.blocks.length === 0 ? (
                      <div className="sp-empty-box">
                        <p>Bu gün için görev bloğu bulunmuyor.</p>
                      </div>
                    ) : (
                      <div className="sp-stack">
                        {activeDay.blocks.map((block) => (
                          <div key={block.id} className="sp-row-card">
                            <div className="sp-row-left">
                              <button
                                type="button"
                                className="sp-icon-btn"
                                disabled={busyBlockId === block.id}
                                onClick={() => handleToggleBlock(block)}
                              >
                                {block.is_completed ? (
                                  <CheckCircle2 size={18} color="var(--sp-emerald)" />
                                ) : (
                                  <Circle size={18} />
                                )}
                              </button>
                              <div className="sp-row-copy">
                                <strong
                                  style={{
                                    textDecoration: block.is_completed
                                      ? 'line-through'
                                      : 'none',
                                    opacity: block.is_completed ? 0.65 : 1,
                                  }}
                                >
                                  <span
                                    className="sp-dot"
                                    style={{
                                      backgroundColor: block.color,
                                      marginRight: 7,
                                      verticalAlign: -1,
                                    }}
                                  />
                                  {block.subject}
                                  {block.topic ? ` — ${block.topic}` : ''}
                                </strong>
                                <span>
                                  {block.task_type_label} · Hedef {block.duration_minutes} dk
                                  {block.question_count
                                    ? ` · ${block.question_count} soru`
                                    : ''}
                                  {block.resource_name
                                    ? ` · ${block.resource_name}`
                                    : ''}
                                  {block.page_range ? ` (s. ${block.page_range})` : ''}
                                </span>
                                {block.description ? (
                                  <span style={{ marginTop: 2 }}>{block.description}</span>
                                ) : null}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {block.actual_duration ? (
                                <span className="sp-chip sp-chip-emerald">
                                  {block.actual_duration} dk çalışıldı
                                </span>
                              ) : null}
                              {!block.is_completed ? (
                                <button
                                  type="button"
                                  className="sp-btn sp-btn-primary sp-btn-sm"
                                  onClick={() => startFocus({ block, mode: 'pomodoro' })}
                                >
                                  <Play size={13} />
                                  <span>Odak Başlat</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </>
            )}
          </section>

          {/* Sağ Sütun: Gün Sonu 30 Saniye Check-in & Rozetler */}
          <div className="sp-col-4 sp-stack" style={{ gap: 18 }}>
            {activeDay ? (
              <section className="sp-card">
                <div className="sp-card-header">
                  <div>
                    <span className="sp-eyebrow">Koçuna Anında Düşer</span>
                    <h2>30 Saniye Gün Sonu Check-in</h2>
                  </div>
                </div>

                <form onSubmit={handleFeedbackSubmit} className="sp-stack">
                  <div className="sp-field">
                    <span>Bugünkü görevlerde zorlandın mı?</span>
                    <div className="sp-pill-bar">
                      {[
                        { code: 'KOLAY', label: '😌 Rahattı' },
                        { code: 'ORTA', label: '👍 Dengeliydi' },
                        { code: 'ZOR', label: '🔥 Zorlandım' },
                      ].map((opt) => (
                        <button
                          key={opt.code}
                          type="button"
                          className="sp-pill"
                          data-active={fbDifficulty === opt.code ? '1' : '0'}
                          onClick={() => setFbDifficulty(opt.code)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sp-field">
                    <span>Planlanan süre yeterli geldi mi?</span>
                    <div className="sp-pill-bar">
                      <button
                        type="button"
                        className="sp-pill"
                        data-active={fbTimeSufficient ? '1' : '0'}
                        onClick={() => setFbTimeSufficient(true)}
                      >
                        Evet, yetti
                      </button>
                      <button
                        type="button"
                        className="sp-pill"
                        data-active={!fbTimeSufficient ? '1' : '0'}
                        onClick={() => setFbTimeSufficient(false)}
                      >
                        Hayır, yetişmedi
                      </button>
                    </div>
                  </div>

                  <label className="sp-field">
                    <span>Takıldığın / anlamadığın konu (opsiyonel)</span>
                    <input
                      type="text"
                      value={fbUnclearTopic}
                      onChange={(e) => setFbUnclearTopic(e.target.value)}
                      placeholder="Örn: Türev artan-azalan aralıklar"
                    />
                  </label>

                  <label className="sp-field">
                    <span>Koçuna kısa not</span>
                    <textarea
                      rows={2}
                      value={fbNote}
                      onChange={(e) => setFbNote(e.target.value)}
                      placeholder="Günün nasıl geçti?"
                    />
                  </label>

                  {fbSavedBanner ? (
                    <span className="sp-chip sp-chip-emerald">
                      ✓ Geri bildirimin koçunun ekranına iletildi.
                    </span>
                  ) : null}

                  <button
                    type="submit"
                    className="sp-btn sp-btn-primary"
                    disabled={fbSaving}
                  >
                    <Send size={15} />
                    <span>{fbSaving ? 'Gönderiliyor…' : 'Check-in Kaydet'}</span>
                  </button>
                </form>
              </section>
            ) : null}

            {/* Aktif Ödevler Hızlı Köprüsü */}
            {activeHwCount > 0 ? (
              <section className="sp-card">
                <div className="sp-card-header">
                  <div>
                    <span className="sp-eyebrow">Kaynak & Test Takibi</span>
                    <h2>Koç Ödevlerim ({activeHwCount})</h2>
                  </div>
                  <button
                    type="button"
                    className="sp-btn sp-btn-secondary sp-btn-sm"
                    onClick={() => switchMainTab('odevler')}
                  >
                    İçerikleri Aç
                  </button>
                </div>
                <div className="sp-stack">
                  {(workspace.assignments || []).slice(0, 3).map((hw) => (
                    <button
                      key={hw.id}
                      type="button"
                      className="sp-row-card"
                      onClick={() => switchMainTab('odevler', hw.id)}
                      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
                    >
                      <div className="sp-row-copy">
                        <strong>
                          <span
                            className="sp-dot"
                            style={{
                              backgroundColor: hw.color,
                              marginRight: 7,
                              verticalAlign: -1,
                            }}
                          />
                          {hw.title}
                        </strong>
                        <span>
                          {hw.ready_task_count}/{hw.task_count} test hazır
                          {hw.due_date ? ` · Kontrol: ${hw.due_date}` : ''}
                        </span>
                      </div>
                      <span className="sp-chip">{hw.status_label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Rozet Vitrini */}
            <section className="sp-card">
              <div className="sp-card-header">
                <div>
                  <span className="sp-eyebrow">Oyunlaştırma</span>
                  <h2>Rozet Koleksiyonum</h2>
                </div>
                <button
                  type="button"
                  className="sp-btn sp-btn-secondary sp-btn-sm"
                  onClick={() => switchMainTab('rozetler')}
                >
                  Tüm Hedefler & Lig
                </button>
              </div>

              {workspace.badges.length === 0 ? (
                <div className="sp-empty-box" style={{ padding: '18px 10px' }}>
                  <Award size={26} />
                  <p>
                    Günün tüm görevlerini tamamladığında veya 3 gün seri yaptığında ilk
                    rozetin burada açılacak!
                  </p>
                </div>
              ) : (
                <div className="sp-stack">
                  {workspace.badges.slice(0, 8).map((b) => (
                    <div key={b.id} className="sp-row-card">
                      <div className="sp-row-left">
                        <span style={{ fontSize: 22 }}>{b.icon}</span>
                        <div className="sp-row-copy">
                          <strong>{b.title}</strong>
                          <span>{b.description}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}

export default function StudentStudyAndFocusPage() {
  return (
    <Suspense fallback={<div className="sp-skeleton" style={{ height: 340 }} />}>
      <StudentStudyAndFocusInner />
    </Suspense>
  );
}
