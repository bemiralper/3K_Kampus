'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  fetchNotifications,
  markNotificationRead,
  type AppNotification,
} from '@/lib/takvim-api';
import { isGorevNotification } from '@/lib/gorev-notifications';
import { playNotificationSound } from '@/lib/notification-sound';
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
  const knownRef = useRef<Set<string>>(new Set());
  const readyRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);

  const listHref = pathname.startsWith('/coach')
    ? '/coach/gorevler'
    : pathname.startsWith('/muhasebe')
      ? '/muhasebe/gorevler'
      : '/admin/gorevler';

  const load = useCallback(async () => {
    const res = await fetchNotifications(true, 30, 'gorev');
    const rows = (res.success && res.data ? res.data : []).filter(isGorevNotification);
    if (readyRef.current) {
      const fresh = rows.filter(n => !knownRef.current.has(n.id));
      if (fresh.length > 0) playNotificationSound();
    } else {
      readyRef.current = true;
    }
    knownRef.current = new Set(rows.map(n => n.id));
    setItems(rows);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, pollInterval);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onVis);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onVis);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, pollInterval]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const dismiss = async (item: AppNotification, navigate: boolean) => {
    setItems(prev => prev.filter(n => n.id !== item.id));
    knownRef.current.delete(item.id);
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
        onClick={() => setOpen(v => !v)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12h6M9 16h6" />
        </svg>
        {items.length > 0 && (
          <span className="gorev-bell-badge">{items.length > 9 ? '9+' : items.length}</span>
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
            <p className="gorev-bell-empty">Yeni görev bildirimi yok.</p>
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
