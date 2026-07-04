"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const POLL_FALLBACK_MS = 20_000;

function readKurumId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("3k_active_kurum");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number") return String(parsed);
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === "object" && "id" in parsed && parsed.id != null) {
      return String(parsed.id);
    }
  } catch {
    if (raw.trim()) return raw.trim();
  }
  return null;
}

function readSubeId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("3k_active_sube");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number") return String(parsed);
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
    if (parsed && typeof parsed === "object" && "id" in parsed && parsed.id != null) {
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
 * Koç inbox SSE — bağlantı koparsa 20s polling fallback tetikler.
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
    onFallbackPoll?.();
    fallbackRef.current = setInterval(() => {
      onFallbackPoll?.();
    }, POLL_FALLBACK_MS);
  }, [onFallbackPoll]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const kurumId = readKurumId();
    const subeId = readSubeId();
    const params = new URLSearchParams();
    if (kurumId) params.set("kurum_id", kurumId);
    if (subeId) params.set("sube_id", subeId);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const url = `/api/communication/events/stream/${qs}`;

    let closed = false;

    try {
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        if (closed) return;
        setConnected(true);
        stopFallback();
      });

      es.addEventListener("new_message", (ev) => {
        if (closed) return;
        try {
          const data = JSON.parse((ev as MessageEvent).data) as CommunicationSSEPayload;
          onUpdate?.(data);
        } catch {
          onFallbackPoll?.();
        }
      });

      es.addEventListener("heartbeat", () => {
        if (closed) return;
        setConnected(true);
      });

      es.onerror = () => {
        if (closed) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        startFallback();
      };
    } catch {
      startFallback();
    }

    return () => {
      closed = true;
      esRef.current?.close();
      esRef.current = null;
      stopFallback();
      setConnected(false);
    };
  }, [enabled, onUpdate, onFallbackPoll, startFallback, stopFallback]);

  return { connected, usingFallback };
}
