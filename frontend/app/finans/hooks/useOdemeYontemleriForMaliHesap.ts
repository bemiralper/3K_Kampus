"use client";

import { useEffect, useState } from "react";
import { paymentMethodService } from "../services/finans-api";

export type OdemeYontemiDropdownItem = {
  id: number;
  ad: string;
  tip?: string;
  mali_hesap_id?: number | null;
};

/**
 * OPERASYON modu: mali hesap seçildikten sonra o hesaba bağlı yöntemler.
 * maliHesapId yoksa boş dizi (önce hesap seçimi zorunlu).
 */
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

/**
 * PLAN modu: tip başına tek kanal (sözleşme / filtre / «Ödeme Şekli» etiketi).
 * Mali hesaba bağlı kopyalar gelmez.
 */
export function usePlanOdemeYontemleri(
  kurumId: number | undefined | null,
  subeId?: number | null,
): OdemeYontemiDropdownItem[] {
  const [items, setItems] = useState<OdemeYontemiDropdownItem[]>([]);

  useEffect(() => {
    if (!kurumId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    paymentMethodService
      .dropdown(kurumId, undefined, subeId ?? undefined)
      .then((res) => {
        if (!cancelled) setItems(res.odeme_yontemleri || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kurumId, subeId]);

  return items;
}
