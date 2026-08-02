'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchNotificationSummary, markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from '@/lib/takvim-api';
import {
  fetchNotificationSummary as fetchWhatsAppNotificationSummary,
  markConversationRead,
} from '@/lib/communication-api';
import {
  playNotificationSound,
  unlockNotificationAudio,
  bindNotificationAudioUnlock,
} from '@/lib/notification-sound';
import { useCommunicationSSE } from '@/hooks/useCommunicationSSE';

/* ════════════════════════════════════════════
   🔔 BİLDİRİM ÇANI (Header Badge + Dropdown)
   ════════════════════════════════════════════ */

interface Props {
  /** Polling aralığı (ms). SSE yanında yedek; varsayılan 15 sn */
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

export default function NotificationBell({ pollInterval = 15000 }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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
      url: `/admin/iletisim/mesajlar?conversation=${c.id}`,
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
    const filteredBase = baseRecent.filter((n) => !(n.url && waUrls.has(n.url)));
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
      (n) => !n.is_read && n.url && waUrls.has(n.url),
    ).length;
    setUnreadCount(Math.max(0, takvimUnread - waDupInTakvim) + (waUnread || 0));
    setRecent(merged);
  }, []);

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

  useCommunicationSSE({
    onUpdate: () => { void load(); },
    onFallbackPoll: () => { void load(); },
  });

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

    if (n.url) {
      window.location.href = n.url;
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
            padding: '14px 16px', borderBottom: '1px solid #f3f4f6',
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
              <a
                href="/admin/takvim/bildirimler"
                style={{
                  fontSize: 12, color: '#4F46E5', textDecoration: 'none', fontWeight: 500,
                }}
              >
                Tüm bildirimleri görüntüle →
              </a>
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
