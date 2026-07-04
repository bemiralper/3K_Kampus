"use client";

import { useKurum } from "@/lib/contexts/KurumContext";

interface FinansFilterBarProps {
  children?: React.ReactNode;
  showKurumChips?: boolean;
}

export default function FinansFilterBar({ children, showKurumChips = true }: FinansFilterBarProps) {
  const { activeKurum, activeSube, activeEgitimYili } = useKurum();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
      {showKurumChips && activeKurum && (
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 ring-inset ring-blue-700/10">
            🏢 {activeKurum.ad}
          </span>
          {activeSube && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 ring-inset ring-emerald-700/10">
              🏫 {activeSube.ad}
            </span>
          )}
          {activeEgitimYili && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 text-xs font-medium px-2.5 py-1 rounded-lg ring-1 ring-inset ring-amber-700/10">
              📆 {activeEgitimYili.baslangic_yil}-{activeEgitimYili.bitis_yil}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

export function fmtTL(val: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("tr-TR");
  } catch {
    return d;
  }
}
