/**
 * Bildirim Şablonları eşlemesi değişince LMS / Meta şablon listelerinin
 * “Aktif” rozetini yenilemek için aynı sekme + çoklu sekme sinyali.
 */
'use client';

import { useEffect, useRef } from 'react';

export const COMM_TEMPLATE_USAGE_EVENT = 'lms:comm-template-usage-changed';
const STORAGE_KEY = 'lms_comm_template_usage_ts';

export function notifyCommunicationTemplateUsageChanged(): void {
  if (typeof window === 'undefined') return;
  const ts = String(Date.now());
  try {
    localStorage.setItem(STORAGE_KEY, ts);
  } catch {
    // private mode vb.
  }
  window.dispatchEvent(new CustomEvent(COMM_TEMPLATE_USAGE_EVENT, { detail: { ts } }));
}

/**
 * Eşleme değişince veya sekme tekrar görünür olunca listeyi yeniden yükler.
 * İlk mount’taki load() ayrı kalır; bu hook yalnızca sonraki yenilemeler içindir.
 */
export function useRefreshOnCommunicationTemplateUsageChange(
  reload: () => void | Promise<void>,
): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const lastTsRef = useRef(0);

  useEffect(() => {
    try {
      lastTsRef.current = Number(localStorage.getItem(STORAGE_KEY) || 0) || 0;
    } catch {
      lastTsRef.current = 0;
    }

    const refreshIfChanged = (force = false) => {
      let ts = 0;
      try {
        ts = Number(localStorage.getItem(STORAGE_KEY) || 0) || 0;
      } catch {
        ts = 0;
      }
      if (!force && ts && ts === lastTsRef.current) return;
      if (ts) lastTsRef.current = ts;
      void reloadRef.current();
    };

    const onCustom = () => refreshIfChanged(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) refreshIfChanged(true);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshIfChanged(false);
    };

    window.addEventListener(COMM_TEMPLATE_USAGE_EVENT, onCustom);
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.removeEventListener(COMM_TEMPLATE_USAGE_EVENT, onCustom);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);
}
