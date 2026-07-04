// ─── Dashboard overview helpers ─────────────────────────────────

export const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

export const fmtTutar = (n: number) =>
  Number(n || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("tr-TR");
  } catch {
    return d;
  }
};

export const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
};

export const fmtSaat = (d: string | null | undefined) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
};

export type VadeDurumu = "gecikmis" | "bugun" | "yakin" | "normal";

export const VADE_BORDER: Record<VadeDurumu, string> = {
  gecikmis: "#dc2626",
  bugun: "#d97706",
  yakin: "#2563eb",
  normal: "#e5e7eb",
};

export const CHART_COLORS = [
  "#0262a7",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#64748b",
];
