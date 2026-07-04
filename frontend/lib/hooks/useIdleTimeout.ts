"use client";

import { useEffect, useRef } from "react";

const IDLE_MS = 15 * 60 * 1000;
const ACTIVITY_STORAGE_KEY = "3k_last_activity_at";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

function readLastActivity(): number {
  if (typeof window === "undefined") return Date.now();
  const raw = sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function writeLastActivity(ts: number) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function touchActivity() {
  writeLastActivity(Date.now());
}

/**
 * 15 dk işlem yoksa onIdle çağrılır (logout + login yönlendirmesi).
 */
export function useIdleTimeout(onIdle: () => void, enabled = true) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    writeLastActivity(Date.now());

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (debounceTimer) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        writeLastActivity(Date.now());
      }, 5000);
    };

    const interval = window.setInterval(() => {
      const idleFor = Date.now() - readLastActivity();
      if (idleFor >= IDLE_MS) {
        onIdleRef.current();
      }
    }, 30_000);

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}
