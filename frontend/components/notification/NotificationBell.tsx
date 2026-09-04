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
  fetchNotificationSummary as fetchWhatsAppNotificationSummary,
  markConversationRead,
  resolveInboxPortal,
  type InboxPortal,
} from '@/lib/communication-api';
import {
  playNotificationSound,
  unlockNotificationAudio,
  bindNotificationAudioUnlock,
  isNotificationSoundMuted,
  toggleNotificationSoundMuted,
  getNotificationSoundVolume,
  setNotificationSoundVolume,
} from '@/lib/notification-sound';

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

function notifFingerprint(n: AppNotification): string {
  return `${n.id}|${n.created_at}|${n.mesaj}`;
}

function extractConversationId(n: AppNotification): string | null {
  if (n.id.startsWith('wa-')) return n.id.slice(3);
  if (!n.url) return null;
  try {
    const u = new URL(n.url, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    return u.searchParams.get('conversation');
  } catch {
    const m = n.url.match(/[?&]conversation=([^&]+)/);
    return m?.[1] ? decodeURIComponent(m[1]) : null;
  }
}

function rewriteInboxUrl(url: string | null | undefined, portal: InboxPortal): string | null {
  if (!url) return null;
  const convId = (() => {
    try {
      const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://local');
      return u.searchParams.get('conversation');
    } catch {
      const m = url.match(/[?&]conversation=([^&]+)/);
      return m?.[1] ? decodeURIComponent(m[1]) : null;
    }
  })();
  if (!convId) return url;
  // Bildirim hangi portalın yolunu taşırsa taşısın, kullanıcı bulunduğu portalda kalsın.
  const chatPath = /\/(admin\/iletisim|coach|muhasebe\/iletisim)\/(mesajlar|sohbetler)/;
  if (!chatPath.test(url)) return url;
  return conversationInboxPath(convId, portal);
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
      fetchWhatsAppNotificationSummary().catch(() => null),
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

    const baseRecent = res.success && res.data ? (res.data.recent || []) : [];
    // Aynı sohbet için hem WA kartı hem AppNotification varsa tek satır göster
    const waUrls = new Set(waItems.map((n) => n.url).filter(Boolean));
    const filteredBase = baseRecent
      .map((n) => {
        const rewritten = rewriteInboxUrl(n.url, inboxPortal);
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
        waUrls.has(n.url) || waUrls.has(rewriteInboxUrl(n.url, inboxPortal) || '')
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

    const target = rewriteInboxUrl(n.url, inboxPortal) || n.url;
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          unlockNotificationAudio();
          setOpen(!open);
        }}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: 8, fontSize: 20, lineHeight: 1,
          color: '#6B7280', transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#111827')}
        onMouseLeave={e => (e.currentTarget.style.color = '#6B7280')}
        title="Bildirimler"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 18, height: 18, borderRadius: 9,
            background: '#EF4444', color: '#fff',
            fontSize: 10, fontWeight: 700, lineHeight: '18px',
            textAlign: 'center', padding: '0 4px',
            animation: 'notif-pulse 2s infinite',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 480,
          background: '#fff', borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          zIndex: 9999, overflow: 'hidden',
          animation: 'notif-slideDown 0.2s ease-out',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px 10px',
            gap: 8,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
              🔔 Bildirimler
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 11, background: '#EEF2FF', color: '#4F46E5',
                  padding: '2px 8px', borderRadius: 10, fontWeight: 500,
                }}>
                  {unreadCount} yeni
                </span>
              )}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 12, color: '#4F46E5', fontWeight: 500,
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  Tümünü oku
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 16px 12px',
              borderBottom: '1px solid #f3f4f6',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
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
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                color: '#6B7280',
              }}
              title={soundMuted || soundVolume === 0 ? 'Sesi aç' : 'Sesi kapat'}
              aria-label={soundMuted || soundVolume === 0 ? 'Sesi aç' : 'Sesi kapat'}
            >
              {soundMuted || soundVolume === 0 ? '🔇' : soundVolume < 40 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={soundMuted ? 0 : soundVolume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              aria-label="Bildirim ses seviyesi"
              title={`Ses: ${soundMuted ? 0 : soundVolume}%`}
              style={{
                flex: 1,
                accentColor: '#4F46E5',
                cursor: 'pointer',
                height: 4,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: '#6B7280',
                minWidth: 32,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {soundMuted ? 0 : soundVolume}%
            </span>
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔕</div>
                <div style={{ fontSize: 13 }}>Bildirim yok</div>
              </div>
            ) : (
              recent.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    display: 'flex', gap: 12, padding: '12px 16px',
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: n.is_read ? 'transparent' : '#F0F7FF',
                    borderBottom: '1px solid #f9fafb',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = n.is_read ? '#f9fafb' : '#E0EFFF')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.is_read ? 'transparent' : '#F0F7FF')}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `${n.renk}15`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {n.ikon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: n.is_read ? 400 : 600,
                      color: '#111827', lineHeight: 1.4,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.baslik}
                    </div>
                    <div style={{
                      fontSize: 12, color: '#6B7280', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {n.mesaj}
                    </div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>

                  {!n.is_read && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#3B82F6', flexShrink: 0, marginTop: 6,
                    }} />
                  )}
                </div>
              ))
            )}
          </div>

          {recent.length > 0 && (
            <div style={{
              padding: '10px 16px', borderTop: '1px solid #f3f4f6',
              textAlign: 'center',
            }}>
              <Link
                href={allNotificationsHref}
                onClick={() => setOpen(false)}
                style={{
                  fontSize: 12, color: '#4F46E5', textDecoration: 'none', fontWeight: 500,
                }}
              >
                Tüm bildirimleri görüntüle →
              </Link>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes notif-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        @keyframes notif-slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
