"use client";

import { useMemo } from "react";
import { useKurum } from "@/lib/contexts/KurumContext";
import {
  buildPreviewContext,
  PreviewSampleContext,
} from "./composer-utils";

/**
 * WhatsApp önizleme değişkenleri — aktif kurum/şube adını canlı kullanır.
 * Şube adı değişince (liste yenilendiyse) {{sube}} yeni adı gösterir.
 */
export function useLivePreviewContext(
  extra?: PreviewSampleContext | null,
): Record<string, string> {
  const { activeKurum, activeSube, kurumlar, subeler } = useKurum();

  return useMemo(() => {
    const kurum =
      (activeKurum?.id != null
        ? kurumlar.find((k) => k.id === activeKurum.id)
        : null) || activeKurum;
    const sube =
      (activeSube?.id != null
        ? subeler.find((s) => s.id === activeSube.id)
        : null) || activeSube;

    // Gönderim anı (variable_resolver) Sube.ad / Kurum.ad kullanır — önizleme aynı olmalı.
    return buildPreviewContext({
      kurum_ad: kurum?.ad || kurum?.gorunen_ad || "",
      sube: sube?.ad || sube?.gorunen_ad || "",
      ...(extra || {}),
    });
  }, [
    activeKurum?.id,
    activeKurum?.ad,
    activeKurum?.gorunen_ad,
    activeSube?.id,
    activeSube?.ad,
    activeSube?.gorunen_ad,
    kurumlar,
    subeler,
    extra,
  ]);
}
