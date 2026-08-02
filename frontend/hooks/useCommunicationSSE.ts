'use client';

import { useEffect, useRef, useState } from 'react';

const POLL_FALLBACK_MS = 20_000;
const SSE_RECONNECT_MS = 1_500;
const SSE_MAX_RECONNECTS = 8;
/** Sunucuda stream slotu yokken bir süre yeniden denemeyip yoklamada kalınır. */
const SSE_RETRY_AFTER_FALLBACK_MS = 5 * 60_000;

export interface CommunicationSSEPayload {
  unread_count?: number;
  unread_conversations?: number;
}

type UpdateListener = (data: CommunicationSSEPayload) => void;
type PollListener = () => void;
type StatusListener = (status: { connected: boolean; usingFallback: boolean }) => void;

/**
 * Uygulama genelinde tek EventSource — sync gunicorn worker'larını tüketmemek için.
 * NotificationBell + MesajlarClient aynı bağlantıyı paylaşır.
 */
const shared = {
  refCount: 0,
  es: null as EventSource | null,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  fallbackTimer: null as ReturnType<typeof setInterval> | null,
  reconnectCount: 0,
  connected: false,
  usingFallback: false,
  updateListeners: new Set<UpdateListener>(),
  pollListeners: new Set<PollListener>(),
  statusListeners: new Set<StatusListener>(),
};

function readKurumId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('3k_active_kurum');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number') return String(parsed);
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === 'object' && 'id' in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function readSubeId(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('3k_active_sube');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'number') return String(parsed);
    if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === 'object' && 'id' in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function emitStatus() {
  const status = { connected: shared.connected, usingFallback: shared.usingFallback };
  shared.statusListeners.forEach((fn) => {
    try { fn(status); } catch { /* ignore */ }
  });
}

function stopFallback() {
  if (shared.fallbackTimer) {
    clearInterval(shared.fallbackTimer);
    shared.fallbackTimer = null;
  }
  if (shared.usingFallback) {
    shared.usingFallback = false;
    emitStatus();
  }
}

function startFallback() {
  if (shared.fallbackTimer) return;
  shared.usingFallback = true;
  emitStatus();
  shared.pollListeners.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
  shared.fallbackTimer = setInterval(() => {
    shared.pollListeners.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
  }, POLL_FALLBACK_MS);
}

function clearReconnectTimer() {
  if (shared.reconnectTimer) {
    clearTimeout(shared.reconnectTimer);
    shared.reconnectTimer = null;
  }
}

function buildUrl() {
  const kurumId = readKurumId();
  const subeId = readSubeId();
  const params = new URLSearchParams();
  if (kurumId) params.set('kurum_id', kurumId);
  if (subeId) params.set('sube_id', subeId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return `/api/communication/events/stream/${qs}`;
}

function handleInboxEvent(ev: Event) {
  try {
    const data = JSON.parse((ev as MessageEvent).data) as CommunicationSSEPayload;
    shared.updateListeners.forEach((fn) => {
      try { fn(data); } catch { /* ignore */ }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('lms:communication-inbox', { detail: data }));
      window.dispatchEvent(new Event('lms:notifications-refresh'));
    }
  } catch {
    shared.pollListeners.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
  }
}

function connectShared() {
  if (typeof window === 'undefined' || shared.refCount <= 0) return;
  try {
    shared.es?.close();
    const es = new EventSource(buildUrl(), { withCredentials: true });
    shared.es = es;

    es.addEventListener('connected', () => {
      shared.reconnectCount = 0;
      shared.connected = true;
      stopFallback();
      emitStatus();
    });

    es.addEventListener('new_message', handleInboxEvent);
    es.addEventListener('conversation_updated', handleInboxEvent);
    es.addEventListener('conversation_claimed', handleInboxEvent);
    es.addEventListener('sla_breach', handleInboxEvent);

    es.addEventListener('heartbeat', () => {
      shared.connected = true;
      emitStatus();
    });

    es.addEventListener('fallback', () => {
      // Sunucu stream kapasitesi dolu: bağlantıyı zorlamak yerine yoklamaya geç.
      es.close();
      if (shared.es === es) shared.es = null;
      shared.connected = false;
      shared.reconnectCount = 0;
      startFallback();
      clearReconnectTimer();
      shared.reconnectTimer = setTimeout(connectShared, SSE_RETRY_AFTER_FALLBACK_MS);
    });

    es.addEventListener('reconnect', () => {
      es.close();
      if (shared.es === es) shared.es = null;
      shared.connected = false;
      emitStatus();
      clearReconnectTimer();
      shared.reconnectTimer = setTimeout(connectShared, SSE_RECONNECT_MS);
    });

    es.onerror = () => {
      shared.connected = false;
      emitStatus();
      es.close();
      if (shared.es === es) shared.es = null;

      shared.reconnectCount += 1;
      if (shared.reconnectCount <= SSE_MAX_RECONNECTS) {
        clearReconnectTimer();
        shared.reconnectTimer = setTimeout(
          connectShared,
          SSE_RECONNECT_MS * shared.reconnectCount,
        );
      } else {
        startFallback();
      }
    };
  } catch {
    startFallback();
  }
}

function acquireShared() {
  shared.refCount += 1;
  if (shared.refCount === 1) {
    connectShared();
  }
}

function releaseShared() {
  shared.refCount = Math.max(0, shared.refCount - 1);
  if (shared.refCount === 0) {
    clearReconnectTimer();
    stopFallback();
    shared.es?.close();
    shared.es = null;
    shared.connected = false;
    shared.reconnectCount = 0;
    emitStatus();
  }
}

interface UseCommunicationSSEOptions {
  enabled?: boolean;
  onUpdate?: (data: CommunicationSSEPayload) => void;
  onFallbackPoll?: () => void;
}

/**
 * Koç inbox SSE — uygulama genelinde tek bağlantı (refcount).
 * Sync gunicorn'da sayfa başına birden fazla EventSource worker'ı kilitlemesin.
 */
export function useCommunicationSSE({
  enabled = true,
  onUpdate,
  onFallbackPoll,
}: UseCommunicationSSEOptions = {}) {
  const [connected, setConnected] = useState(shared.connected);
  const [usingFallback, setUsingFallback] = useState(shared.usingFallback);
  const onUpdateRef = useRef(onUpdate);
  const onFallbackPollRef = useRef(onFallbackPoll);
  onUpdateRef.current = onUpdate;
  onFallbackPollRef.current = onFallbackPoll;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const updateFn: UpdateListener = (data) => onUpdateRef.current?.(data);
    const pollFn: PollListener = () => onFallbackPollRef.current?.();
    const statusFn: StatusListener = (status) => {
      setConnected(status.connected);
      setUsingFallback(status.usingFallback);
    };

    shared.updateListeners.add(updateFn);
    shared.pollListeners.add(pollFn);
    shared.statusListeners.add(statusFn);
    acquireShared();
    setConnected(shared.connected);
    setUsingFallback(shared.usingFallback);

    return () => {
      shared.updateListeners.delete(updateFn);
      shared.pollListeners.delete(pollFn);
      shared.statusListeners.delete(statusFn);
      releaseShared();
    };
  }, [enabled]);

  return { connected, usingFallback };
}
