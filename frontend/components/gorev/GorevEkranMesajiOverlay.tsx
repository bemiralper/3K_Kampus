'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { resolveInboxPortal, rewriteConversationInboxUrl } from '@/lib/communication-api';
import { coachBirthdayHref, isBirthdayNotificationUrl } from '@/lib/coach-birthdays';
import {
  dismissAllScreenNotifications,
  fetchScreenNotifications,
  markScreenNotificationShown,
  type AppNotification,
} from '@/lib/takvim-api';
import { playNotificationSound } from '@/lib/notification-sound';
import { useKurum } from '@/lib/contexts/KurumContext';
import { isGorevNotification } from '@/lib/gorev-notifications';
import '@/components/gorev/gorev.css';

const SESSION_SOUND_KEY = 'gorev-ekran-sound-played';

function notificationTarget(url: string, pathname: string): string {
  const portal = resolveInboxPortal(pathname);
  const rewritten = rewriteConversationInboxUrl(url, portal) || url;
  if (portal === 'coach' && isBirthdayNotificationUrl(rewritten)) {
    return coachBirthdayHref(rewritten);
  }
  return rewritten;
}

function rowKind(baslik: string): 'bilgi' | 'gorev' {
  return /bilgilendirme:/i.test(baslik) ? 'bilgi' : 'gorev';
}

function rowTitle(baslik: string): string {
  return baslik.replace(/^(Yeni )?(Bilgilendirme|Görev):\s*/i, '');
}

function actionLabel(url: string): string {
  if (isBirthdayNotificationUrl(url)) return 'Doğum günleri';
  if (url.includes('/gorev')) return 'Göreve git';
  if (url.includes('/coach/ogrenciler/')) return 'Öğrenciye git';
  if (url.includes('/coach/ogrenciler')) return 'Öğrencilerim';
  if (url.includes('sohbet')) return 'Sohbete git';
  return 'Aç';
}

export default function GorevEkranMesajiOverlay() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const { loading: kurumLoading, activeKurum } = useKurum();
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const shownIdsRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);

  useEffect(() => {
    if (kurumLoading || !activeKurum) return;

    let cancelled = false;
    let attempt = 0;

    const load = async () => {
      const res = await fetchScreenNotifications(40);
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
    const onFocus = () => {
      attempt = 0;
      void load();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      window.removeEventListener('focus', onFocus);
    };
  }, [kurumLoading, activeKurum]);

  const dismissOne = async (item: AppNotification, open: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    shownIdsRef.current.add(item.id);
    setQueue(prev => prev.filter(n => n.id !== item.id));
    try {
      await markScreenNotificationShown(item.id);
    } finally {
      busyRef.current = false;
    }
    if (open && item.url) {
      if (item.sube_id) {
        try {
          const currentSube = localStorage.getItem('3k_active_sube');
          if (currentSube !== String(item.sube_id)) {
            localStorage.setItem('3k_active_sube', String(item.sube_id));
            window.location.href = notificationTarget(item.url, pathname);
            return;
          }
        } catch {}
      }
      router.push(notificationTarget(item.url, pathname));
    }
  };

  const dismissGroup = async (items: AppNotification[]) => {
    if (busyRef.current || items.length === 0) return;
    busyRef.current = true;
    const ids = items.map(n => n.id);
    ids.forEach(id => shownIdsRef.current.add(id));
    setQueue(prev => prev.filter(n => !ids.includes(n.id)));
    try {
      await dismissAllScreenNotifications(ids);
    } finally {
      busyRef.current = false;
    }
  };

  if (queue.length === 0) return null;

  const gorevQueue = queue.filter(isGorevNotification);
  const otherQueue = queue.filter(item => !isGorevNotification(item));

  return (
    <>
      {gorevQueue.length > 0 && (
        <div className="gorev-yeni-backdrop" role="dialog" aria-modal="true" aria-labelledby="gorev-yeni-title">
          <div className="gorev-yeni-panel">
            <div className="gorev-yeni-head">
              <h2 id="gorev-yeni-title">
                {gorevQueue.every(item => rowKind(item.baslik) === 'bilgi')
                  ? 'Yeni bilgilendirmeler'
                  : gorevQueue.some(item => rowKind(item.baslik) === 'bilgi')
                    ? 'Yeni gönderiler'
                    : 'Yeni görevler'}
              </h2>
              <button type="button" className="gorev-ekran-close" aria-label="Kapat" onClick={() => void dismissGroup(gorevQueue)}>
                ×
              </button>
            </div>
            <ul className="gorev-yeni-list">
              {gorevQueue.map(item => (
                <li key={item.id}>
                  <button type="button" className="gorev-yeni-row" onClick={() => void dismissOne(item, true)}>
                    <span className="gorev-yeni-icon" aria-hidden>{item.ikon || '📋'}</span>
                    <span className="gorev-yeni-copy">
                      <span className={`gorev-kind ${rowKind(item.baslik) === 'bilgi' ? 'gorev-kind--info' : 'gorev-kind--task'}`}>
                        {rowKind(item.baslik) === 'bilgi' ? 'Bilgilendirme' : 'Görev'}
                      </span>
                      <strong>{rowTitle(item.baslik)}</strong>
                      {item.sube_ad ? <small>{item.sube_ad}</small> : null}
                    </span>
                    <span className="gorev-yeni-go">{rowKind(item.baslik) === 'bilgi' ? 'Aç' : 'Göreve git'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {otherQueue.length > 0 && (
        <div
          className="gorev-ekran-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="gorev-ekran-title"
        >
          <div className="gorev-ekran-modal gorev-ekran-modal--stack">
            <div className="gorev-ekran-stack-head">
              <h2 id="gorev-ekran-title" className="gorev-ekran-title">
                {otherQueue.length === 1 ? 'Ekran mesajı' : `${otherQueue.length} ekran mesajı`}
              </h2>
              <button type="button" className="gorev-ekran-close" aria-label="Kapat" onClick={() => void dismissGroup(otherQueue)}>
                ×
              </button>
            </div>
            <ul className="gorev-ekran-list">
              {otherQueue.map(item => (
                <li key={item.id} className="gorev-ekran-item">
                  <span
                    className="gorev-ekran-item-icon"
                    style={{ background: item.renk || '#3b82f6' }}
                    aria-hidden
                  >
                    {item.ikon || '📋'}
                  </span>
                  <div className="gorev-ekran-item-body">
                    <strong>{item.baslik}</strong>
                    {item.sube_ad ? <span className="gorev-ekran-item-sube">{item.sube_ad}</span> : null}
                    {item.mesaj ? <p>{item.mesaj}</p> : null}
                  </div>
                  <div className="gorev-ekran-item-actions">
                    {item.url ? (
                      <button type="button" className="gorev-btn gorev-btn-primary" onClick={() => dismissOne(item, true)}>
                        {actionLabel(item.url)}
                      </button>
                    ) : null}
                    <button type="button" className="gorev-btn gorev-btn-ghost" onClick={() => dismissOne(item, false)}>
                      Kapat
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="gorev-ekran-actions">
              <button type="button" className="gorev-btn gorev-btn-primary" onClick={() => void dismissGroup(otherQueue)}>
                {otherQueue.length === 1 ? 'Kapat' : 'Tümünü kapat'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
