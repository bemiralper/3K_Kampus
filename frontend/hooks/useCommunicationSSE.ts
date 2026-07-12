'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_FALLBACK_MS = 20_000;
const SSE_RECONNECT_MS = 1_500;
const SSE_MAX_RECONNECTS = 8;

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

export interface CommunicationSSEPayload {
  unread_count?: number;
  unread_conversations?: number;
}

interface UseCommunicationSSEOptions {
  enabled?: boolean;
  onUpdate?: (data: CommunicationSSEPayload) => void;
  onFallbackPoll?: () => void;
}

/**
 * Koç inbox SSE — sunucu ~90 sn sonra temiz kapanır; istemci yeniden bağlanır.
 * Ardışık kopmalarda 20s polling fallback'e düşer.
 */
export function useCommunicationSSE({
  enabled = true,
  onUpdate,
  onFallbackPoll,
}: UseCommunicationSSEOptions = {}) {
  const [connected, setConnected] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountRef = useRef(0);
  const onUpdateRef = useRef(onUpdate);
  const onFallbackPollRef = useRef(onFallbackPoll);
  onUpdateRef.current = onUpdate;
  onFallbackPollRef.current = onFallbackPoll;

  const stopFallback = useCallback(() => {
    if (fallbackRef.current) {
      clearInterval(fallbackRef.current);
      fallbackRef.current = null;
    }
    setUsingFallback(false);
  }, []);

  const startFallback = useCallback(() => {
    if (fallbackRef.current) return;
    setUsingFallback(true);
    onFallbackPollRef.current?.();
    fallbackRef.current = setInterval(() => {
      onFallbackPollRef.current?.();
    }, POLL_FALLBACK_MS);
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    let closed = false;

    const buildUrl = () => {
      const kurumId = readKurumId();
      const subeId = readSubeId();
      const params = new URLSearchParams();
      if (kurumId) params.set('kurum_id', kurumId);
      if (subeId) params.set('sube_id', subeId);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return `/api/communication/events/stream/${qs}`;
    };

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const connect = () => {
      if (closed) return;
      try {
        esRef.current?.close();
        const es = new EventSource(buildUrl(), { withCredentials: true });
        esRef.current = es;

        es.addEventListener('connected', () => {
          if (closed) return;
          reconnectCountRef.current = 0;
          setConnected(true);
          stopFallback();
        });

        es.addEventListener('new_message', (ev) => {
          if (closed) return;
          try {
            const data = JSON.parse((ev as MessageEvent).data) as CommunicationSSEPayload;
            onUpdateRef.current?.(data);
          } catch {
            onFallbackPollRef.current?.();
          }
        });

        es.addEventListener('heartbeat', () => {
          if (closed) return;
          setConnected(true);
        });

        es.addEventListener('reconnect', () => {
          // Sunucu bilinçli kapattı — hemen yeniden bağlan
          if (closed) return;
          es.close();
          esRef.current = null;
          setConnected(false);
          clearReconnectTimer();
          reconnectTimerRef.current = setTimeout(connect, SSE_RECONNECT_MS);
        });

        es.onerror = () => {
          if (closed) return;
          setConnected(false);
          es.close();
          if (esRef.current === es) esRef.current = null;

          reconnectCountRef.current += 1;
          if (reconnectCountRef.current <= SSE_MAX_RECONNECTS) {
            clearReconnectTimer();
            reconnectTimerRef.current = setTimeout(connect, SSE_RECONNECT_MS * reconnectCountRef.current);
          } else {
            startFallback();
          }
        };
      } catch {
        startFallback();
      }
    };

    connect();

    return () => {
      closed = true;
      clearReconnectTimer();
      esRef.current?.close();
      esRef.current = null;
      stopFallback();
      setConnected(false);
    };
  }, [enabled, startFallback, stopFallback]);

  return { connected, usingFallback };
}
