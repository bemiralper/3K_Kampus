'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  fetchNotifications, markNotificationRead, markAllNotificationsRead,
  type AppNotification,
} from '@/lib/takvim-api';
import {
  resolveInboxPortal,
  rewriteConversationInboxUrl,
} from '@/lib/communication-api';
import { coachBirthdayHref, isBirthdayNotificationUrl } from '@/lib/coach-birthdays';
import { isGorevNotification } from '@/lib/gorev-notifications';
import './bildirimler.css';

type ReadFilter = 'all' | 'unread';
type KindFilter = 'all' | 'whatsapp' | 'sla' | 'birthday';

function notificationKind(n: AppNotification): KindFilter {
  const title = n.baslik.toLocaleLowerCase('tr');
  const url = n.url || '';
  if (title.includes('cevapsız')) return 'sla';
  if (title.startsWith('whatsapp') || url.includes('sohbet')) return 'whatsapp';
  if (title.includes('doğum') || n.ikon === '🎂') return 'birthday';
  return 'all';
}

const KIND_LABEL: Record<KindFilter, string> = {
  all: 'Diğer',
  whatsapp: 'WhatsApp',
  sla: 'Cevapsız sohbet',
  birthday: 'Doğum günü',
};

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Daha eski';
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diff <= 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  return 'Daha eski';
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Az önce';
  if (min < 60) return `${min} dk önce`;
  const hour = Math.round(min / 60);
  if (hour < 24) return `${hour} sa önce`;
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function targetFor(n: AppNotification, pathname: string): string {
  const portal = resolveInboxPortal(pathname);
  const rewritten = rewriteConversationInboxUrl(n.url, portal) || n.url;
  if (portal === 'coach' && isBirthdayNotificationUrl(rewritten)) {
    return coachBirthdayHref(rewritten);
  }
  return rewritten;
}

export default function BildirimlerClient({ variant = 'default' }: { variant?: 'default' | 'coach' }) {
  const isCoach = variant === 'coach';
  const pathname = usePathname() || '';
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sube, setSube] = useState('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchNotifications(false, 100);
    if (res.success && res.data) {
      setNotifications(res.data.filter(n => !isGorevNotification(n)));
    } else {
      setNotifications([]);
      setError(res.error || 'Bildirimler yüklenemedi.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const branches = useMemo(() => {
    const names = new Set<string>();
    notifications.forEach(n => {
      if (n.sube_ad) names.add(n.sube_ad);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [notifications]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');
    return notifications.filter(n => {
      if (readFilter === 'unread' && n.is_read) return false;
      const itemKind = notificationKind(n);
      if (kind !== 'all' && itemKind !== kind) return false;
      if (sube === 'none' && n.sube_ad) return false;
      if (sube !== 'all' && sube !== 'none' && n.sube_ad !== sube) return false;
      if (!needle) return true;
      const hay = `${n.baslik} ${n.mesaj} ${n.sube_ad || ''}`.toLocaleLowerCase('tr');
      return hay.includes(needle);
    });
  }, [notifications, readFilter, kind, sube, query]);

  const groups = useMemo(() => {
    const order = ['Bugün', 'Dün', 'Daha eski'];
    const buckets = new Map<string, AppNotification[]>();
    visible.forEach(n => {
      const label = dayLabel(n.created_at);
      const list = buckets.get(label) || [];
      list.push(n);
      buckets.set(label, list);
    });
    return order.filter(label => buckets.has(label)).map(label => ({
      label,
      items: buckets.get(label) || [],
    }));
  }, [visible]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const handleReadAll = async () => {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setToast('Tüm bildirimler okundu olarak işaretlendi');
  };

  const openNotification = (n: AppNotification) => {
    if (!n.is_read) void handleRead(n.id);
    const target = targetFor(n, pathname);
    if (n.sube_id) {
      try {
        const currentSube = localStorage.getItem('3k_active_sube');
        if (currentSube !== String(n.sube_id)) {
          localStorage.setItem('3k_active_sube', String(n.sube_id));
          if (target) {
            window.location.href = target;
            return;
          }
        }
      } catch {}
    }
    if (target) router.push(target);
  };

  return (
    <div className={isCoach ? 'coach-bildirim-root ntf-page' : 'ntf-page'}>
      {toast ? <div className="ntf-toast">{toast}</div> : null}

      <div className="ntf-toolbar">
        <input
          className="ntf-search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Kişi, mesaj veya şube ara"
          aria-label="Bildirim ara"
        />
        <div className="ntf-seg" role="group" aria-label="Okunma">
          {(['all', 'unread'] as const).map(f => (
            <button
              key={f}
              type="button"
              aria-pressed={readFilter === f}
              className={readFilter === f ? 'is-on' : undefined}
              onClick={() => setReadFilter(f)}
            >
              {f === 'all' ? 'Tümü' : 'Okunmamış'}
            </button>
          ))}
        </div>
        {unreadCount > 0 ? (
          <button type="button" className="ntf-mark" onClick={() => void handleReadAll()}>
            Tümünü oku
          </button>
        ) : null}
      </div>

      <div className="ntf-chips" role="group" aria-label="Tür">
        {([
          ['all', 'Hepsi'],
          ['whatsapp', 'WhatsApp'],
          ['sla', 'Cevapsız'],
          ['birthday', 'Doğum günü'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={kind === id}
            className={kind === id ? 'is-on' : undefined}
            onClick={() => setKind(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {branches.length > 0 ? (
        <div className="ntf-chips" role="group" aria-label="Şube">
          <button type="button" aria-pressed={sube === 'all'} className={sube === 'all' ? 'is-on' : undefined} onClick={() => setSube('all')}>
            Tüm şubeler
          </button>
          {branches.map(name => (
            <button
              key={name}
              type="button"
              aria-pressed={sube === name}
              className={sube === name ? 'is-on' : undefined}
              onClick={() => setSube(name)}
            >
              {name}
            </button>
          ))}
          <button type="button" aria-pressed={sube === 'none'} className={sube === 'none' ? 'is-on' : undefined} onClick={() => setSube('none')}>
            Şubesi yok
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="ntf-loading" role="status">Yükleniyor…</div>
      ) : error ? (
        <div className="ntf-empty ntf-error" role="alert">
          <strong>Bildirimler yüklenemedi</strong>
          <p>{error}</p>
          <button type="button" className="ntf-retry" onClick={() => void load()}>Yeniden dene</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="ntf-empty">
          <strong>{query || kind !== 'all' || sube !== 'all' || readFilter === 'unread' ? 'Bu süzgeçte bildirim yok' : 'Henüz bildirim yok'}</strong>
          Yeni WhatsApp ve hatırlatmalar burada listelenir. Görevler üst çubuktaki görev simgesindedir.
        </div>
      ) : (
        groups.map(group => (
          <section key={group.label}>
            <h2 className="ntf-group">{group.label}</h2>
            <div className="ntf-list">
              {group.items.map(n => {
                const itemKind = notificationKind(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={n.is_read ? 'ntf-card is-read' : 'ntf-card is-unread'}
                    onClick={() => openNotification(n)}
                  >
                    <span className="ntf-icon" style={{ background: `${n.renk || '#0061A6'}22` }} aria-hidden>
                      {n.ikon || '🔔'}
                    </span>
                    <span>
                      <h2>{n.baslik}</h2>
                      <span className="ntf-meta">
                        {n.sube_ad ? <span className="ntf-pill">{n.sube_ad}</span> : null}
                        <span className="ntf-pill ntf-pill--mute">{KIND_LABEL[itemKind]}</span>
                        <span className="ntf-pill ntf-pill--mute">{relativeTime(n.created_at)}</span>
                      </span>
                      <p className="ntf-body">{n.mesaj}</p>
                    </span>
                    {!n.is_read ? <span className="ntf-dot" aria-label="Okunmamış" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
