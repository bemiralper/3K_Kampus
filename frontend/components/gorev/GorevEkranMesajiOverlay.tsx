'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  fetchScreenNotifications,
  markScreenNotificationShown,
  type AppNotification,
} from '@/lib/takvim-api';
import { playNotificationSound } from '@/lib/notification-sound';
import { useKurum } from '@/lib/contexts/KurumContext';
import '@/components/gorev/gorev.css';

const SESSION_SOUND_KEY = 'gorev-ekran-sound-played';

export default function GorevEkranMesajiOverlay() {
  const router = useRouter();
  const { loading: kurumLoading, activeKurum } = useKurum();
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const [current, setCurrent] = useState<AppNotification | null>(null);
  const shownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (kurumLoading || !activeKurum) return;

    let cancelled = false;
    let attempt = 0;

    const load = async () => {
      const res = await fetchScreenNotifications();
      if (cancelled) return;

      if (res.success && res.data?.length) {
        const fresh = res.data.filter(n => !shownIdsRef.current.has(n.id));
        if (fresh.length > 0) {
          setQueue(prev => {
            const merged = [...prev];
            for (const n of fresh) {
              if (!merged.some(m => m.id === n.id)) merged.push(n);
            }
            return merged;
          });
          setCurrent(prev => prev ?? fresh[0]);
          if (!sessionStorage.getItem(SESSION_SOUND_KEY)) {
            playNotificationSound();
            sessionStorage.setItem(SESSION_SOUND_KEY, '1');
          }
        }
        return;
      }

      if (attempt < 4) {
        attempt += 1;
        setTimeout(load, 400 * attempt);
      }
    };

    load();
    const pollId = setInterval(load, 45000);

    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, [kurumLoading, activeKurum?.id]);

  const dismiss = async (goToTask = false) => {
    if (!current) return;
    const url = current.url;
    shownIdsRef.current.add(current.id);
    await markScreenNotificationShown(current.id);
    const remaining = queue.filter(n => n.id !== current.id);
    setQueue(remaining);
    if (remaining.length > 0) {
      setCurrent(remaining[0]);
    } else {
      setCurrent(null);
      if (goToTask && url) router.push(url);
    }
  };

  if (!current) return null;

  return (
    <div className="gorev-ekran-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="gorev-ekran-title">
      <div className="gorev-ekran-modal" style={{ borderTopColor: current.renk || '#3b82f6' }}>
        <div className="gorev-ekran-icon" style={{ background: current.renk || '#3b82f6' }}>
          {current.ikon || '📋'}
        </div>
        <h2 id="gorev-ekran-title" className="gorev-ekran-title">{current.baslik}</h2>
        <p className="gorev-ekran-mesaj">{current.mesaj}</p>
        {queue.length > 1 && (
          <p className="gorev-ekran-count">+{queue.length - 1} bildirim daha</p>
        )}
        <div className="gorev-ekran-actions">
          <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => dismiss(false)}>
            Kapat
          </button>
          {current.url && (
            <button type="button" className="gorev-btn gorev-btn-primary" onClick={() => dismiss(true)}>
              Göreve Git
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
