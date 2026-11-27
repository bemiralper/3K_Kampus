'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CalendarClock,
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Layers,
  Lock,
  Medal,
  Pin,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react';
import {
  studentPortalApi,
  type AchievementCatalogItem,
  type StudentAchievementsResponse,
} from '@/lib/student-portal-api';
import { useStudentPortal } from '@/lib/student-portal-context';

function rarityVisuals(rarity: AchievementCatalogItem['rarity']) {
  switch (rarity) {
    case 'mythic':
      return {
        label: 'Zirve Efsanesi',
        border: 'rgba(225, 29, 72, 0.55)',
        glow: 'radial-gradient(circle at top right, rgba(225, 29, 72, 0.22), rgba(245, 158, 11, 0.08) 45%, transparent 72%)',
        chipClass: 'sp-chip sp-chip-warm',
      };
    case 'legendary':
      return {
        label: 'Efsanevi',
        border: 'rgba(245, 158, 11, 0.55)',
        glow: 'radial-gradient(circle at top right, rgba(245, 158, 11, 0.2), transparent 65%)',
        chipClass: 'sp-chip sp-chip-warm',
      };
    case 'epic':
      return {
        label: 'Destansı',
        border: 'rgba(124, 58, 237, 0.45)',
        glow: 'radial-gradient(circle at top right, rgba(124, 58, 237, 0.16), transparent 65%)',
        chipClass: 'sp-chip sp-chip-accent',
      };
    case 'rare':
      return {
        label: 'Nadir',
        border: 'rgba(37, 99, 235, 0.4)',
        glow: 'radial-gradient(circle at top right, rgba(37, 99, 235, 0.14), transparent 65%)',
        chipClass: 'sp-chip sp-chip-accent',
      };
    default:
      return {
        label: 'Temel',
        border: 'rgba(16, 185, 129, 0.4)',
        glow: 'radial-gradient(circle at top right, rgba(16, 185, 129, 0.14), transparent 65%)',
        chipClass: 'sp-chip sp-chip-emerald',
      };
  }
}

export default function StudentAchievementsArena() {
  const { refreshIdentity, studyRefreshNonce } = useStudentPortal();
  const [data, setData] = useState<StudentAchievementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [tierViewMode, setTierViewMode] = useState<'active' | 'marathon'>('active');
  const [pinningCode, setPinningCode] = useState<string | null>(null);
  const [togglingOptIn, setTogglingOptIn] = useState(false);

  const loadArena = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await studentPortalApi.achievements();
      setData(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Başarı vitrini yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArena();
  }, [loadArena, studyRefreshNonce]);

  const filteredBadges = useMemo(() => {
    if (!data) return [];
    return data.badges
      .filter((b) => (selectedCategory === 'all' ? true : b.category === selectedCategory))
      .filter((b) => {
        if (tierViewMode === 'active' && !b.is_unlocked && b.is_active_tier === false) {
          return false;
        }
        return true;
      })
      .filter((b) => {
        if (statusFilter === 'unlocked') return b.is_unlocked;
        if (statusFilter === 'locked') return !b.is_unlocked;
        return true;
      })
      .sort((a, b) => {
        // Önce kazanılanlar, sonra sıradaki aktif kademeler, sonra açılmaya en yakın yüzde!
        if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? -1 : 1;
        const aAct = a.is_active_tier !== false ? 1 : 0;
        const bAct = b.is_active_tier !== false ? 1 : 0;
        if (aAct !== bAct) return bAct - aAct;
        return b.progress_percent - a.progress_percent;
      });
  }, [data, selectedCategory, statusFilter, tierViewMode]);

  const handlePinBadge = async (code: string) => {
    setPinningCode(code);
    try {
      const updated = await studentPortalApi.updateAchievementPreferences({
        pinned_badge_code: code,
      });
      setData(updated);
      await refreshIdentity();
    } catch {
      // Kullanıcı dostu sessiz koruma
    } finally {
      setPinningCode(null);
    }
  };

  const handleToggleLeaderboardOptIn = async () => {
    if (!data?.leaderboard) return;
    setTogglingOptIn(true);
    try {
      const updated = await studentPortalApi.updateAchievementPreferences({
        leaderboard_opt_in: !data.leaderboard.opt_in,
      });
      setData(updated);
    } catch {
      // Kullanıcı dostu sessiz koruma
    } finally {
      setTogglingOptIn(false);
    }
  };

  if (loading) {
    return <div className="sp-skeleton" style={{ height: 380 }} />;
  }
  if (errorMsg || !data) {
    return (
      <div className="sp-card sp-empty-box" style={{ padding: 28 }}>
        <Trophy size={30} color="var(--sp-warm)" />
        <p style={{ margin: '8px 0 12px' }}>
          {errorMsg || 'Başarı vitrini şu anda görüntülenemedi.'}
        </p>
        <button type="button" className="sp-btn sp-btn-primary sp-btn-sm" onClick={loadArena}>
          Tekrar Dene
        </button>
      </div>
    );
  }

  const { level, summary, closest_target, pinned_badge, leaderboard, student_track, monthly_season } = data;
  const maxLevel = level.max_level || 50;

  return (
    <div className="sp-stack" style={{ gap: 18 }}>
      {/* 1. Üst Seviye / XP Hero Kartı + Açılmaya En Yakın Hedef Rozet */}
      <div className="sp-bento-grid">
        <section
          className="sp-card sp-col-7"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(245, 158, 11, 0.16), transparent 60%), var(--sp-surface)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  background: 'linear-gradient(135deg, var(--sp-accent), #7c3aed)',
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 28,
                  boxShadow: '0 10px 24px rgba(37, 99, 235, 0.26)',
                  flexShrink: 0,
                }}
              >
                {level.rank_icon}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="sp-chip sp-chip-accent">
                    Seviye {level.level} / {maxLevel}
                  </span>
                  <span className="sp-chip sp-chip-warm">{level.total_xp} XP</span>
                  {student_track ? (
                    <span className="sp-chip sp-chip-emerald">🎯 {student_track.label}</span>
                  ) : null}
                </div>
                <h2 style={{ margin: '6px 0 2px', fontSize: 21 }}>{level.rank_title}</h2>
                <span style={{ fontSize: 13, color: 'var(--sp-muted)' }}>
                  {level.next_rank_title
                    ? `Sonraki ünvan: Seviye ${level.next_rank_level} · ${level.next_rank_title}`
                    : 'En üst 50. seviye kampüs efsanesi rütbesine ulaştın!'}
                </span>
              </div>
            </div>

            {pinned_badge ? (
              <div
                className="sp-row-card"
                style={{
                  padding: '8px 12px',
                  background: 'var(--sp-surface-2)',
                  gap: 9,
                }}
              >
                <span style={{ fontSize: 24 }}>{pinned_badge.icon}</span>
                <div className="sp-row-copy">
                  <span style={{ fontSize: 11, color: 'var(--sp-muted)' }}>Vitrin Rozetim</span>
                  <strong style={{ fontSize: 13 }}>{pinned_badge.title}</strong>
                </div>
              </div>
            ) : null}
          </div>

          {/* Seviye XP İlerleme Çubuğu */}
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12.5,
                marginBottom: 6,
              }}
            >
              <strong>
                {level.level >= maxLevel
                  ? `Maksimum Seviye (${maxLevel})`
                  : `Seviye ${level.level} → Seviye ${level.level + 1}`}
              </strong>
              <span style={{ color: 'var(--sp-muted)' }}>
                {level.level >= maxLevel
                  ? 'Zirve tamamlandı!'
                  : `${level.xp_to_next_level} XP kaldı (${level.current_level_xp}/${level.next_level_xp_span})`}
              </span>
            </div>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: 'var(--sp-border-strong)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${level.level_progress_percent}%`,
                  background: 'linear-gradient(90deg, var(--sp-accent), #f59e0b)',
                  transition: 'width 0.35s ease',
                }}
              />
            </div>
          </div>

          {/* Alt 4 Mini Metrik */}
          <div
            className="sp-kpi-grid"
            style={{
              marginTop: 16,
              gridTemplateColumns: 'repeat(auto-fit, minmax(125px, 1fr))',
            }}
          >
            <div className="sp-kpi-box">
              <span>Açılan Rozet</span>
              <strong>
                {summary.unlocked_count} / {summary.total_count}
              </strong>
              <small>Tam sezon %{summary.completion_percent}</small>
            </div>
            <div className="sp-kpi-box">
              <span>En Uzun Seri</span>
              <strong>🔥 {summary.best_streak} Gün</strong>
              <small>Aktif: {summary.streak_days} gün</small>
            </div>
            <div className="sp-kpi-box">
              <span>Toplam Odak</span>
              <strong>{summary.total_focus_minutes} dk</strong>
              <small>~{Math.round((summary.total_focus_minutes / 60) * 10) / 10} saat odak</small>
            </div>
            <div className="sp-kpi-box">
              <span>Sezon Sorusu</span>
              <strong>{(summary.total_season_questions ?? 0).toLocaleString('tr-TR')}</strong>
              <small>100.000 soru maratonu</small>
            </div>
          </div>
        </section>

        {/* Sağ Kart: Açılmaya En Yakın Hedef Rozet (Sıradaki Aktif Kademe) */}
        <section
          className="sp-card sp-col-5"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderColor: 'rgba(245, 158, 11, 0.45)',
            background:
              'radial-gradient(circle at bottom left, rgba(245, 158, 11, 0.12), transparent 65%), var(--sp-surface)',
          }}
        >
          <div>
            <div className="sp-card-header" style={{ marginBottom: 8 }}>
              <span className="sp-chip sp-chip-warm">
                <Target size={13} /> Sıradaki Aktif Hedefin
              </span>
              {closest_target ? (
                <span className="sp-chip">+{closest_target.xp_reward} XP</span>
              ) : null}
            </div>

            {!closest_target ? (
              <div className="sp-empty-box" style={{ padding: '18px 10px' }}>
                <Crown size={30} color="var(--sp-warm)" />
                <p>İnanılmaz! Tüm sezon rozetlerinin kilidini açtın!</p>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 18,
                      background: 'var(--sp-surface-2)',
                      border: '1.5px dashed var(--sp-warm)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 28,
                      flexShrink: 0,
                    }}
                  >
                    {closest_target.icon}
                  </div>
                  <div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                      {closest_target.tier_level && closest_target.tier_total ? (
                        <span className="sp-chip" style={{ fontSize: 10.5, padding: '2px 7px' }}>
                          Kademe {closest_target.tier_level}/{closest_target.tier_total} ·{' '}
                          {closest_target.tier_label}
                        </span>
                      ) : null}
                      {closest_target.track_badge_label ? (
                        <span
                          className="sp-chip sp-chip-accent"
                          style={{ fontSize: 10.5, padding: '2px 7px' }}
                        >
                          {closest_target.track_badge_label}
                        </span>
                      ) : null}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 17 }}>{closest_target.title}</h3>
                    <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--sp-muted)' }}>
                      {closest_target.description}
                    </p>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 12.5,
                      marginBottom: 6,
                    }}
                  >
                    <strong>
                      İlerleme: {closest_target.current_value} / {closest_target.target_value}{' '}
                      {closest_target.unit}
                    </strong>
                    <strong style={{ color: 'var(--sp-warm)' }}>
                      %{closest_target.progress_percent}
                    </strong>
                  </div>
                  <div
                    style={{
                      height: 9,
                      borderRadius: 999,
                      background: 'var(--sp-border-strong)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(6, closest_target.progress_percent)}%`,
                        background: 'var(--sp-warm)',
                      }}
                    />
                  </div>
                  <p
                    style={{
                      margin: '10px 0 0',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--sp-ink)',
                    }}
                  >
                    🔥 {closest_target.motivation_text}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* 1B. Her Ay Yenilenen "Aylık Sezon Meydan Okumaları" & Kalıcı Sezon Madalyaları */}
      {monthly_season ? (
        <section
          className="sp-card"
          style={{
            borderColor: monthly_season.season_medal_unlocked
              ? 'rgba(16, 185, 129, 0.5)'
              : 'rgba(37, 99, 235, 0.35)',
            background:
              'radial-gradient(circle at top left, rgba(37, 99, 235, 0.1), transparent 55%), var(--sp-surface)',
          }}
        >
          <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="sp-eyebrow">Her Ayın 1’inde Sıfırlanan Görevler</span>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0 0' }}>
                <Medal size={20} color="var(--sp-warm)" />
                <span>{monthly_season.month_label} Sezon Meydan Okumaları</span>
              </h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="sp-chip">
                <CalendarClock size={13} /> Yeni sezona {monthly_season.days_remaining} gün
              </span>
              <span
                className={`sp-chip ${
                  monthly_season.season_medal_unlocked ? 'sp-chip-emerald' : 'sp-chip-warm'
                }`}
              >
                {monthly_season.season_medal_unlocked
                  ? `🏅 ${monthly_season.season_medal_title} Kazanıldı! (+${monthly_season.season_medal_xp} XP)`
                  : `🎯 ${monthly_season.completed_quests_count}/${monthly_season.total_quests_count} Görev (3 Görevde +${monthly_season.season_medal_xp} XP Sezon Madalyası)`}
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))',
              gap: 12,
              marginTop: 6,
            }}
          >
            {monthly_season.quests.map((q) => (
              <div
                key={q.code}
                className="sp-row-card"
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 10,
                  padding: 13,
                  borderColor: q.is_completed ? 'rgba(16, 185, 129, 0.5)' : 'var(--sp-border)',
                  background: q.is_completed ? 'var(--sp-emerald-soft)' : 'var(--sp-surface-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 22 }}>{q.icon}</span>
                    <div>
                      <strong style={{ fontSize: 13.5, display: 'block' }}>{q.title}</strong>
                      <span style={{ fontSize: 11.5, color: 'var(--sp-muted)' }}>{q.description}</span>
                    </div>
                  </div>
                  {q.is_completed ? (
                    <CheckCircle2 size={18} color="var(--sp-emerald)" style={{ flexShrink: 0 }} />
                  ) : null}
                </div>

                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11.5,
                      marginBottom: 4,
                    }}
                  >
                    <span>
                      {q.current_value.toLocaleString('tr-TR')} / {q.target_value.toLocaleString('tr-TR')}{' '}
                      {q.unit}
                    </span>
                    <strong>%{q.progress_percent}</strong>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: 'var(--sp-border-strong)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${q.progress_percent}%`,
                        background: q.is_completed ? 'var(--sp-emerald)' : 'var(--sp-accent)',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {monthly_season.earned_medals.length > 0 ? (
            <div
              style={{
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid var(--sp-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sp-muted)' }}>
                Kazanılan Sezon Madalyaların:
              </span>
              {monthly_season.earned_medals.map((med) => (
                <span key={med.month_key} className="sp-chip sp-chip-warm">
                  {med.icon} {med.title}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* 2. Ana Bölüm: Sol/Ana Rozet Koleksiyonu (Kazanılan + Kilitli Kademeler) & Sağ Şube Haftalık Odak Ligi */}
      <div className="sp-bento-grid">
        <section className="sp-card sp-col-8">
          <div className="sp-card-header" style={{ flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="sp-eyebrow">
                {summary.total_count} Tam Sezon Kilidi · Bronz → Efsane Evrimli
              </span>
              <h2>Rozet Koleksiyonum & Alan Hedefleri</h2>
            </div>

            <div className="sp-pill-bar">
              {[
                {
                  code: 'active' as const,
                  label: `Sıradaki Kademeler (${summary.active_view_count ?? filteredBadges.length})`,
                },
                {
                  code: 'marathon' as const,
                  label: `Tüm Maraton (${summary.total_count})`,
                },
              ].map((tm) => (
                <button
                  key={tm.code}
                  type="button"
                  className="sp-pill"
                  data-active={tierViewMode === tm.code ? '1' : '0'}
                  onClick={() => setTierViewMode(tm.code)}
                  title={
                    tm.code === 'active'
                      ? 'Her kademeli rozet zincirinde kazandıklarını ve sıradaki ilk hedef kademeyi gösterir'
                      : '500 saat odak, 100.000 soru ve derece netlerine kadar tüm sezon basamaklarını gösterir'
                  }
                >
                  <Layers size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                  {tm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Durum + Kategori Filtreleri */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            <div className="sp-pill-bar">
              {data.categories.map((cat) => (
                <button
                  key={cat.code}
                  type="button"
                  className="sp-pill"
                  data-active={selectedCategory === cat.code ? '1' : '0'}
                  onClick={() => setSelectedCategory(cat.code)}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="sp-pill-bar">
              {[
                { code: 'all' as const, label: 'Tümü' },
                { code: 'unlocked' as const, label: `Açılanlar (${summary.unlocked_count})` },
                {
                  code: 'locked' as const,
                  label: 'Kilitli Hedefler',
                },
              ].map((st) => (
                <button
                  key={st.code}
                  type="button"
                  className="sp-pill"
                  data-active={statusFilter === st.code ? '1' : '0'}
                  onClick={() => setStatusFilter(st.code)}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))',
              gap: 12,
            }}
          >
            {filteredBadges.map((b) => {
              const rv = rarityVisuals(b.rarity);
              const isPinned = pinned_badge?.code === b.code;

              return (
                <div
                  key={b.code}
                  className="sp-row-card"
                  style={{
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: 15,
                    borderColor: b.is_unlocked ? rv.border : 'var(--sp-border)',
                    background: b.is_unlocked ? `${rv.glow}, var(--sp-surface)` : 'var(--sp-surface-2)',
                    opacity: b.is_unlocked ? 1 : b.is_active_tier === false ? 0.72 : 0.9,
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 46,
                            height: 46,
                            borderRadius: 14,
                            background: b.is_unlocked ? 'var(--sp-surface-2)' : 'var(--sp-surface)',
                            border: '1px solid var(--sp-border)',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 24,
                            filter: b.is_unlocked ? 'none' : 'grayscale(0.85)',
                            position: 'relative',
                            flexShrink: 0,
                          }}
                        >
                          {b.icon}
                          {!b.is_unlocked ? (
                            <span
                              style={{
                                position: 'absolute',
                                right: -4,
                                bottom: -4,
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                background: 'var(--sp-ink)',
                                color: 'var(--sp-surface)',
                                display: 'grid',
                                placeItems: 'center',
                              }}
                            >
                              <Lock size={10} />
                            </span>
                          ) : null}
                        </div>

                        <div>
                          <strong style={{ fontSize: 14, display: 'block' }}>{b.title}</strong>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              flexWrap: 'wrap',
                              marginTop: 2,
                            }}
                          >
                            <span style={{ fontSize: 11.5, color: 'var(--sp-muted)' }}>
                              {b.track_badge_label || b.category_label}
                            </span>
                            {b.tier_level && b.tier_total ? (
                              <span
                                style={{
                                  fontSize: 10.5,
                                  padding: '1px 6px',
                                  borderRadius: 999,
                                  background: 'var(--sp-surface)',
                                  border: '1px solid var(--sp-border)',
                                  fontWeight: 600,
                                }}
                              >
                                Kademe {b.tier_level}/{b.tier_total} · {b.tier_label}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <span className={b.is_unlocked ? rv.chipClass : 'sp-chip'}>
                        +{b.xp_reward} XP
                      </span>
                    </div>

                    <p
                      style={{
                        margin: '10px 0 0',
                        fontSize: 12.5,
                        color: 'var(--sp-ink-2)',
                        lineHeight: 1.45,
                      }}
                    >
                      {b.description}
                    </p>
                  </div>

                  {/* Alt İlerleme veya Vitrin Aksiyonu */}
                  <div>
                    {!b.is_unlocked ? (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11.5,
                            marginBottom: 4,
                            color: 'var(--sp-muted)',
                          }}
                        >
                          <span>
                            {b.current_value} / {b.target_value} {b.unit}
                          </span>
                          <strong>%{b.progress_percent}</strong>
                        </div>
                        <div
                          style={{
                            height: 6,
                            borderRadius: 999,
                            background: 'var(--sp-border-strong)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${b.progress_percent}%`,
                              background: 'var(--sp-accent)',
                            }}
                          />
                        </div>
                        <span
                          style={{
                            display: 'block',
                            marginTop: 6,
                            fontSize: 11.5,
                            color: 'var(--sp-warm)',
                            fontWeight: 600,
                          }}
                        >
                          {b.motivation_text}
                        </span>
                      </>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          paddingTop: 8,
                          borderTop: '1px solid var(--sp-border)',
                        }}
                      >
                        <span style={{ fontSize: 11.5, color: 'var(--sp-emerald)', fontWeight: 600 }}>
                          <Sparkles size={12} style={{ verticalAlign: -2, marginRight: 3 }} />
                          Kazanıldı {b.earned_at ? `(${b.earned_at})` : ''}
                        </span>
                        <button
                          type="button"
                          className={`sp-btn ${isPinned ? 'sp-btn-primary' : 'sp-btn-ghost'} sp-btn-sm`}
                          disabled={pinningCode === b.code || isPinned}
                          onClick={() => handlePinBadge(b.code)}
                          style={{ padding: '4px 9px', fontSize: 11.5 }}
                        >
                          <Pin size={12} />
                          <span>{isPinned ? 'Vitrinde' : 'Profile İğnele'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Sağ Sütun: Şube Haftalık Odak Ligi */}
        <aside className="sp-col-4 sp-stack" style={{ gap: 16 }}>
          {leaderboard ? (
            <section className="sp-card">
              <div className="sp-card-header">
                <div>
                  <span className="sp-eyebrow">{leaderboard.scope_label}</span>
                  <h2>
                    <Trophy
                      size={18}
                      color="var(--sp-warm)"
                      style={{ verticalAlign: -3, marginRight: 6 }}
                    />
                    Haftalık Odak Ligi
                  </h2>
                </div>
                <span className="sp-chip sp-chip-accent">#{leaderboard.my_rank}. Sıra</span>
              </div>

              {leaderboard.minutes_to_overtake_next != null ? (
                <div
                  className="sp-row-card"
                  style={{
                    marginBottom: 12,
                    background: 'var(--sp-warm-soft)',
                    borderColor: 'transparent',
                  }}
                >
                  <div className="sp-row-left">
                    <Flame size={18} color="var(--sp-warm)" />
                    <div className="sp-row-copy">
                      <strong>Bir üst sıraya çok yakınsın!</strong>
                      <span style={{ color: 'var(--sp-ink)' }}>
                        <strong>{leaderboard.minutes_to_overtake_next} dk</strong> daha odaklanırsan{' '}
                        <strong>#{leaderboard.my_rank - 1}. sıraya</strong> yükseliyorsun!
                      </span>
                    </div>
                  </div>
                </div>
              ) : leaderboard.my_rank === 1 && leaderboard.my_weekly_focus_minutes > 0 ? (
                <div
                  className="sp-row-card"
                  style={{
                    marginBottom: 12,
                    background: 'var(--sp-emerald-soft)',
                    borderColor: 'transparent',
                  }}
                >
                  <div className="sp-row-left">
                    <Crown size={18} color="var(--sp-emerald)" />
                    <div className="sp-row-copy">
                      <strong>Şube Zirvesindesin!</strong>
                      <span>Bu hafta şubede en çok odaklanan öğrenci sensin. Liderliği koru!</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="sp-stack" style={{ gap: 8 }}>
                {leaderboard.entries.map((row) => {
                  const medal =
                    row.rank === 1
                      ? '🥇'
                      : row.rank === 2
                        ? '🥈'
                        : row.rank === 3
                          ? '🥉'
                          : `#${row.rank}`;
                  return (
                    <div
                      key={`${row.rank}-${row.display_name}`}
                      className="sp-row-card"
                      style={{
                        padding: '10px 12px',
                        borderColor: row.is_me ? 'var(--sp-accent)' : undefined,
                        background: row.is_me ? 'var(--sp-accent-soft)' : undefined,
                      }}
                    >
                      <div className="sp-row-left">
                        <strong
                          style={{
                            minWidth: 28,
                            textAlign: 'center',
                            fontSize: row.rank <= 3 ? 18 : 13,
                          }}
                        >
                          {medal}
                        </strong>
                        <div className="sp-row-copy">
                          <strong>{row.display_name}</strong>
                          <span>{row.classroom || 'Kampüs Öğrencisi'}</span>
                        </div>
                      </div>
                      <strong style={{ fontSize: 13.5, color: 'var(--sp-accent)' }}>
                        {row.weekly_focus_minutes} dk
                      </strong>
                    </div>
                  );
                })}
              </div>

              {/* Gizlilik Tercihi */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '1px solid var(--sp-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 11.5, color: 'var(--sp-muted)' }}>
                  Diğer öğrencilere ismin yalnızca baş harfle (<strong>A*** B.</strong>) görünür.
                </span>
                <button
                  type="button"
                  className="sp-btn sp-btn-ghost sp-btn-sm"
                  disabled={togglingOptIn}
                  onClick={handleToggleLeaderboardOptIn}
                  title="Diğer öğrencilerin lig listesinde görünürlüğünü aç/kapat"
                >
                  {leaderboard.opt_in ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{leaderboard.opt_in ? 'Ligde Görünür' : 'Gizli Mod'}</span>
                </button>
              </div>
            </section>
          ) : null}

          <section className="sp-card">
            <div className="sp-card-header">
              <div>
                <span className="sp-eyebrow">50 Seviye Yıllık Yolculuk</span>
                <h3 style={{ margin: '2px 0 0', fontSize: 16 }}>Nasıl XP Kazanılır?</h3>
              </div>
              <Award size={18} color="var(--sp-accent)" />
            </div>
            <div className="sp-stack" style={{ fontSize: 12.5, color: 'var(--sp-ink-2)' }}>
              <div className="sp-row-card" style={{ padding: '8px 11px' }}>
                <span>⏱ Her 1 dakika kayıtlı odak</span>
                <strong>+2 XP</strong>
              </div>
              <div className="sp-row-card" style={{ padding: '8px 11px' }}>
                <span>✅ Tamamlanan çalışma bloğu</span>
                <strong>+15 XP</strong>
              </div>
              <div className="sp-row-card" style={{ padding: '8px 11px' }}>
                <span>📕 Kontrolü biten koç ödevi</span>
                <strong>+45 XP</strong>
              </div>
              <div className="sp-row-card" style={{ padding: '8px 11px' }}>
                <span>🏅 Aylık Sezon Madalyası</span>
                <strong>+350 XP</strong>
              </div>
              <div className="sp-row-card" style={{ padding: '8px 11px' }}>
                <span>👑 Kademeli & Alan Rozetleri</span>
                <strong>+50 – +1.800 XP</strong>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
