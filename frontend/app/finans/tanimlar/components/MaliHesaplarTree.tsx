"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { financialAccountService } from "../../services/finans-api";
import type { MaliHesapAgacSube } from "../../types/financial-account-types";

interface Props {
  kurumId: number;
  subeId?: number;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreateNew: () => void;
  refreshKey: number;
  onLoaded?: (subeler: MaliHesapAgacSube[]) => void;
}

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n || 0);

const TIP_ICON: Record<string, string> = {
  kasa: "💵",
  banka: "🏦",
  pos: "💳",
  sanal_pos: "🌐",
};

export default function MaliHesaplarTree({ kurumId, subeId, selectedId, onSelect, onCreateNew, refreshKey, onLoaded }: Props) {
  const [subeler, setSubeler] = useState<MaliHesapAgacSube[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    financialAccountService
      .agac(kurumId, subeId)
      .then((res) => {
        setSubeler(res.subeler || []);
        setExpanded((prev) => {
          const next = { ...prev };
          for (const s of res.subeler || []) {
            if (next[s.sube_id] === undefined) next[s.sube_id] = true;
          }
          return next;
        });
        onLoaded?.(res.subeler || []);
      })
      .catch((err: any) => setError(err.message || "Mali hesaplar yüklenemedi"))
      .finally(() => setLoading(false));
  }, [kurumId, subeId, onLoaded]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filteredSubeler = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return subeler;
    return subeler
      .map((s) => ({
        ...s,
        hesaplar: s.hesaplar.filter((h) => h.ad.toLowerCase().includes(q)),
      }))
      .filter((s) => s.hesaplar.length > 0);
  }, [subeler, search]);

  const totalHesap = useMemo(() => subeler.reduce((acc, s) => acc + s.hesaplar.length, 0), [subeler]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-gray-50 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-800 m-0">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          Mali Hesaplar
          <span className="text-xs font-normal text-gray-400">({totalHesap})</span>
        </h3>
        <button
          onClick={onCreateNew}
          title="Yeni Mali Hesap"
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer shrink-0"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b border-gray-50">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hesap ara..."
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-6 h-6 border-[3px] border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-xs text-red-500 px-3">{error}</div>
        ) : filteredSubeler.length === 0 ? (
          <div className="text-center py-10 px-3">
            <p className="text-xs text-gray-400">
              {search ? "Sonuç bulunamadı" : "Henüz mali hesap tanımlanmamış"}
            </p>
          </div>
        ) : (
          filteredSubeler.map((sube) => (
            <div key={sube.sube_id} className="mb-1">
              <button
                onClick={() => setExpanded((prev) => ({ ...prev, [sube.sube_id]: !prev[sube.sube_id] }))}
                className="w-full flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer bg-transparent border-none text-left"
              >
                <svg
                  width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth="2.5"
                  className={`transition-transform shrink-0 ${expanded[sube.sube_id] ? "rotate-90" : ""}`}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-sm">📁</span>
                <span className="text-xs font-bold text-gray-600 uppercase tracking-wide flex-1 truncate">{sube.sube_ad}</span>
                <span className="text-[10px] font-semibold text-gray-400">{sube.hesaplar.length}</span>
              </button>

              {expanded[sube.sube_id] && (
                <div className="ml-4 border-l border-gray-100 pl-2">
                  {sube.hesaplar.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-300 italic">Hesap yok</div>
                  ) : (
                    sube.hesaplar.map((hesap) => {
                      const active = hesap.id === selectedId;
                      return (
                        <button
                          key={hesap.id}
                          onClick={() => onSelect(hesap.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg transition-colors cursor-pointer border-none text-left mb-0.5 ${
                            active ? "bg-emerald-50" : "hover:bg-gray-50 bg-transparent"
                          } ${!hesap.aktif_mi ? "opacity-50" : ""}`}
                        >
                          <span className="text-base shrink-0">{TIP_ICON[hesap.tip] || "💼"}</span>
                          <div className="flex-1 min-w-0">
                            <div className={`text-xs font-semibold truncate ${active ? "text-emerald-700" : "text-gray-700"}`}>
                              {hesap.ad}
                            </div>
                            <div className={`text-[11px] font-medium ${hesap.bakiye < 0 ? "text-red-500" : "text-gray-400"}`}>
                              {fmtTL(hesap.bakiye)}
                            </div>
                          </div>
                          {!hesap.aktif_mi && (
                            <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">Pasif</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
