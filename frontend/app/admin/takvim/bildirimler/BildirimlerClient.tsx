'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from '@/lib/takvim-api';

/* ════════════════════════════════════════════
   BİLDİRİMLER TAM SAYFA
   ════════════════════════════════════════════ */

export default function BildirimlerClient() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchNotifications(filter === 'unread', 100);
    if (res.success && res.data) setNotifications(res.data);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }
  }, [toast]);

  const handleRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setToast('Tüm bildirimler okundu olarak işaretlendi');
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          padding: '12px 20px', borderRadius: 8, background: '#d1fae5',
          color: '#047857', fontWeight: 500, fontSize: 13,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {toast}
        </div>
      )}

      {/* Başlık */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#111827', margin: 0 }}>🔔 Bildirimler</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>
            {unreadCount > 0 ? `${unreadCount} okunmamış bildirim` : 'Tüm bildirimler okunmuş'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            display: 'flex', background: '#f3f4f6', borderRadius: 8, padding: 2,
          }}>
            {(['all', 'unread'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                  background: filter === f ? '#fff' : 'transparent',
                  color: filter === f ? '#111827' : '#6B7280',
                  boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {f === 'all' ? 'Tümü' : 'Okunmamış'}
              </button>
            ))}
          </div>
          {unreadCount > 0 && (
            <button onClick={handleReadAll} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
              background: '#EEF2FF', color: '#4F46E5', border: 'none', cursor: 'pointer',
            }}>
              ✓ Tümünü oku
            </button>
          )}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Yükleniyor...</div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#f9fafb', borderRadius: 12, color: '#9CA3AF' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔕</div>
          <p style={{ fontSize: 14 }}>{filter === 'unread' ? 'Okunmamış bildirim yok' : 'Henüz bildirim yok'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {notifications.map(n => (
            <div
              key={n.id}
              onClick={() => {
                if (!n.is_read) handleRead(n.id);
                if (n.url) window.location.href = n.url;
              }}
              style={{
                display: 'flex', gap: 14, padding: '14px 16px',
                background: n.is_read ? '#fff' : '#F0F7FF',
                borderRadius: 10, border: '1px solid #e5e7eb',
                cursor: n.url ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#c7d2fe'; e.currentTarget.style.transform = 'translateX(2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.transform = 'none'; }}
            >
              {/* İkon */}
              <div style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: `${n.renk}15`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 20,
              }}>
                {n.ikon}
              </div>

              {/* İçerik */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600, color: '#111827' }}>
                  {n.baslik}
                </div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
                  {n.mesaj}
                </div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6 }}>
                  {formatDate(n.created_at)}
                </div>
              </div>

              {/* Okunmamış gösterge */}
              {!n.is_read && (
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#3B82F6', flexShrink: 0, marginTop: 8,
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
