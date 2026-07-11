import { useEffect, useMemo, useState } from "react";
import type { MesaiSaati, MaasPlaniSatiri, OzetMetrikleri } from "../types";
import { calcOzetMetrikleri } from "../lib/contractCalc";
import { previewHesap } from "../services/api";

export interface SozlesmeHesapInput {
  maas_plani: MaasPlaniSatiri[];
  mesai_saatleri: MesaiSaati[];
  ders_birim_ucret: number;
  ders_ucret_tipi: string;
  sgk_gun: number;
  haftalik_calisma_gun_sayisi: number;
  baslangic_tarihi?: string;
  bitis_tarihi: string;
}

export function useSozlesmeHesap(input: SozlesmeHesapInput, serverOzet?: OzetMetrikleri | null) {
  const localOzet = useMemo(
    () =>
      calcOzetMetrikleri({
        maas_plani: input.maas_plani || [],
        mesai_saatleri: input.mesai_saatleri || [],
        ders_birim_ucret: input.ders_birim_ucret,
        ders_ucret_tipi: input.ders_ucret_tipi,
        sgk_gun: input.sgk_gun,
        haftalik_calisma_gun: input.haftalik_calisma_gun_sayisi,
        baslangic_tarihi: input.baslangic_tarihi,
        bitis_tarihi: input.bitis_tarihi,
      }),
    [input],
  );

  const [serverSynced, setServerSynced] = useState<OzetMetrikleri | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const res = await previewHesap({
        maas_plani: input.maas_plani,
        mesai_saatleri: input.mesai_saatleri,
        ders_birim_ucret: input.ders_birim_ucret,
        ders_ucret_tipi: input.ders_ucret_tipi,
        sgk_gun: input.sgk_gun,
        haftalik_calisma_gun_sayisi: input.haftalik_calisma_gun_sayisi,
        baslangic_tarihi: input.baslangic_tarihi,
        bitis_tarihi: input.bitis_tarihi,
      });
      if (res.success && res.data) {
        setServerSynced(res.data);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [input]);

  const ozet = serverOzet || serverSynced || localOzet;
  return { ozet, localOzet };
}
