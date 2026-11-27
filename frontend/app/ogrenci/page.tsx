'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  BookMarked,
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Flame,
  KeySquare,
  MapPin,
  Play,
  Sparkles,
  Ticket,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  studentPortalApi,
  type LivingHomeResponse,
  type StoryCapsule,
  type StudyBlockItem,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

export default function StudentLivingHomePage() {
  const router = useRouter();
  const {
    identity,
    startFocus,
    setPortalCounters,
    studyRefreshNonce,
    pushCelebrationBadges,
  } = useStudentPortal();
  const defaultFocusMins = identity?.preferences?.focus_minutes || 25;

  const [home, setHome] = useState<LivingHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<StoryCapsule | null>(null);
  const [togglingBlockId, setTogglingBlockId] = useState<number | null>(null);

  const loadHome = useCallback(async () => {
    setError(null);
    try {
      const data = await studentPortalApi.home();
      setHome(data);
      setPortalCounters({
        unreadCoach: data.counters.unread_coach_messages,
        unreadAnnouncements: data.counters.unread_announcements,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ana ekran verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [setPortalCounters]);

  useEffect(() => {
    loadHome();
  }, [loadHome, studyRefreshNonce]);

  const handleQuickToggleBlock = async (block: StudyBlockItem) => {
    setTogglingBlockId(block.id);
    try {
      const res = await studentPortalApi.completeStudyBlock(block.id, {
        is_completed: !block.is_completed,
      });
      if (res.new_badges?.length) {
        pushCelebrationBadges(res.new_badges);
      }
      await loadHome();
    } finally {
      setTogglingBlockId(null);
    }
  };

  if (loading) {
    return (
      <>
        <div className="sp-skeleton" style={{ height: 150 }} />
        <div className="sp-bento-grid">
          <div className="sp-skeleton sp-col-7" style={{ height: 280 }} />
          <div className="sp-skeleton sp-col-5" style={{ height: 280 }} />
        </div>
      </>
    );
  }

  if (error || !home) {
    return (
      <div className="sp-card">
        <p className="sp-inline-error">{error || 'Veri yüklenemedi.'}</p>
        <button type="button" className="sp-btn sp-btn-primary" onClick={loadHome}>
          Yeniden Dene
        </button>
      </div>
    );
  }

  const bp = home.boarding_pass;

  return (
    <>
      {/* 1. Saate Duyarlı Canlı Hero */}
      <section className="sp-hero-banner">
        <div className="sp-hero-copy">
          <span
            className="sp-chip"
            style={{
              background: 'rgba(255,255,255,0.16)',
              color: '#fff',
              borderColor: 'transparent',
            }}
          >
            <Sparkles size={13} />
            {home.context_mode === 'exam_day'
              ? 'Sınav Günü Modu'
              : home.context_mode === 'campus_hours'
                ? 'Kampüs Ders Akışı'
                : 'Akşam Odak & Çalışma Modu'}
          </span>
          <h1>{home.greeting_title}</h1>
          <p>{home.greeting_subtitle}</p>
        </div>

        {home.live_or_next_lesson ? (
          <div className="sp-hero-live-capsule">
            <span className="sp-live-dot" />
            <div>
              <strong>
                {home.live_or_next_lesson.state === 'live' ? 'ŞU AN DERSTESİN · ' : 'SIRADAKİ · '}
                {home.live_or_next_lesson.title}
              </strong>
              <span>
                {home.live_or_next_lesson.start_time}
                {home.live_or_next_lesson.end_time
                  ? `–${home.live_or_next_lesson.end_time}`
                  : ''}
                {home.live_or_next_lesson.room_name
                  ? ` · ${home.live_or_next_lesson.room_name}`
                  : ''}
              </span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="sp-btn"
            style={{ background: '#fff', color: '#312e81' }}
            onClick={() =>
              startFocus({
                mode: 'pomodoro',
                minutes: defaultFocusMins,
                customTitle: `${defaultFocusMins} dk Pomodoro Odak`,
              })
            }
          >
            <Flame size={16} />
            <span>{defaultFocusMins} dk Hızlı Odak</span>
          </button>
        )}
      </section>

      {/* 2. Kampüs Story Kapsülleri */}
      {home.stories.length > 0 ? (
        <section aria-label="Kampüs Öne Çıkanlar">
          <div className="sp-stories-strip">
            {home.stories.map((story) => (
              <button
                key={story.id}
                type="button"
                className="sp-story-card"
                onClick={() => setActiveStory(story)}
              >
                <span
                  className={`sp-chip ${
                    story.tone === 'orange'
                      ? 'sp-chip-warm'
                      : story.tone === 'emerald'
                        ? 'sp-chip-emerald'
                        : 'sp-chip-accent'
                  }`}
                >
                  {story.badge}
                </span>
                <strong>{story.title}</strong>
                <p>{story.body}</p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Dijital Sınav Giriş Kartı (Boarding Pass) */}
      {bp ? (
        <section className="sp-boarding-pass" aria-label="Dijital Sınav Giriş Kartı">
          <div className="sp-boarding-main">
            <span
              className="sp-chip"
              style={{
                background: 'rgba(251, 146, 60, 0.22)',
                color: '#fdba74',
                borderColor: 'transparent',
              }}
            >
              <Ticket size={13} />
              Dijital Sınav Giriş Kartı ·{' '}
              {bp.is_today ? 'BUGÜN!' : `${bp.days_left} Gün Kaldı`}
            </span>
            <h3>{bp.exam_name}</h3>
            <div className="sp-boarding-meta">
              <span>
                <CalendarClock size={14} style={{ verticalAlign: -2 }} /> {bp.exam_date} ·{' '}
                {bp.start_time}
              </span>
              <span>
                <Clock size={14} style={{ verticalAlign: -2 }} /> {bp.duration_minutes} dk
              </span>
              <span>{bp.exam_type_label}</span>
            </div>
          </div>

          <div className="sp-boarding-divider" />

          <div className="sp-boarding-stub">
            <div>
              <span>Salon / Derslik</span>
              <strong>{bp.room_name}</strong>
            </div>
            <div>
              <span>Sıra No</span>
              <strong>{bp.seat_no ? `#${bp.seat_no}` : bp.desk_no || '—'}</strong>
            </div>
            <div>
              <span>Öğrenci No</span>
              <strong>{bp.student_no}</strong>
            </div>
            <div>
              <span>Kitapçık</span>
              <strong>{bp.booklet_type || 'A/B'}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {/* 4. Hızlı KPI Şeridi */}
      <section className="sp-kpi-grid">
        <div className="sp-kpi-box">
          <span>Çalışma Serisi</span>
          <strong>🔥 {home.study_summary.streak_days} Gün</strong>
          <small>Toplam {home.study_summary.total_focused_minutes} dk odak</small>
        </div>
        <div className="sp-kpi-box">
          <span>Haftalık Plan</span>
          <strong>%{home.study_summary.week_completion_percent}</strong>
          <small>
            {home.study_summary.badges_count} kazanılan rozet
          </small>
        </div>
        <div className="sp-kpi-box">
          <span>Son Deneme Neti</span>
          <strong>{home.latest_exam ? home.latest_exam.latest_net : '—'}</strong>
          <small>
            {home.latest_exam?.latest_net_delta != null
              ? `${home.latest_exam.latest_net_delta >= 0 ? '+' : ''}${home.latest_exam.latest_net_delta} net değişim`
              : 'Yayınlanan sınav özeti'}
          </small>
        </div>
        <div className="sp-kpi-box">
          <span>Devam Oranı</span>
          <strong>%{home.campus.attendance_rate}</strong>
          <small>Ders & etüt katılımı</small>
        </div>
      </section>

      {/* 4B. Hırslandırıcı Başarı Hedefi & Şube Haftalık Odak Ligi Spotu */}
      {home.achievements_spotlight ? (
        <section
          className="sp-card"
          style={{
            borderColor: 'rgba(245, 158, 11, 0.42)',
            background:
              'radial-gradient(circle at top right, rgba(245, 158, 11, 0.14), transparent 58%), var(--sp-surface)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 13, minWidth: 0, flex: 1 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: 'var(--sp-surface-2)',
                  border: '1.5px dashed var(--sp-warm)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 26,
                  flexShrink: 0,
                }}
              >
                {home.achievements_spotlight.closest_target
                  ? home.achievements_spotlight.closest_target.icon
                  : home.achievements_spotlight.level.rank_icon}
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span className="sp-chip sp-chip-accent">
                    Seviye {home.achievements_spotlight.level.level} ·{' '}
                    {home.achievements_spotlight.level.rank_title}
                  </span>
                  {home.achievements_spotlight.student_track ? (
                    <span className="sp-chip sp-chip-emerald">
                      🎯 {home.achievements_spotlight.student_track.short_label} Kulvarı
                    </span>
                  ) : null}
                  <span className="sp-chip sp-chip-warm">
                    🏅 {home.achievements_spotlight.unlocked_count}/
                    {home.achievements_spotlight.total_count} Rozet
                  </span>
                  {home.achievements_spotlight.monthly_season ? (
                    <span className="sp-chip">
                      {home.achievements_spotlight.monthly_season.season_medal_unlocked
                        ? `🏅 ${home.achievements_spotlight.monthly_season.month_label} Şampiyonu`
                        : `📅 ${home.achievements_spotlight.monthly_season.month_label}: ${home.achievements_spotlight.monthly_season.completed_quests_count}/${home.achievements_spotlight.monthly_season.total_quests_count} Görev`}
                    </span>
                  ) : null}
                  {home.achievements_spotlight.league ? (
                    <span className="sp-chip">
                      🏆 {home.achievements_spotlight.league.scope_label} Odak Ligi: #
                      {home.achievements_spotlight.league.my_rank}. Sıra
                    </span>
                  ) : null}
                </div>

                {home.achievements_spotlight.closest_target ? (
                  <div style={{ marginTop: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 13,
                        marginBottom: 5,
                      }}
                    >
                      <strong>
                        🎯 Açılmaya En Yakın Rozetin:{' '}
                        {home.achievements_spotlight.closest_target.title}
                      </strong>
                      <strong style={{ color: 'var(--sp-warm)' }}>
                        %{home.achievements_spotlight.closest_target.progress_percent}
                      </strong>
                    </div>
                    <div
                      style={{
                        height: 7,
                        borderRadius: 999,
                        background: 'var(--sp-border-strong)',
                        overflow: 'hidden',
                        maxWidth: 520,
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(
                            6,
                            home.achievements_spotlight.closest_target.progress_percent,
                          )}%`,
                          background: 'linear-gradient(90deg, var(--sp-accent), var(--sp-warm))',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        display: 'block',
                        marginTop: 5,
                        fontSize: 12.5,
                        color: 'var(--sp-ink-2)',
                      }}
                    >
                      {home.achievements_spotlight.closest_target.motivation_text}
                      {home.achievements_spotlight.league?.minutes_to_overtake_next != null
                        ? ` · Ligde #${home.achievements_spotlight.league.my_rank - 1}. sıra için ${home.achievements_spotlight.league.minutes_to_overtake_next} dk odak kaldı!`
                        : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <Link
              href="/ogrenci/calisma?tab=rozetler"
              className="sp-btn sp-btn-primary sp-btn-sm"
            >
              <span>Rozetler & Lig</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      ) : null}

      {/* 5. Asimetrik Bento Kokpit */}
      <div className="sp-bento-grid">
        {/* Sol/Ana Sütun: Bugünün Çalışma Görevleri & Odak */}
        <section className="sp-card sp-col-7">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Koçluk & Odak</span>
              <h2>Bugünün Çalışma Görevleri</h2>
            </div>
            <Link href="/ogrenci/calisma" className="sp-btn sp-btn-secondary sp-btn-sm">
              <span>Tüm Hafta</span>
              <ArrowRight size={14} />
            </Link>
          </div>

          {!home.today_study || home.today_study.blocks.length === 0 ? (
            <div className="sp-empty-box">
              <Flame size={28} />
              <p>
                Bugün için tanımlı blok görünmüyor. Serbest Pomodoro başlatarak çalışma
                süreni kaydedebilirsin.
              </p>
              <button
                type="button"
                className="sp-btn sp-btn-primary sp-btn-sm"
                onClick={() =>
                  startFocus({
                    mode: 'pomodoro',
                    minutes: defaultFocusMins,
                    customTitle: 'Serbest Soru Çözümü',
                  })
                }
              >
                <Play size={14} /> {defaultFocusMins} dk Pomodoro Başlat
              </button>
            </div>
          ) : (
            <div className="sp-stack">
              {home.today_study.blocks.map((block) => (
                <div key={block.id} className="sp-row-card">
                  <div className="sp-row-left">
                    <button
                      type="button"
                      className="sp-icon-btn"
                      disabled={togglingBlockId === block.id}
                      onClick={() => handleQuickToggleBlock(block)}
                      title={block.is_completed ? 'Tamamlandı işaretini kaldır' : 'Tamamlandı işaretle'}
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
                          textDecoration: block.is_completed ? 'line-through' : 'none',
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
                        {block.task_type_label} · {block.duration_minutes} dk
                        {block.question_count ? ` · ${block.question_count} soru` : ''}
                        {block.resource_name ? ` · ${block.resource_name}` : ''}
                      </span>
                    </div>
                  </div>

                  {!block.is_completed ? (
                    <button
                      type="button"
                      className="sp-btn sp-btn-primary sp-btn-sm"
                      onClick={() => startFocus({ block, mode: 'pomodoro' })}
                    >
                      <Play size={13} />
                      <span>Odak</span>
                    </button>
                  ) : (
                    <span className="sp-chip sp-chip-emerald">
                      {block.actual_duration ? `${block.actual_duration} dk` : 'Tamam'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sağ Sütun: Bugünün Kampüs Ders Akışı */}
        <section className="sp-card sp-col-5">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Canlı Zaman Çizelgesi</span>
              <h2>Bugünün Ders Programı</h2>
            </div>
            <Link href="/ogrenci/takvim" className="sp-btn sp-btn-ghost sp-btn-sm">
              Takvim <ArrowRight size={14} />
            </Link>
          </div>

          {home.today_schedule.length === 0 ? (
            <div className="sp-empty-box">
              <CalendarClock size={26} />
              <p>Bugün için grup dersi veya özel ders kaydı bulunmuyor.</p>
            </div>
          ) : (
            <div className="sp-stack">
              {home.today_schedule.map((item) => (
                <div
                  key={item.id}
                  className="sp-row-card"
                  data-live={item.state === 'live' ? '1' : '0'}
                >
                  <div className="sp-row-left">
                    <div className="sp-time-pill">
                      {item.all_day ? 'Gün Boyu' : item.start_time || '—'}
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
                      </span>
                    </div>
                  </div>
                  {item.state === 'live' ? (
                    <span className="sp-chip sp-chip-emerald">Canlı</span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alt Sol: Son Sınav Özeti */}
        <section className="sp-card sp-col-6">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Ölçme & Değerlendirme</span>
              <h2>Son Sınav Performansın</h2>
            </div>
            <Link href="/ogrenci/sinavlar" className="sp-btn sp-btn-secondary sp-btn-sm">
              <span>Analiz Radarı</span>
              <TrendingUp size={14} />
            </Link>
          </div>

          {!home.latest_exam ? (
            <div className="sp-empty-box">
              <Award size={28} />
              <p>Henüz açıklanmış bir deneme sınavı sonucun bulunmuyor.</p>
            </div>
          ) : (
            <div className="sp-stack">
              <div className="sp-row-card">
                <div className="sp-row-copy">
                  <strong>{home.latest_exam.latest_exam_name}</strong>
                  <span>
                    Ortalama Netin: {home.latest_exam.average_net} · En Yüksek Netin:{' '}
                    {home.latest_exam.personal_best_net}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: 20, color: 'var(--sp-accent)' }}>
                    {home.latest_exam.latest_net} Net
                  </strong>
                  {home.latest_exam.latest_kurum_rank ? (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--sp-muted)' }}>
                      Kurum #{home.latest_exam.latest_kurum_rank} /{' '}
                      {home.latest_exam.latest_kurum_total}
                    </span>
                  ) : null}
                </div>
              </div>
              {home.latest_exam.latest_badges.length > 0 ? (
                <div className="sp-pill-bar">
                  {home.latest_exam.latest_badges.map((b) => (
                    <span key={b.code} className="sp-chip sp-chip-warm">
                      🏆 {b.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>

        {/* Alt Sağ: Kütüphane Masa & Dolap + Yaklaşan Etkinlikler */}
        <section className="sp-card sp-col-6">
          <div className="sp-card-header">
            <div>
              <span className="sp-eyebrow">Kampüs Yaşamı</span>
              <h2>Etüt Masam, Dolabım & Yaklaşanlar</h2>
            </div>
          </div>

          <div className="sp-kpi-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="sp-row-card">
              <div className="sp-row-left">
                <BookMarked size={18} color="var(--sp-accent)" />
                <div className="sp-row-copy">
                  <strong>
                    {home.campus.seat ? home.campus.seat.label : 'Atanmadı'}
                  </strong>
                  <span>Etüt / Kütüphane Masası</span>
                </div>
              </div>
            </div>
            <div className="sp-row-card">
              <div className="sp-row-left">
                <KeySquare size={18} color="var(--sp-warm)" />
                <div className="sp-row-copy">
                  <strong>
                    {home.campus.locker ? home.campus.locker.label : 'Atanmadı'}
                  </strong>
                  <span>Öğrenci Dolabı</span>
                </div>
              </div>
            </div>
          </div>

          {home.upcoming_items.length > 0 ? (
            <div className="sp-stack" style={{ marginTop: 12 }}>
              {home.upcoming_items.slice(0, 3).map((up) => {
                const targetHref = up.assignment_id
                  ? `/ogrenci/calisma?tab=odevler&assignment=${up.assignment_id}`
                  : up.exam_id
                    ? `/ogrenci/sinavlar?exam=${up.exam_id}`
                    : null;
                return targetHref ? (
                  <Link
                    key={`${up.date}-${up.id}`}
                    href={targetHref}
                    className="sp-row-card"
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <div className="sp-row-left">
                      <MapPin size={16} color={up.color} />
                      <div className="sp-row-copy">
                        <strong>{up.title}</strong>
                        <span>
                          {up.date} {up.start_time ? `· ${up.start_time}` : ''} · {up.subtitle}
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={15} color="var(--sp-muted)" />
                  </Link>
                ) : (
                  <div key={`${up.date}-${up.id}`} className="sp-row-card">
                    <div className="sp-row-left">
                      <MapPin size={16} color={up.color} />
                      <div className="sp-row-copy">
                        <strong>{up.title}</strong>
                        <span>
                          {up.date} {up.start_time ? `· ${up.start_time}` : ''} · {up.subtitle}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      {/* Story Detay Modal */}
      {activeStory ? (
        <div
          className="sp-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveStory(null);
          }}
        >
          <div className="sp-modal-sheet">
            <div className="sp-card-header">
              <span className="sp-chip sp-chip-accent">{activeStory.badge}</span>
              <button
                type="button"
                className="sp-icon-btn"
                onClick={() => setActiveStory(null)}
              >
                <X size={16} />
              </button>
            </div>
            <h2 style={{ marginTop: 0 }}>{activeStory.title}</h2>
            <p style={{ lineHeight: 1.6, color: 'var(--sp-ink-2)', whiteSpace: 'pre-wrap' }}>
              {activeStory.body}
            </p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="sp-btn sp-btn-primary"
                onClick={() => {
                  const href = activeStory.cta_href;
                  setActiveStory(null);
                  router.push(href);
                }}
              >
                <span>{activeStory.cta_label}</span>
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
