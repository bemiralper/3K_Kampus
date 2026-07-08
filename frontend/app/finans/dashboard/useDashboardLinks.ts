"use client";

import { useMemo } from "react";
import { useFinansPath } from "@/components/finans/FinansPathProvider";
import { useOdemePath } from "@/components/odeme-takip/OdemePathProvider";
import type { OverviewTransaction } from "../services/dashboard-api";

/** Dashboard bileşenlerinde tutarlı finans / ödeme takip linkleri. */
export function useDashboardLinks() {
  const { href: finansHref, tahsilatTabHref, isMuhasebeMode } = useFinansPath();
  const { href: odemeBase } = useOdemePath();

  return useMemo(
    () => ({
      isMuhasebeMode,
      odemeTakip: (sozlesmeId?: number) =>
        sozlesmeId ? `${odemeBase()}?sozlesme=${sozlesmeId}` : odemeBase(),
      virman: finansHref("virman"),
      gunSonu: tahsilatTabHref("gun-sonu"),
      vadesiGelenler: tahsilatTabHref("vadesi-gelenler"),
      donemTahsilat: tahsilatTabHref("donem"),
      gecikmisOdemeler: tahsilatTabHref("gecikmis"),
      gelirIslemleri: finansHref("gelir-v2"),
      giderIslemleri: finansHref("gider-v2"),
      gelirGider: finansHref("gelir-v2"),
      cariHesaplar: finansHref("cari-hesaplar-v2"),
      cariDetay: (id: number) => finansHref(`cari-hesaplar-v2/${id}`),
      kasaBanka: finansHref("kasa-banka"),
      cekSenet: finansHref("cek-senet-v2"),
      gelirGiderTanimlar: finansHref("gelir-gider-v2/tanimlar"),
      tahsilatRaporlar: finansHref("tahsilat-raporlar"),
      /** Vadesi gelen / tahsilat satırı için uygun hedef. */
      tahsilatAction: (row: Pick<OverviewTransaction, "kaynak" | "sozlesme_id" | "gelir_id" | "gider_id" | "cari_hesap_id">) => {
        if (row.kaynak === "gider" || row.kaynak === "gider_kayit" || row.gider_id) {
          return { href: finansHref("gider-v2"), label: "Gider" };
        }
        if (row.sozlesme_id) {
          return { href: `${odemeBase()}?sozlesme=${row.sozlesme_id}`, label: "Tahsilat" };
        }
        if (row.gelir_id) {
          return { href: finansHref("gelir-v2"), label: "Gelir" };
        }
        if (row.cari_hesap_id) {
          return { href: finansHref(`cari-hesaplar-v2/${row.cari_hesap_id}`), label: "Cari" };
        }
        return null;
      },
      /** Son tahsilat / hareket satırı detay linki. */
      tahsilatDetay: (row: Pick<OverviewTransaction, "kaynak" | "sozlesme_id" | "gelir_id" | "gider_id" | "cari_hesap_id">) => {
        if (row.kaynak === "gider" || row.kaynak === "gider_kayit" || row.gider_id) return finansHref("gider-v2");
        if (row.sozlesme_id) return `${odemeBase()}?sozlesme=${row.sozlesme_id}`;
        if (row.gelir_id) return finansHref("gelir-v2");
        if (row.cari_hesap_id) return finansHref(`cari-hesaplar-v2/${row.cari_hesap_id}`);
        return null;
      },
    }),
    [finansHref, odemeBase, isMuhasebeMode, tahsilatTabHref],
  );
}
