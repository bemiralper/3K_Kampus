"use client";

import { tipLabel } from "@/app/finans/types/payment-method-types";

/** Ödeme yöntemi — düz metin, arka plansız */
export default function FinansOdemeTipCell({
  tip,
  ad,
}: {
  tip?: string | null;
  ad?: string | null;
}) {
  const label = ad || (tip ? tipLabel(tip) : null);
  if (!label) return <span className="cell-secondary">—</span>;
  return <span className="cell-secondary">{label}</span>;
}
