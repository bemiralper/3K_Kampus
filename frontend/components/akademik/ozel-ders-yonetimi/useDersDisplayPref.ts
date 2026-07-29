'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'ozel-ders-use-kisa-ad';
const SURE_KEY = 'ozel-ders-default-sure-dk';
const START_KEY = 'ozel-ders-grid-start';
const ARA_KEY = 'ozel-ders-grid-ara-dk';
const ADET_KEY = 'ozel-ders-grid-adet';

function readKisaAdPref(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function useDersDisplayPref() {
  const [useKisaAd, setUseKisaAdState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setUseKisaAdState(readKisaAdPref());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setUseKisaAdState(e.newValue === '1');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setUseKisaAd = useCallback((value: boolean) => {
    setUseKisaAdState(value);
    try {
      localStorage.setItem(KEY, value ? '1' : '0');
      // Aynı sekmedeki diğer od- bileşenleri için
      window.dispatchEvent(new CustomEvent('ozel-ders-kisa-ad', { detail: value }));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') setUseKisaAdState(detail);
    };
    window.addEventListener('ozel-ders-kisa-ad', onCustom);
    return () => window.removeEventListener('ozel-ders-kisa-ad', onCustom);
  }, []);

  return { useKisaAd, setUseKisaAd, hydrated };
}

export function useDefaultSureDk(defaultValue = 50) {
  const [sureDk, setSureDkState] = useState(defaultValue);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SURE_KEY);
      if (raw) {
        const n = Number(raw);
        if (n >= 15 && n <= 180) setSureDkState(n);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setSureDk = useCallback((value: number) => {
    const n = Math.max(15, Math.min(180, Math.round(value)));
    setSureDkState(n);
    try {
      localStorage.setItem(SURE_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, []);

  return { sureDk, setSureDk };
}

export type HaftalikSaatConfig = {
  startTime: string;
  sureDk: number;
  araDk: number;
  dersAdet: number;
};

function readInt(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  } catch {
    return fallback;
  }
}

function writeConfig(next: HaftalikSaatConfig) {
  try {
    localStorage.setItem(START_KEY, next.startTime);
    localStorage.setItem(SURE_KEY, String(next.sureDk));
    localStorage.setItem(ARA_KEY, String(next.araDk));
    localStorage.setItem(ADET_KEY, String(next.dersAdet));
  } catch {
    /* ignore */
  }
}

/** Haftalık şablon grid: başlangıç + ders süresi + ara + ders adedi */
export function useHaftalikSaatConfig(): {
  config: HaftalikSaatConfig;
  setStartTime: (v: string) => void;
  setSureDk: (v: number) => void;
  setAraDk: (v: number) => void;
  setDersAdet: (v: number) => void;
} {
  const [config, setConfig] = useState<HaftalikSaatConfig>({
    startTime: '09:00',
    sureDk: 50,
    araDk: 10,
    dersAdet: 8,
  });

  useEffect(() => {
    try {
      const start = localStorage.getItem(START_KEY) || '09:00';
      setConfig({
        startTime: /^\d{2}:\d{2}$/.test(start) ? start : '09:00',
        sureDk: readInt(SURE_KEY, 50, 15, 180),
        araDk: readInt(ARA_KEY, 10, 0, 60),
        dersAdet: readInt(ADET_KEY, 8, 1, 16),
      });
    } catch {
      /* ignore */
    }
  }, []);

  const setStartTime = useCallback((v: string) => {
    setConfig((prev) => {
      const next = { ...prev, startTime: v || '09:00' };
      writeConfig(next);
      return next;
    });
  }, []);

  const setSureDk = useCallback((v: number) => {
    setConfig((prev) => {
      const next = { ...prev, sureDk: Math.max(15, Math.min(180, Math.round(v) || 50)) };
      writeConfig(next);
      return next;
    });
  }, []);

  const setAraDk = useCallback((v: number) => {
    setConfig((prev) => {
      const next = { ...prev, araDk: Math.max(0, Math.min(60, Math.round(v) || 0)) };
      writeConfig(next);
      return next;
    });
  }, []);

  const setDersAdet = useCallback((v: number) => {
    setConfig((prev) => {
      const next = { ...prev, dersAdet: Math.max(1, Math.min(16, Math.round(v) || 8)) };
      writeConfig(next);
      return next;
    });
  }, []);

  return { config, setStartTime, setSureDk, setAraDk, setDersAdet };
}
