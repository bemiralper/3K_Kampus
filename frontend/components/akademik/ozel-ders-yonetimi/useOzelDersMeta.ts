'use client';

import { useEffect, useState } from 'react';
import { fetchOzelDersMeta, type OzelDersMeta } from '@/lib/ozel-ders-api';
import { useKurum } from '@/lib/contexts/KurumContext';

export function useOzelDersMeta() {
  const { activeKurum, activeSube, activeEgitimYili, initialized } = useKurum();
  const [meta, setMeta] = useState<OzelDersMeta | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initialized || !activeKurum || !activeSube) return;
    let cancelled = false;
    fetchOzelDersMeta()
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Meta yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [initialized, activeKurum, activeSube]);

  return {
    meta,
    error,
    ready: Boolean(initialized && activeKurum && activeSube),
    egitimYiliId: activeEgitimYili?.id ?? null,
  };
}
