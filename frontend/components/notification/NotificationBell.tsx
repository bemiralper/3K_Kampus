'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchNotificationSummary, markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from '@/lib/takvim-api';
import { playNotificationSound, isGorevNotification } from '@/lib/notification-sound';

/* ════════════════════════════════════════════
   🔔 BİLDİRİM ÇANI (Header Badge + Dropdown)
   ════════════════════════════════════════════ */

interface Props {
  /** Polling aralığı (ms). Varsayılan 30 saniye */
  pollInterval?: number;
}

export default function NotificationBell({ pollInterval = 30000 }: Props) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const knownUnreadIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetchNotificationSummary();
    if (res.success && res.data) {
      const newRecent = res.data.recent;

      if (initializedRef.current) {
        const newGorevNotifs = newRecent.filter(
          n => !n.is_read
            && !knownUnreadIdsRef.current.has(n.id)
            && isGorevNotification(n.baslik, n.url),
        );
        if (newGorevNotifs.length > 0) {
          playNotificationSound();
        }
      } else {
        initializedRef.current = true;
      }

      knownUnreadIdsRef.current = new Set(
        newRecent.filter(n => !n.is_read).map(n => n.id),
      );
      setUnreadCount(res.data.unread_count);
      setRecent(newRecent);
    }
  }, []);

  // İlk yükleme + polling
  useEffect(() => {
    load();
    const id = setInterval(load, pollInterval);
    return () => clearInterval(id);
  }, [load, pollInterval]);

  // Dışarı tıklama
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id);
    setRecent(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    await markAllNotificationsRead();
    setUnreadCount(0);
    setRecent([]);
    knownUnreadIdsRef.current = new Set();
    setLoading(false);
  };

  const handleClick = async (n: AppNotification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setUnreadCount(prev => Math.max(0, prev - 1));
      knownUnreadIdsRef.current.delete(n.id);
    }
    setRecent(prev => prev.filter(item => item.id !== n.id));
    setOpen(false);
    if (n.url) window.location.href = n.url;
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
      {/* Çan Butonu */}
      <button
        onClick={() => setOpen(!open)}
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

      {/* Dropdown Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 480,
          background: '#fff', borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
          zIndex: 9999, overflow: 'hidden',
          animation: 'notif-slideDown 0.2s ease-out',
        }}>
          {/* Header */}
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

          {/* Bildirim Listesi */}
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
                  {/* İkon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `${n.renk}15`, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 18,
                  }}>
                    {n.ikon}
                  </div>

                  {/* İçerik */}
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

                  {/* Okunmamış dot */}
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

          {/* Footer */}
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

      {/* Pulse animasyonu */}
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
