'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  fetchNotificationSummary, markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from '@/lib/takvim-api';
import {
  conversationInboxPath,
  extractConversationIdFromUrl,
  fetchNotificationSummary as fetchWhatsAppNotificationSummary,
  inboxPortalDepartment,
  markConversationRead,
  resolveInboxPortal,
  rewriteConversationInboxUrl,
} from '@/lib/communication-api';
import { coachBirthdayHref, isBirthdayNotificationUrl } from '@/lib/coach-birthdays';
import { isGorevNotification } from '@/lib/gorev-notifications';
import {
  playNotificationSound,
  unlockNotificationAudio,
  bindNotificationAudioUnlock,
  isNotificationSoundMuted,
  toggleNotificationSoundMuted,
  getNotificationSoundVolume,
  setNotificationSoundVolume,
} from '@/lib/notification-sound';
import './notification-bell.css';

/* ════════════════════════════════════════════
   🔔 BİLDİRİM ÇANI (Header Badge + Dropdown)
   ════════════════════════════════════════════ */

interface Props {
  /**
   * Polling aralığı (ms). Varsayılan 8 sn.
   * SSE yalnızca Mesajlar ekranında açılır (sync gunicorn worker kilidi);
   * çan polling + `lms:notifications-refresh` dinler.
   */
  pollInterval?: number;
}

function splitTitle(baslik: string): { kicker: string; title: string } {
  const idx = baslik.indexOf(':');
  if (idx > 1 && idx < 36) {
    const title = baslik.slice(idx + 1).trim();
    if (title) return { kicker: baslik.slice(0, idx).trim(), title };
  }
  return { kicker: '', title: baslik };
}

function notifFingerprint(n: AppNotification): string {
  return `${n.id}|${n.created_at}|${n.mesaj}`;
}

function extractConversationId(n: AppNotification): string | null {
  if (n.id.startsWith('wa-')) return n.id.slice(3);
  return extractConversationIdFromUrl(n.url);
}

/** Portal bazlı bildirimler listesi — koç/muhasebe /admin'e yönlendirilmez. */
function notificationsListPath(pathname: string): string {
  if (pathname.startsWith('/coach')) return '/coach/bildirimler';
  if (pathname.startsWith('/muhasebe')) return '/muhasebe/bildirimler';
  return '/admin/takvim/bildirimler';
}

export default function NotificationBell({ pollInterval = 8000 }: Props) {
  const pathname = usePathname() || '';
  const inboxPortal = resolveInboxPortal(pathname);
  const allNotificationsHref = notificationsListPath(pathname);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [soundVolume, setSoundVolume] = useState(85);
  const volumePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const knownKeysRef = useRef<Set<string>>(new Set());
  const recentRef = useRef<AppNotification[]>([]);
  recentRef.current = recent;

  const load = useCallback(async () => {
    const [res, wa] = await Promise.all([
      fetchNotificationSummary(),
      fetchWhatsAppNotificationSummary({
        department: inboxPortalDepartment(inboxPortal),
      }).catch(() => null),
    ]);

    const waCards = wa?.cards || [];
    const waItems: AppNotification[] = waCards.slice(0, 8).map((c) => ({
      id: `wa-${c.id}`,
      baslik: `WhatsApp: ${c.contact_name || c.contact_phone || 'Sohbet'}`,
      mesaj: c.last_message_preview || 'Yeni mesaj',
      ikon: '💬',
      renk: '#25D366',
      url: conversationInboxPath(c.id, inboxPortal),
      event_id: null,
      is_read: false,
      read_at: null,
      created_at: c.last_message_at || c.created_at || new Date().toISOString(),
      alici_tip: 'PERSONEL' as AppNotification['alici_tip'],
    }));
    const waUnread = wa?.unread_conversations ?? wa?.unread_count ?? 0;

    const baseRecent = (res.success && res.data ? (res.data.recent || []) : [])
      .filter((n) => !isGorevNotification(n));
    // Aynı sohbet için hem WA kartı hem AppNotification varsa tek satır göster
    const waUrls = new Set(waItems.map((n) => n.url).filter(Boolean));
    const filteredBase = baseRecent
      .map((n) => {
        const rewritten = rewriteConversationInboxUrl(n.url, inboxPortal);
        return rewritten && rewritten !== n.url ? { ...n, url: rewritten } : n;
      })
      .filter((n) => !(n.url && waUrls.has(n.url)));
    const merged = [...waItems, ...filteredBase].slice(0, 15);

    const unreadKeys = merged.filter((n) => !n.is_read).map(notifFingerprint);
    if (initializedRef.current) {
      const fresh = unreadKeys.filter((k) => !knownKeysRef.current.has(k));
      if (fresh.length > 0) {
        playNotificationSound();
      }
    } else {
      initializedRef.current = true;
    }
    knownKeysRef.current = new Set(unreadKeys);

    const takvimUnread = res.success && res.data ? (res.data.unread_count || 0) : 0;
    const waDupInTakvim = baseRecent.filter(
      (n) => !n.is_read && n.url && (
        waUrls.has(n.url) || waUrls.has(rewriteConversationInboxUrl(n.url, inboxPortal) || '')
      ),
    ).length;
    setUnreadCount(Math.max(0, takvimUnread - waDupInTakvim) + (waUnread || 0));
    setRecent(merged);
  }, [inboxPortal]);

  useEffect(() => {
    setSoundMuted(isNotificationSoundMuted());
    setSoundVolume(getNotificationSoundVolume());
    const onMute = (e: Event) => {
      const detail = (e as CustomEvent<{ muted?: boolean }>).detail;
      if (typeof detail?.muted === 'boolean') setSoundMuted(detail.muted);
      else setSoundMuted(isNotificationSoundMuted());
    };
    const onVolume = (e: Event) => {
      const detail = (e as CustomEvent<{ volume?: number }>).detail;
      if (typeof detail?.volume === 'number') setSoundVolume(detail.volume);
      else setSoundVolume(getNotificationSoundVolume());
      setSoundMuted(isNotificationSoundMuted());
    };
    window.addEventListener('lms:notification-sound-muted', onMute);
    window.addEventListener('lms:notification-sound-volume', onVolume);
    return () => {
      window.removeEventListener('lms:notification-sound-muted', onMute);
      window.removeEventListener('lms:notification-sound-volume', onVolume);
      if (volumePreviewTimer.current) clearTimeout(volumePreviewTimer.current);
    };
  }, []);

  const handleVolumeChange = (value: number) => {
    unlockNotificationAudio();
    setSoundVolume(value);
    setNotificationSoundVolume(value);
    setSoundMuted(value === 0 || isNotificationSoundMuted());
    if (volumePreviewTimer.current) clearTimeout(volumePreviewTimer.current);
    volumePreviewTimer.current = setTimeout(() => {
      if (value > 0) playNotificationSound();
    }, 120);
  };

  useEffect(() => {
    bindNotificationAudioUnlock();
    load();
    const id = setInterval(load, pollInterval);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const onRefresh = () => { void load(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('lms:notifications-refresh', onRefresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('lms:notifications-refresh', onRefresh);
    };
  }, [load, pollInterval]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    setLoading(true);
    unlockNotificationAudio();
    // Optimistic: badge hemen sıfırlansın
    const snapshot = recentRef.current;
    setUnreadCount(0);
    setRecent([]);
    knownKeysRef.current = new Set();

    const convIds = new Set<string>();
    for (const n of snapshot) {
      const cid = extractConversationId(n);
      if (cid) convIds.add(cid);
    }
    await Promise.allSettled([
      markAllNotificationsRead(),
      ...[...convIds].map((id) => markConversationRead(id).catch(() => null)),
    ]);
    setLoading(false);
    void load();
  };

  const handleClick = async (n: AppNotification) => {
    unlockNotificationAudio();
    const convId = extractConversationId(n);
    const sameThread = (item: AppNotification) =>
      item.id === n.id || (n.url && item.url === n.url) ||
      (convId != null && extractConversationId(item) === convId);

    // Badge / listeyi hemen güncelle — sayfa yüklenmesini bekleme
    const removedUnread = recentRef.current.filter((item) => sameThread(item) && !item.is_read).length;
    setRecent((prev) => prev.filter((item) => !sameThread(item)));
    setUnreadCount((prev) => Math.max(0, prev - Math.max(1, removedUnread)));
    setOpen(false);
    for (const item of recentRef.current) {
      if (sameThread(item)) knownKeysRef.current.delete(notifFingerprint(item));
    }

    const tasks: Promise<unknown>[] = [];
    for (const item of recentRef.current) {
      if (!sameThread(item) || item.is_read) continue;
      if (!item.id.startsWith('wa-')) {
        tasks.push(markNotificationRead(item.id));
      }
    }
    if (convId) {
      tasks.push(markConversationRead(convId).catch(() => null));
    }
    await Promise.allSettled(tasks);

    const rewritten = rewriteConversationInboxUrl(n.url, inboxPortal) || n.url;
    const target = inboxPortal === 'coach' && isBirthdayNotificationUrl(rewritten)
      ? coachBirthdayHref(rewritten)
      : rewritten;
    if (target) {
      window.location.href = target;
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Az önce';
    if (mins < 60) return `${mins} dk`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} saat`;
    const days = Math.floor(hrs / 24);
    return `${days} gün`;
  };

  const branchNames = new Set(recent.map((n) => n.sube_ad).filter(Boolean));
  const showBranch = branchNames.size > 1;
  const quiet = soundMuted || soundVolume === 0;

  return (
    <div className="notif-bell" ref={ref}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={() => {
          unlockNotificationAudio();
          setOpen(!open);
        }}
        title="Bildirimler"
        aria-label="Bildirimler"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-bell-count">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label="Bildirimler">
          <div className="notif-panel-head">
            <div className="notif-panel-title">
              <strong>Bildirimler</strong>
              {unreadCount > 0 && <span className="notif-panel-badge">{unreadCount} yeni</span>}
            </div>
            <div className="notif-panel-tools">
              {unreadCount > 0 && (
                <button type="button" className="notif-mark" onClick={handleMarkAllRead} disabled={loading}>
                  Tümünü oku
                </button>
              )}
              <button
                type="button"
                className="notif-sound-btn"
                onClick={() => {
                  unlockNotificationAudio();
                  const nextMuted = toggleNotificationSoundMuted();
                  setSoundMuted(nextMuted);
                  if (!nextMuted && soundVolume === 0) {
                    handleVolumeChange(70);
                  } else if (!nextMuted) {
                    playNotificationSound();
                  }
                }}
                title={quiet ? 'Sesi aç' : 'Sesi kapat'}
                aria-label={quiet ? 'Sesi aç' : 'Sesi kapat'}
              >
                {quiet ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="notif-volume" onClick={(e) => e.stopPropagation()}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={quiet ? 0 : soundVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              aria-label="Bildirim ses seviyesi"
              title={`Ses: ${quiet ? 0 : soundVolume}%`}
            />
            <span>{quiet ? 0 : soundVolume}%</span>
          </div>

          <div className="notif-list">
            {recent.length === 0 ? (
              <div className="notif-empty">Bildirim yok</div>
            ) : (
              recent.map((n) => {
                const parts = splitTitle(n.baslik);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`notif-row${n.is_read ? '' : ' is-unread'}`}
                    onClick={() => handleClick(n)}
                  >
                    <span className="notif-row-icon" style={{ background: `${n.renk}18`, color: n.renk }}>
                      {n.ikon}
                    </span>
                    <span className="notif-row-body">
                      {parts.kicker ? <span className="notif-kicker">{parts.kicker}</span> : null}
                      <span className="notif-row-title">{parts.title}</span>
                      {n.mesaj ? <span className="notif-row-msg">{n.mesaj}</span> : null}
                      <span className="notif-row-meta">
                        <span>{timeAgo(n.created_at)}</span>
                        {showBranch && n.sube_ad ? <span>{n.sube_ad}</span> : null}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <Link href={allNotificationsHref} className="notif-foot" onClick={() => setOpen(false)}>
            Tüm bildirimleri görüntüle
          </Link>
        </div>
      )}
    </div>
  );
}
