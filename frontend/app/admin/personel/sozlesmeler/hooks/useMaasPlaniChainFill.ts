import { useCallback } from "react";
import type { MaasPlaniSatiri } from "../types";
import { chainFillFromIndex } from "../lib/contractCalc";

export type MaasPlaniField = "maas" | "baslangic_tarihi" | "bitis_tarihi";

export function useMaasPlaniChainFill() {
  const applyChainFill = useCallback(
    (rows: MaasPlaniSatiri[], index: number, field: MaasPlaniField): MaasPlaniSatiri[] => {
      if (field === "maas") {
        return chainFillFromIndex(rows, index, ["maas"]);
      }
      return rows;
    },
    [],
  );

  return { applyChainFill };
}
