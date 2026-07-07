"use client";

import { useEffect, useState } from "react";
import { paymentMethodService } from "../services/finans-api";

export type OdemeYontemiDropdownItem = {
  id: number;
  ad: string;
  tip?: string;
  mali_hesap_id?: number | null;
};

/** Mali hesap seçildikten sonra o hesaba bağlı ödeme yöntemlerini API'den yükler. */
export function useOdemeYontemleriForMaliHesap(
  kurumId: number | undefined | null,
  maliHesapId: number | null | undefined,
  subeId?: number | null,
): OdemeYontemiDropdownItem[] {
  const [odemeYontemleri, setOdemeYontemleri] = useState<OdemeYontemiDropdownItem[]>([]);

  useEffect(() => {
    if (!kurumId || !maliHesapId) {
      setOdemeYontemleri([]);
      return;
    }
    let cancelled = false;
    paymentMethodService
      .dropdown(kurumId, maliHesapId, subeId ?? undefined)
      .then((res) => {
        if (!cancelled) setOdemeYontemleri(res.odeme_yontemleri || []);
      })
      .catch(() => {
        if (!cancelled) setOdemeYontemleri([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kurumId, maliHesapId, subeId]);

  return odemeYontemleri;
}
