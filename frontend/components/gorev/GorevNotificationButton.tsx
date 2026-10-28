'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  fetchNotificationBadge,
  fetchNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/lib/takvim-api';
import { isGorevNotification } from '@/lib/gorev-notifications';
import { playNotificationSound } from '@/lib/notification-sound';
import { createCoalescedRefresh } from '@/lib/coalesced-refresh';
import '@/components/gorev/gorev.css';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} saat`;
  return `${Math.floor(hrs / 24)} gün`;
}

export default function GorevNotificationButton({ pollInterval = 8000 }: { pollInterval?: number }) {
  const pathname = usePathname() || '';
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const knownNewestRef = useRef<string | null>(null);
  const knownCountRef = useRef(0);
  const readyRef = useRef(false);
  const openRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  openRef.current = open;

  const listHref = pathname.startsWith('/coach')
    ? '/coach/gorevler'
    : pathname.startsWith('/muhasebe')
      ? '/muhasebe/gorevler'
      : '/admin/gorevler';

  const loadList = useCallback(async () => {
    const res = await fetchNotifications(true, 30, 'gorev');
    const rows = (res.success && res.data ? res.data : []).filter(isGorevNotification);
    setItems(rows);
    if (rows.length === 0) {
      setCount(0);
      knownCountRef.current = 0;
      knownNewestRef.current = null;
      return;
    }
    knownNewestRef.current = rows[0].id;
  }, []);

  const loadBadge = useCallback(async () => {
    const res = await fetchNotificationBadge('gorev');
    if (!res.success || res.data == null) return;

    const legacyRows = Array.isArray(res.data)
      ? (res.data as AppNotification[]).filter(isGorevNotification)
      : null;
    const unread = legacyRows ? legacyRows.length : (res.data.unread_count ?? 0);
    const newestId = legacyRows ? (legacyRows[0]?.id ?? null) : (res.data.newest_id ?? null);
    const prevCount = knownCountRef.current;
    const prevNewest = knownNewestRef.current;
    if (readyRef.current) {
      const grew = unread > prevCount;
      const replaced = Boolean(newestId && newestId !== prevNewest && unread >= prevCount);
      if (grew || replaced) playNotificationSound();
    } else {
      readyRef.current = true;
    }
    knownCountRef.current = unread;
    knownNewestRef.current = newestId;
    setCount(unread);
    if (unread === 0) {
      setItems([]);
      return;
    }
    if (legacyRows && openRef.current) {
      setItems(legacyRows);
      return;
    }
    if (openRef.current && (unread !== prevCount || newestId !== prevNewest)) {
      await loadList();
    }
  }, [loadList]);

  const loadBadgeRef = useRef(loadBadge);
  loadBadgeRef.current = loadBadge;

  useEffect(() => {
    const refresh = createCoalescedRefresh(() => loadBadgeRef.current(), 1500);
    refresh();
    const id = setInterval(refresh, pollInterval);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      refresh.cancel();
    };
  }, [pollInterval]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const dismiss = async (item: AppNotification, navigate: boolean) => {
    setItems(prev => {
      const next = prev.filter(n => n.id !== item.id);
      if (knownNewestRef.current === item.id) {
        knownNewestRef.current = next[0]?.id ?? null;
      }
      return next;
    });
    setCount(prev => {
      const next = Math.max(0, prev - 1);
      knownCountRef.current = next;
      return next;
    });
    await markNotificationRead(item.id);
    if (navigate && item.url) {
      setOpen(false);
      router.push(item.url);
    }
  };

  return (
    <div className="gorev-bell" ref={ref}>
      <button
        type="button"
        className="gorev-bell-btn"
        aria-label="Görev bildirimleri"
        title="Görevler"
        aria-expanded={open}
        onClick={() => {
          setOpen(v => {
            const next = !v;
            if (next) void loadList();
            return next;
          });
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h6" />
        </svg>
        {count > 0 && (
          <span className="gorev-bell-badge">{count > 9 ? '9+' : count}</span>
        )}
      </button>
      {open && (
        <div className="gorev-bell-panel" role="dialog" aria-label="Görev bildirimleri">
          <div className="gorev-bell-head">
            <strong>Görevler</strong>
            <button type="button" className="gorev-bell-x" aria-label="Kapat" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          {items.length === 0 ? (
            <p className="gorev-bell-empty">
              {count > 0 ? 'Yükleniyor…' : 'Yeni görev bildirimi yok.'}
            </p>
          ) : (
            <ul className="gorev-bell-list">
              {items.map(item => (
                <li key={item.id} className="gorev-bell-item">
                  <button type="button" className="gorev-bell-title" onClick={() => void dismiss(item, true)}>
                    <span className="gorev-bell-icon" aria-hidden>{item.ikon || '📋'}</span>
                    <span>
                      <strong>{item.baslik}</strong>
                      <span className="gorev-bell-time">{timeAgo(item.created_at)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="gorev-bell-dismiss"
                    aria-label="Kapat"
                    onClick={() => void dismiss(item, false)}
                  >
                    Kapat
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link className="gorev-bell-all" href={listHref} onClick={() => setOpen(false)}>Görevlere git</Link>
        </div>
      )}
    </div>
  );
}
