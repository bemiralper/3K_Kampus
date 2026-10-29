"use client";

import { useEffect, useRef } from "react";

const IDLE_MS = 30 * 60 * 1000;
const ACTIVITY_STORAGE_KEY = "3k_last_activity_at";

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
] as const;

// sessionStorage sekmeler arasında paylaşılmaz. Boştaki sekme kendi sayacına
// bakıp herkesin oturumunu kapatıyordu. Son hareket localStorage'da durur.
let memoryActivity = 0;

function readLastActivity(): number {
  let latest = memoryActivity;
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed)) latest = Math.max(latest, parsed);
  } catch {
    /* gizli pencere veya engelli depolama */
  }
  return latest || Date.now();
}

function writeLastActivity(ts: number) {
  memoryActivity = Math.max(memoryActivity, ts);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(memoryActivity));
  } catch {
    /* ignore */
  }
}

export function touchActivity() {
  writeLastActivity(Date.now());
}

export function isIdleTimedOut(): boolean {
  return Date.now() - readLastActivity() >= IDLE_MS;
}

/**
 * 30 dk boyunca hiçbir sekmede işlem yoksa onIdle çağrılır.
 * Bir sekmedeki fare, klavye veya kaydırma diğer sekmelerin sayacını da yeniler.
 */
export function useIdleTimeout(onIdle: () => void, enabled = true) {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    try {
      sessionStorage.removeItem(ACTIVITY_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    writeLastActivity(Date.now());

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (debounceTimer) return;
      writeLastActivity(Date.now());
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
      }, 5000);
    };

    const interval = window.setInterval(() => {
      if (!isIdleTimedOut()) return;
      onIdleRef.current();
    }, 30_000);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== ACTIVITY_STORAGE_KEY || event.newValue == null) return;
      const parsed = Number(event.newValue);
      if (!Number.isFinite(parsed)) return;
      memoryActivity = Math.max(memoryActivity, parsed);
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("storage", onStorage);

    return () => {
      window.clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled]);
}
